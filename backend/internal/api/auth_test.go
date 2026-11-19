package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/fifa-tournament/backend/internal/auth"
	"github.com/fifa-tournament/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (c *client) createPlayer(name, email string) store.Player {
	c.e.t.Helper()
	b := c.expect(201, "POST", "/players", map[string]any{"display_name": name, "email": email})
	return decode[store.Player](c.e.t, b)
}

type status struct {
	SetupRequired bool        `json:"setup_required"`
	GoogleEnabled bool        `json:"google_enabled"`
	User          *store.User `json:"user"`
}

func (c *client) status() status {
	return decode[status](c.e.t, c.expect(200, "GET", "/auth/status", nil))
}

func TestSetupOnlyOnce(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	if !c.status().SetupRequired {
		t.Fatal("fresh app should require setup")
	}
	c.expect(400, "POST", "/auth/setup", map[string]string{"password": "short"})
	c.setupAdmin()
	st := c.status()
	if st.SetupRequired || st.User == nil || st.User.Role != "admin" {
		t.Fatalf("after setup: %+v", st)
	}
	// A second setup (even from another browser) is refused.
	c2 := e.client()
	c2.expect(409, "POST", "/auth/setup", map[string]string{"password": "another long password"})
	if c2.status().User != nil {
		t.Fatal("refused setup must not sign anyone in")
	}
}

func TestAdminLogin(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	c.setupAdmin()
	c.expect(204, "POST", "/auth/logout", nil)
	c.expect(401, "GET", "/players", nil)

	c.expect(401, "POST", "/auth/login", map[string]string{"username": "admin", "password": "wrong password!!"})
	c.expect(401, "POST", "/auth/login", map[string]string{"username": "nobody", "password": "correct horse battery"})
	c.expect(200, "POST", "/auth/login", map[string]string{"username": "Admin", "password": "correct horse battery"})
	c.expect(200, "GET", "/players", nil)
}

func TestLoginRateLimit(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	c.setupAdmin()
	c.expect(204, "POST", "/auth/logout", nil)
	for i := 0; i < 10; i++ {
		c.expect(401, "POST", "/auth/login", map[string]string{"username": "admin", "password": "wrong password!!"})
	}
	// Even the right password is refused once locked out.
	c.expect(429, "POST", "/auth/login", map[string]string{"username": "admin", "password": "correct horse battery"})
}

func TestGoogleSignInAllowlist(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	alice := admin.createPlayer("Ann", "Ann@Test.dev") // stored lowercased

	// Unknown email: refused, no session.
	stranger := e.client()
	if got := stranger.googleLogin("stranger@example.com"); got != "/login?error=not_invited" {
		t.Fatalf("stranger redirected to %q", got)
	}
	stranger.expect(401, "GET", "/players", nil)

	// Assigned email (any case): signed in as a read-only viewer.
	v := e.client()
	if got := v.googleLogin("ANN@test.dev"); got != "/" {
		t.Fatalf("alice redirected to %q", got)
	}
	st := v.status()
	if st.User == nil || st.User.Role != "viewer" || *st.User.PlayerID != alice.ID {
		t.Fatalf("alice status: %+v", st.User)
	}
	v.expect(200, "GET", "/tournaments", nil)
	v.expect(403, "POST", "/tournaments", map[string]string{"name": "x", "format": "league"})
	v.expect(403, "POST", "/players", map[string]string{"display_name": "Mallory"})
	v.expect(403, "PUT", "/players/"+alice.ID.String()+"/role", map[string]string{"role": "admin"})
}

func TestGoogleStateMismatch(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	admin.createPlayer("Ann", "ann@test.dev")

	c := e.client()
	c.do("GET", "/auth/google/start", nil)
	res, _ := c.do("GET", "/auth/google/callback?code=ann@test.dev&state=forged", nil)
	loc, _ := res.Location()
	if loc.Query().Get("error") != "failed" {
		t.Fatalf("forged state redirected to %s", loc)
	}
	c.expect(401, "GET", "/players", nil)
}

func TestEmailChangeRevokesAccess(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	alice := admin.createPlayer("Ann", "ann@test.dev")

	v := e.client()
	v.googleLogin("ann@test.dev")
	v.expect(200, "GET", "/tournaments", nil)

	admin.expect(200, "PATCH", "/players/"+alice.ID.String(), map[string]string{"email": "ann2@test.dev"})

	// Old session is gone, and the old address no longer works.
	v.expect(401, "GET", "/tournaments", nil)
	if got := e.client().googleLogin("ann@test.dev"); got != "/login?error=not_invited" {
		t.Fatalf("old email redirected to %q", got)
	}
	// The new address binds a fresh Google account.
	v2 := e.client()
	if got := v2.googleLogin("ann2@test.dev"); got != "/" {
		t.Fatalf("new email redirected to %q", got)
	}
}

func TestGoogleSubBinding(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	admin.createPlayer("Ann", "ann@test.dev")
	e.client().googleLogin("ann@test.dev") // fake sub = "fake:ann@test.dev"

	// Rebind the stored sub to a different Google account, as if the address
	// had been recycled: the same email must now be refused.
	pool := e.pool()
	if _, err := pool.Exec(t.Context(), `UPDATE users SET google_sub='fake:someone-else' WHERE google_sub IS NOT NULL`); err != nil {
		t.Fatal(err)
	}
	if got := e.client().googleLogin("ann@test.dev"); got != "/login?error=not_invited" {
		t.Fatalf("sub mismatch redirected to %q", got)
	}
}

func TestGrantAndRevokeAdmin(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	bob := admin.createPlayer("Ben", "ben@test.dev")
	noMail := admin.createPlayer("Cat", "")

	// A player without an email can't be an admin (they couldn't sign in).
	admin.expect(409, "PUT", "/players/"+noMail.ID.String()+"/role", map[string]string{"role": "admin"})
	admin.expect(400, "PUT", "/players/"+bob.ID.String()+"/role", map[string]string{"role": "root"})

	// Grant before Bob has ever signed in: the role is waiting for him.
	b := decode[store.Player](t, admin.expect(200, "PUT", "/players/"+bob.ID.String()+"/role", map[string]string{"role": "admin"}))
	if b.Role == nil || *b.Role != "admin" || b.SignedIn {
		t.Fatalf("granted player: %+v", b)
	}
	bobC := e.client()
	bobC.googleLogin("ben@test.dev")
	if st := bobC.status(); st.User.Role != "admin" {
		t.Fatalf("bob role after sign-in: %s", st.User.Role)
	}
	bobC.createPlayer("Dan", "dan@test.dev") // admin powers work

	// Admins can't demote themselves; another admin can, and it applies at once.
	bobC.expect(409, "PUT", "/players/"+bob.ID.String()+"/role", map[string]string{"role": "viewer"})
	admin.expect(200, "PUT", "/players/"+bob.ID.String()+"/role", map[string]string{"role": "viewer"})
	bobC.expect(403, "POST", "/players", map[string]string{"display_name": "Eve"})
	bobC.expect(200, "GET", "/players", nil)

	// An admin player's email can't be cleared (they'd be locked out).
	admin.expect(200, "PUT", "/players/"+bob.ID.String()+"/role", map[string]string{"role": "admin"})
	admin.expect(409, "PATCH", "/players/"+bob.ID.String(), map[string]string{"email": ""})
}

func TestViewerSeesNoOtherEmails(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	admin.createPlayer("Ann", "ann@test.dev")
	admin.createPlayer("Ben", "ben@test.dev")

	v := e.client()
	v.googleLogin("ann@test.dev")
	for _, p := range decode[[]store.Player](t, v.expect(200, "GET", "/players", nil)) {
		switch p.DisplayName {
		case "Ann":
			if p.Email == nil {
				t.Error("a viewer should see their own email")
			}
		default:
			if p.Email != nil || p.Role != nil {
				t.Errorf("%s leaked account details to a viewer: %+v", p.DisplayName, p)
			}
		}
	}
	// Admins see everything.
	for _, p := range decode[[]store.Player](t, admin.expect(200, "GET", "/players", nil)) {
		if p.Email == nil {
			t.Errorf("admin should see %s's email", p.DisplayName)
		}
	}
}

func TestCrossOriginWriteRefused(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	c.setupAdmin()
	res, _ := c.do("POST", "/players", map[string]string{"display_name": "X"}, "Origin", "https://evil.example")
	if res.StatusCode != 403 {
		t.Fatalf("cross-origin POST got %d", res.StatusCode)
	}
	res, _ = c.do("POST", "/players", map[string]string{"display_name": "X"}, "Origin", e.srv.URL)
	if res.StatusCode != 201 {
		t.Fatalf("same-origin POST got %d", res.StatusCode)
	}
}

func TestMyResults(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	alice := admin.createPlayer("Ann", "ann@test.dev")
	bob := admin.createPlayer("Ben", "ben@test.dev")
	teams := decode[[]store.Team](t, admin.expect(200, "GET", "/teams?league=La%20Liga", nil))
	tour := decode[store.Tournament](t, admin.expect(201, "POST", "/tournaments", map[string]string{"name": "Friday", "format": "league"}))
	admin.expect(201, "POST", "/tournaments/"+tour.ID.String()+"/participants", map[string]string{"player_id": alice.ID.String(), "team_id": teams[0].ID.String()})
	admin.expect(201, "POST", "/tournaments/"+tour.ID.String()+"/participants", map[string]string{"player_id": bob.ID.String(), "team_id": teams[1].ID.String()})
	admin.expect(200, "POST", "/tournaments/"+tour.ID.String()+"/start", nil)

	// The default admin has no player, so no results.
	if got := strings.TrimSpace(string(admin.expect(200, "GET", "/me/results", nil))); got != "[]" {
		t.Fatalf("admin results: %s", got)
	}

	v := e.client()
	v.googleLogin("ann@test.dev")
	var results []struct {
		Tournament  store.Tournament  `json:"tournament"`
		Participant store.Participant `json:"participant"`
		Position    *int              `json:"position"`
		Matches     []struct {
			HomeName   string `json:"home_name"`
			AwayName   string `json:"away_name"`
			HomePlayer string `json:"home_player"`
			AwayPlayer string `json:"away_player"`
		} `json:"matches"`
	}
	if err := jsonUnmarshal(v.expect(200, "GET", "/me/results", nil), &results); err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Tournament.ID != tour.ID || results[0].Participant.PlayerID != alice.ID {
		t.Fatalf("results: %+v", results)
	}
	if results[0].Position == nil || len(results[0].Matches) == 0 {
		t.Fatalf("expected a standing and fixtures: %+v", results[0])
	}
	// Each side of a fixture carries the name of the player behind the team.
	m := results[0].Matches[0]
	if got := []string{m.HomePlayer, m.AwayPlayer}; !(got[0] == "Ann" && got[1] == "Ben") && !(got[0] == "Ben" && got[1] == "Ann") {
		t.Fatalf("expected Ann and Ben as players, got %v", got)
	}
}

// Every route must be public (healthz, auth), signed-in only, or admin only.
// This fails when an endpoint is added without deciding which.
func TestRoutePolicy(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	alice := admin.createPlayer("Ann", "ann@test.dev")
	viewer := e.client()
	viewer.googleLogin("ann@test.dev")
	anon := e.client()
	_ = alice

	router := e.handle.(chi.Routes)
	checked := 0
	err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if route == "/healthz" || strings.HasPrefix(route, "/auth/") {
			return nil
		}
		path := route
		for _, p := range []string{"{id}", "{playerID}"} {
			path = strings.ReplaceAll(path, p, uuid.NewString())
		}
		isWrite := method != http.MethodGet
		// Anonymous: always 401.
		if res, _ := anon.do(method, path, map[string]string{}); res.StatusCode != 401 {
			t.Errorf("anonymous %s %s: got %d, want 401", method, route, res.StatusCode)
		}
		res, _ := viewer.do(method, path, map[string]string{})
		if isWrite && res.StatusCode != 403 {
			t.Errorf("viewer %s %s: got %d, want 403", method, route, res.StatusCode)
		}
		if !isWrite && (res.StatusCode == 401 || res.StatusCode == 403) {
			t.Errorf("viewer %s %s: got %d, want access", method, route, res.StatusCode)
		}
		if res, _ := admin.do(method, path, map[string]string{}); res.StatusCode == 401 || res.StatusCode == 403 {
			t.Errorf("admin %s %s: got %d, want access", method, route, res.StatusCode)
		}
		checked++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked < 15 {
		t.Fatalf("only checked %d routes; did the walk break?", checked)
	}
}

func TestResetAdminPassword(t *testing.T) {
	e := newEnv(t)
	st := store.New(e.pool())

	// Before setup there is no admin to reset.
	hash, _ := auth.HashPassword("a brand new password")
	if err := st.ResetAdminPassword(t.Context(), hash); err != store.ErrNotFound {
		t.Fatalf("reset before setup: %v", err)
	}

	c := e.client()
	c.setupAdmin() // signed in with the original password
	if err := st.ResetAdminPassword(t.Context(), hash); err != nil {
		t.Fatal(err)
	}
	c.expect(401, "GET", "/players", nil) // the old session was ended
	other := e.client()
	other.expect(401, "POST", "/auth/login", map[string]string{"username": "admin", "password": "correct horse battery"})
	other.expect(200, "POST", "/auth/login", map[string]string{"username": "admin", "password": "a brand new password"})
}
