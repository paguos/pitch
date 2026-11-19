package api

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"html"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/fifa-tournament/backend/internal/auth"
	"github.com/fifa-tournament/backend/internal/league"
	"github.com/fifa-tournament/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"golang.org/x/oauth2"
)

const (
	sessionCookie = "pitch_session"
	oauthCookie   = "pitch_oauth"
	sessionTTL    = 30 * 24 * time.Hour
)

type ctxKey struct{}

func userFrom(ctx context.Context) (store.User, bool) {
	u, ok := ctx.Value(ctxKey{}).(store.User)
	return u, ok
}

// --- middleware ---

// loadUser attaches the signed-in user (if any) to the request context.
func (a *API) loadUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
			u, err := a.Store.SessionUser(r.Context(), auth.HashToken(c.Value))
			if err == nil {
				r = r.WithContext(context.WithValue(r.Context(), ctxKey{}, u))
			} else if !errors.Is(err, store.ErrNotFound) {
				log.Printf("session lookup: %v", err)
				writeErr(w, 500, "internal error")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := userFrom(r.Context()); !ok {
			writeErr(w, 401, "sign in required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := userFrom(r.Context())
		if !ok {
			writeErr(w, 401, "sign in required")
			return
		}
		if !u.IsAdmin() {
			writeErr(w, 403, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// originCheck is the CSRF guard for state-changing requests: browsers always
// send Origin on cross-origin and same-origin POST/PUT/PATCH/DELETE, so a
// present-but-foreign Origin is refused. Requests without Origin come from
// non-browser clients, which don't carry ambient cookies.
func (a *API) originCheck(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if o := r.Header.Get("Origin"); o != "" && o != a.Cfg.PublicBaseURL && o != a.Cfg.FrontendOrigin {
				writeErr(w, 403, "cross-origin request refused")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// --- cookies ---

func (a *API) setCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: a.Cfg.SecureCookies(), SameSite: http.SameSiteLaxMode,
	})
}

func (a *API) startSession(w http.ResponseWriter, r *http.Request, u store.User) error {
	token, hash, err := auth.NewToken()
	if err != nil {
		return err
	}
	if err := a.Store.CreateSession(r.Context(), u.ID, hash, time.Now().Add(sessionTTL)); err != nil {
		return err
	}
	a.setCookie(w, sessionCookie, token, int(sessionTTL.Seconds()))
	return nil
}

// --- status / setup / login / logout ---

type statusResponse struct {
	SetupRequired bool        `json:"setup_required"`
	GoogleEnabled bool        `json:"google_enabled"`
	User          *store.User `json:"user"`
}

// AuthStatus tells the SPA what to show: the setup screen, the login screen
// or the app (with who is signed in).
func (a *API) AuthStatus(w http.ResponseWriter, r *http.Request) {
	setup, err := a.Store.NeedsSetup(r.Context())
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	resp := statusResponse{SetupRequired: setup, GoogleEnabled: a.Provider != nil}
	if u, ok := userFrom(r.Context()); ok {
		resp.User = &u
	}
	writeJSON(w, 200, resp)
}

type passwordBody struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Setup creates the default admin on a fresh app and signs them in. It only
// works while no admin exists.
func (a *API) Setup(w http.ResponseWriter, r *http.Request) {
	var body passwordBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if utf8.RuneCountInString(body.Password) < auth.MinPasswordLen {
		writeErr(w, 400, "password must be at least 12 characters")
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	u, err := a.Store.CreateBootstrapAdmin(r.Context(), hash)
	if errors.Is(err, store.ErrSetupDone) {
		writeErr(w, 409, "setup already completed")
		return
	}
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	if err := a.startSession(w, r, u); err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	writeJSON(w, 201, u)
}

// Login signs in the default admin with username and password. Failures are
// rate limited per client IP and per username and never say which part failed.
func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var body passwordBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	username := strings.ToLower(strings.TrimSpace(body.Username))
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	ipKey, userKey := "ip:"+ip, "user:"+username
	if a.loginLimiter.Blocked(ipKey) || a.loginLimiter.Blocked(userKey) {
		writeErr(w, 429, "too many attempts, try again later")
		return
	}
	u, hash, err := a.Store.GetUserForLogin(r.Context(), username)
	if errors.Is(err, store.ErrNotFound) {
		hash = a.dummyHash // spend the same time as a real check
	} else if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	ok, verr := auth.VerifyPassword(body.Password, hash)
	if err != nil || verr != nil || !ok {
		a.loginLimiter.Fail(ipKey)
		a.loginLimiter.Fail(userKey)
		writeErr(w, 401, "invalid credentials")
		return
	}
	a.loginLimiter.Reset(ipKey)
	a.loginLimiter.Reset(userKey)
	if err := a.startSession(w, r, u); err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	writeJSON(w, 200, u)
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = a.Store.DeleteSession(r.Context(), auth.HashToken(c.Value))
	}
	a.setCookie(w, sessionCookie, "", -1)
	w.WriteHeader(204)
}

// --- Google sign-in ---

type oauthState struct {
	State    string `json:"s"`
	Nonce    string `json:"n"`
	Verifier string `json:"v"`
}

func (a *API) loginRedirect(w http.ResponseWriter, r *http.Request, errCode string) {
	dest := a.Cfg.PublicBaseURL + "/login"
	if errCode != "" {
		dest += "?error=" + url.QueryEscape(errCode)
	}
	http.Redirect(w, r, dest, http.StatusFound)
}

func (a *API) provider(r *http.Request) (auth.Provider, bool) {
	if a.Provider == nil {
		return nil, false
	}
	p, err := a.Provider(r.Context())
	if err != nil {
		log.Printf("google provider: %v", err)
		return nil, false
	}
	return p, true
}

func (a *API) GoogleStart(w http.ResponseWriter, r *http.Request) {
	p, ok := a.provider(r)
	if !ok {
		a.loginRedirect(w, r, "google_unavailable")
		return
	}
	st := oauthState{State: oauth2.GenerateVerifier(), Nonce: oauth2.GenerateVerifier(), Verifier: oauth2.GenerateVerifier()}
	raw, _ := json.Marshal(st)
	a.setCookie(w, oauthCookie, base64.RawURLEncoding.EncodeToString(raw), 600)
	http.Redirect(w, r, p.AuthURL(st.State, st.Nonce, oauth2.S256ChallengeFromVerifier(st.Verifier)), http.StatusFound)
}

func (a *API) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	defer a.setCookie(w, oauthCookie, "", -1)

	var st oauthState
	c, err := r.Cookie(oauthCookie)
	if err != nil {
		a.loginRedirect(w, r, "failed")
		return
	}
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil || json.Unmarshal(raw, &st) != nil || st.State == "" ||
		subtle.ConstantTimeCompare([]byte(st.State), []byte(r.URL.Query().Get("state"))) != 1 {
		a.loginRedirect(w, r, "failed")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" { // the user denied consent, or Google reported an error
		a.loginRedirect(w, r, "failed")
		return
	}
	p, ok := a.provider(r)
	if !ok {
		a.loginRedirect(w, r, "google_unavailable")
		return
	}
	id, err := p.Exchange(r.Context(), code, st.Verifier, st.Nonce)
	if err != nil || !id.EmailVerified || id.Email == "" {
		if err != nil {
			log.Printf("google exchange: %v", err)
		}
		a.loginRedirect(w, r, "failed")
		return
	}
	u, err := a.Store.GoogleLogin(r.Context(), id.Sub, strings.ToLower(strings.TrimSpace(id.Email)))
	switch {
	case errors.Is(err, store.ErrNotInvited), errors.Is(err, store.ErrSubMismatch):
		log.Printf("google sign-in denied for %s: %v", id.Email, err)
		a.loginRedirect(w, r, "not_invited")
		return
	case err != nil:
		log.Printf("google login: %v", err)
		a.loginRedirect(w, r, "failed")
		return
	}
	if err := a.startSession(w, r, u); err != nil {
		a.loginRedirect(w, r, "failed")
		return
	}
	http.Redirect(w, r, a.Cfg.PublicBaseURL+"/", http.StatusFound)
}

// fakeGooglePage is the dev-only stand-in for Google's consent screen.
func (a *API) fakeGooglePage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!doctype html><meta charset=utf-8><title>Fake Google</title>
<body style="font-family:monospace;padding:2rem"><h3>Fake Google sign-in (dev only)</h3>
<form method=get action="/api/auth/google/callback">
<input type=hidden name=state value="` + html.EscapeString(r.URL.Query().Get("state")) + `">
<label>Email to sign in as: <input name=code type=email required autofocus></label>
<button>Sign in</button></form></body>`))
}

// --- roles ---

type roleBody struct {
	Role string `json:"role"`
}

func (a *API) SetPlayerRole(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	var body roleBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	actor, _ := userFrom(r.Context())
	err = a.Store.SetPlayerRole(r.Context(), actor.ID, id, body.Role)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, 404, "not found")
		return
	case errors.Is(err, store.ErrInvalidRole):
		writeErr(w, 400, err.Error())
		return
	case errors.Is(err, store.ErrPlayerNoEmail), errors.Is(err, store.ErrLastAdmin), errors.Is(err, store.ErrSelfDemote):
		writeErr(w, 409, err.Error())
		return
	case err != nil:
		writeErr(w, 500, "internal error")
		return
	}
	p, err := a.Store.GetPlayer(r.Context(), id)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	writeJSON(w, 200, p)
}

// redactPlayer hides account details (email, role, sign-in state) from viewers,
// except on their own player.
func redactPlayer(p store.Player, u store.User) store.Player {
	if u.IsAdmin() || (u.PlayerID != nil && *u.PlayerID == p.ID) {
		return p
	}
	p.Email, p.Role, p.SignedIn = nil, nil, false
	return p
}

// --- my results ---

type myMatch struct {
	ID       string `json:"id"`
	Round    int    `json:"round"`
	Status   string `json:"status"`
	HomeName string `json:"home_name"`
	AwayName string `json:"away_name"`
	// The players behind each team, so a match can read "Atletico Madrid, Ben".
	HomePlayer string     `json:"home_player"`
	AwayPlayer string     `json:"away_player"`
	HomeGoals  *int       `json:"home_goals"`
	AwayGoals  *int       `json:"away_goals"`
	IsHome     bool       `json:"is_home"`
	PlayedAt   *time.Time `json:"played_at"`
}

type myResult struct {
	Tournament  store.Tournament  `json:"tournament"`
	Participant store.Participant `json:"participant"`
	Standing    *league.Row       `json:"standing"`
	Position    *int              `json:"position"`
	Matches     []myMatch         `json:"matches"`
}

// MyResults lists the signed-in player's tournaments with their team, league
// standing and matches. Accounts without a linked player (the default admin)
// get an empty list.
func (a *API) MyResults(w http.ResponseWriter, r *http.Request) {
	u, _ := userFrom(r.Context())
	out := []myResult{}
	if u.PlayerID == nil {
		writeJSON(w, 200, out)
		return
	}
	ts, err := a.Store.ListTournamentsForPlayer(r.Context(), *u.PlayerID)
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	for _, t := range ts {
		parts, err := a.Store.ListParticipants(r.Context(), t.ID)
		if err != nil {
			writeErr(w, 500, "internal error")
			return
		}
		matches, err := a.Store.ListMatches(r.Context(), t.ID)
		if err != nil {
			writeErr(w, 500, "internal error")
			return
		}
		res := myResult{Tournament: t, Matches: []myMatch{}}
		names := map[string]string{}
		players := map[string]string{}
		for _, p := range parts {
			names[p.ID.String()] = p.TeamName
			players[p.ID.String()] = p.PlayerName
			if p.PlayerID == *u.PlayerID {
				res.Participant = p
			}
		}
		for i, row := range computeStandings(t, parts, matches) {
			if row.ParticipantID == res.Participant.ID.String() {
				row := row
				pos := i + 1
				res.Standing, res.Position = &row, &pos
			}
		}
		for _, m := range matches {
			if m.HomeParticipantID == nil || m.AwayParticipantID == nil {
				continue
			}
			isHome := *m.HomeParticipantID == res.Participant.ID
			if !isHome && *m.AwayParticipantID != res.Participant.ID {
				continue
			}
			res.Matches = append(res.Matches, myMatch{
				ID: m.ID.String(), Round: m.Round, Status: m.Status,
				HomeName: names[m.HomeParticipantID.String()], AwayName: names[m.AwayParticipantID.String()],
				HomePlayer: players[m.HomeParticipantID.String()], AwayPlayer: players[m.AwayParticipantID.String()],
				HomeGoals: m.HomeGoals, AwayGoals: m.AwayGoals, IsHome: isHome, PlayedAt: m.PlayedAt,
			})
		}
		out = append(out, res)
	}
	writeJSON(w, 200, out)
}
