// Package api wires HTTP handlers. Handlers are thin: parse, call store, encode.
// No authentication: every endpoint is unauthenticated. There is no global
// "acting player" — endpoints that need to attribute a participant action take
// the player_id explicitly in the request body or path.
package api

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/fifa-tournament/backend/internal/config"
	"github.com/fifa-tournament/backend/internal/knockout"
	"github.com/fifa-tournament/backend/internal/league"
	"github.com/fifa-tournament/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
)

type API struct {
	Cfg   config.Config
	Store *store.Store
}

func New(cfg config.Config, st *store.Store) http.Handler {
	a := &API{Cfg: cfg, Store: st}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{cfg.FrontendOrigin},
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type"},
		MaxAge:         300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	})

	r.Get("/teams", a.ListTeams)

	r.Get("/players", a.ListPlayers)
	r.Post("/players", a.CreatePlayer)
	r.Get("/players/{id}", a.GetPlayer)
	r.Patch("/players/{id}", a.UpdatePlayer)
	r.Delete("/players/{id}", a.DeletePlayer)

	r.Get("/tournaments", a.ListTournaments)
	r.Post("/tournaments", a.CreateTournament)
	r.Get("/tournaments/{id}", a.GetTournament)
	r.Post("/tournaments/{id}/participants", a.JoinTournament)
	r.Delete("/tournaments/{id}/participants/{playerID}", a.LeaveTournament)
	r.Patch("/tournaments/{id}/participants/{playerID}", a.ChangeTeam)
	r.Post("/tournaments/{id}/start", a.StartTournament)
	r.Post("/tournaments/{id}/end", a.EndTournament)
	r.Put("/matches/{id}/score", a.SubmitScore)

	return r
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func parseUUID(s string) (uuid.UUID, error) { return uuid.Parse(s) }

// --- Players ---

func (a *API) ListPlayers(w http.ResponseWriter, r *http.Request) {
	players, err := a.Store.ListPlayers(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if players == nil {
		players = []store.Player{}
	}
	writeJSON(w, 200, players)
}

type createPlayerBody struct {
	DisplayName string  `json:"display_name"`
	Email       *string `json:"email"`
}

func (a *API) CreatePlayer(w http.ResponseWriter, r *http.Request) {
	var body createPlayerBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	body.DisplayName = strings.TrimSpace(body.DisplayName)
	if body.DisplayName == "" {
		writeErr(w, 400, "display_name required")
		return
	}
	email := normalizeEmail(body.Email)
	p, err := a.Store.CreatePlayer(r.Context(), body.DisplayName, email)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, p)
}

func (a *API) GetPlayer(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	p, err := a.Store.GetPlayer(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, p)
}

type updatePlayerBody struct {
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
}

func (a *API) UpdatePlayer(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	var body updatePlayerBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	var clearEmail bool
	var emailPtr *string
	if body.Email != nil {
		trimmed := strings.TrimSpace(strings.ToLower(*body.Email))
		if trimmed == "" {
			clearEmail = true
		} else {
			emailPtr = &trimmed
		}
	}
	if body.DisplayName != nil {
		trimmed := strings.TrimSpace(*body.DisplayName)
		if trimmed == "" {
			writeErr(w, 400, "display_name cannot be empty")
			return
		}
		body.DisplayName = &trimmed
	}
	p, err := a.Store.UpdatePlayer(r.Context(), id, body.DisplayName, emailPtr, clearEmail)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, p)
}

func (a *API) DeletePlayer(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	err = a.Store.DeletePlayer(r.Context(), id)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, 404, "not found")
		return
	case errors.Is(err, store.ErrPlayerInUse):
		writeErr(w, 409, "cannot delete: player is referenced by one or more tournaments")
		return
	case err != nil:
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func normalizeEmail(in *string) *string {
	if in == nil {
		return nil
	}
	t := strings.TrimSpace(strings.ToLower(*in))
	if t == "" {
		return nil
	}
	return &t
}

// --- Teams ---

func (a *API) ListTeams(w http.ResponseWriter, r *http.Request) {
	league := r.URL.Query().Get("league")
	teams, err := a.Store.ListTeams(r.Context(), league)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, teams)
}

// --- Tournaments ---

type createTournamentBody struct {
	Name   string `json:"name"`
	Format string `json:"format"`
}

func (a *API) CreateTournament(w http.ResponseWriter, r *http.Request) {
	var body createTournamentBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeErr(w, 400, "name required")
		return
	}
	switch body.Format {
	case "league", "knockout":
	default:
		writeErr(w, 400, "format must be 'league' or 'knockout'")
		return
	}
	t, err := a.Store.CreateTournament(r.Context(), body.Name, body.Format, uuid.Nil)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, t)
}

func (a *API) ListTournaments(w http.ResponseWriter, r *http.Request) {
	ts, err := a.Store.ListTournaments(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, ts)
}

type tournamentDetail struct {
	Tournament   store.Tournament    `json:"tournament"`
	Participants []store.Participant `json:"participants"`
	Matches      []store.Match       `json:"matches"`
	Standings    []league.Row        `json:"standings"`
}

func (a *API) GetTournament(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	t, err := a.Store.GetTournament(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	parts, err := a.Store.ListParticipants(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	matches, err := a.Store.ListMatches(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var standings []league.Row
	if t.Status != "DRAFT" && t.Format == "league" {
		refs := make([]league.ParticipantRef, len(parts))
		for i, p := range parts {
			refs[i] = league.ParticipantRef{ID: p.ID.String(), Name: p.TeamName}
		}
		results := make([]league.MatchResult, 0, len(matches))
		for _, m := range matches {
			if m.HomeParticipantID == nil || m.AwayParticipantID == nil {
				continue
			}
			r := league.MatchResult{
				HomeID: m.HomeParticipantID.String(),
				AwayID: m.AwayParticipantID.String(),
			}
			if m.Status == "REPORTED" && m.HomeGoals != nil && m.AwayGoals != nil {
				r.HomeGoals = *m.HomeGoals
				r.AwayGoals = *m.AwayGoals
				r.Reported = true
			}
			results = append(results, r)
		}
		standings = league.Standings(refs, results)
	}
	writeJSON(w, 200, tournamentDetail{Tournament: t, Participants: parts, Matches: matches, Standings: standings})
}

type joinBody struct {
	PlayerID string `json:"player_id"`
	TeamID   string `json:"team_id"`
}

func (a *API) JoinTournament(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	var body joinBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	playerID, err := parseUUID(body.PlayerID)
	if err != nil {
		writeErr(w, 400, "player_id required")
		return
	}
	teamID, err := parseUUID(body.TeamID)
	if err != nil {
		writeErr(w, 400, "bad team_id")
		return
	}
	if _, err := a.Store.GetPlayer(r.Context(), playerID); errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "player not found")
		return
	} else if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	t, err := a.Store.GetTournament(r.Context(), id)
	if err != nil {
		writeErr(w, 404, "not found")
		return
	}
	if t.Status != "DRAFT" {
		writeErr(w, 409, "tournament not accepting joins")
		return
	}
	p, err := a.Store.JoinTournament(r.Context(), id, playerID, teamID)
	if err != nil {
		writeErr(w, 409, fmt.Sprintf("could not join: %v", err))
		return
	}
	writeJSON(w, 201, p)
}

func (a *API) LeaveTournament(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	playerID, err := parseUUID(chi.URLParam(r, "playerID"))
	if err != nil {
		writeErr(w, 400, "bad player id")
		return
	}
	t, err := a.Store.GetTournament(r.Context(), id)
	if err != nil {
		writeErr(w, 404, "not found")
		return
	}
	if t.Status != "DRAFT" {
		writeErr(w, 409, "tournament already started")
		return
	}
	if err := a.Store.LeaveTournament(r.Context(), id, playerID); err != nil {
		writeErr(w, 404, "not a participant")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

type changeTeamBody struct {
	TeamID string `json:"team_id"`
}

func (a *API) ChangeTeam(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	playerID, err := parseUUID(chi.URLParam(r, "playerID"))
	if err != nil {
		writeErr(w, 400, "bad player id")
		return
	}
	var body changeTeamBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	teamID, err := parseUUID(body.TeamID)
	if err != nil {
		writeErr(w, 400, "bad team_id")
		return
	}
	t, err := a.Store.GetTournament(r.Context(), id)
	if err != nil {
		writeErr(w, 404, "not found")
		return
	}
	if t.Status != "DRAFT" {
		writeErr(w, 409, "tournament already started")
		return
	}
	if err := a.Store.ChangeTeam(r.Context(), id, playerID, teamID); err != nil {
		writeErr(w, 409, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *API) StartTournament(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	t, err := a.Store.GetTournament(r.Context(), id)
	if err != nil {
		writeErr(w, 404, "not found")
		return
	}
	if t.Status != "DRAFT" {
		writeErr(w, 409, "already started")
		return
	}
	parts, err := a.Store.ListParticipants(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if len(parts) < 2 {
		writeErr(w, 400, "need at least 2 participants")
		return
	}
	switch t.Format {
	case "league":
		sched := league.RoundRobin(len(parts))
		var fixtures []store.FixtureInsert
		for ri, round := range sched {
			ord := 0
			for _, p := range round {
				if p.Bye {
					continue
				}
				fixtures = append(fixtures, store.FixtureInsert{
					Round:             ri + 1,
					Ord:               ord,
					HomeParticipantID: parts[p.HomeIdx].ID,
					AwayParticipantID: parts[p.AwayIdx].ID,
				})
				ord++
			}
		}
		if err := a.Store.StartLeague(r.Context(), id, fixtures); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	case "knockout":
		seed, err := randomInt64()
		if err != nil {
			writeErr(w, 500, "could not generate seed")
			return
		}
		pids := make([]uuid.UUID, len(parts))
		for i, p := range parts {
			pids[i] = p.ID
		}
		br, err := knockout.BuildBracket(pids, seed)
		if err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		inserts := make([]store.BracketInsert, len(br.Matches))
		for i, m := range br.Matches {
			ins := store.BracketInsert{
				Round:     m.Round,
				Ord:       m.Ord,
				Status:    string(m.Status),
				NextRound: m.NextRound,
				NextOrd:   m.NextOrd,
				NextSlot:  string(m.NextSlot),
			}
			if m.HomeID != uuid.Nil {
				h := m.HomeID
				ins.HomeID = &h
			}
			if m.AwayID != uuid.Nil {
				a := m.AwayID
				ins.AwayID = &a
			}
			inserts[i] = ins
		}
		if err := a.Store.StartKnockout(r.Context(), id, seed, inserts); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
	default:
		writeErr(w, 400, "unsupported format")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// EndTournament transitions a tournament ACTIVE → COMPLETED. It is the manual
// "finish" path for league formats (which have no natural last-fixture trigger)
// and also a safety valve for knockout. Idempotent: calling on an already-
// COMPLETED tournament returns the current row with status 200.
func (a *API) EndTournament(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	t, err := a.Store.EndTournament(r.Context(), id)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, 404, "not found")
		return
	case errors.Is(err, store.ErrTournamentNotStarted):
		writeErr(w, 409, "tournament has not started")
		return
	case err != nil:
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, t)
}

func randomInt64() (int64, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 0, err
	}
	return int64(binary.BigEndian.Uint64(buf[:]) & 0x7fffffffffffffff), nil
}

type scoreBody struct {
	HomeGoals int `json:"home_goals"`
	AwayGoals int `json:"away_goals"`
	Version   int `json:"version"`
}

func (a *API) SubmitScore(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id")
		return
	}
	var body scoreBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if body.HomeGoals < 0 || body.AwayGoals < 0 {
		writeErr(w, 400, "goals must be >= 0")
		return
	}
	existing, err := a.Store.GetMatch(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "match not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	t, err := a.Store.GetTournament(r.Context(), existing.TournamentID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var m store.Match
	switch t.Format {
	case "knockout":
		m, err = a.Store.SubmitScoreKnockout(r.Context(), id, body.HomeGoals, body.AwayGoals, body.Version)
	default:
		m, err = a.Store.SubmitScore(r.Context(), id, body.HomeGoals, body.AwayGoals, body.Version)
	}
	switch {
	case errors.Is(err, store.ErrVersionConflict):
		writeErr(w, 409, "version conflict")
		return
	case errors.Is(err, store.ErrDraw):
		writeErr(w, 422, "draws are not allowed in a knockout match")
		return
	case errors.Is(err, store.ErrDownstreamCompleted):
		writeErr(w, 409, "downstream match already completed; reset it first")
		return
	case errors.Is(err, store.ErrMatchNotPlayable):
		writeErr(w, 409, "match is not yet playable (waiting on feeder match)")
		return
	case err != nil:
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, m)
}
