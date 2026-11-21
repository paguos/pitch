package api_test

import (
	"testing"

	"github.com/fifa-tournament/backend/internal/store"
	"github.com/google/uuid"
)

func TestDeleteTournament(t *testing.T) {
	e := newEnv(t)
	admin := e.client()
	admin.setupAdmin()
	ann := admin.createPlayer("Ann", "ann@test.dev")
	ben := admin.createPlayer("Ben", "ben@test.dev")
	teams := decode[[]store.Team](t, admin.expect(200, "GET", "/teams?league=La%20Liga", nil))

	newTournament := func(name string, start bool) store.Tournament {
		t.Helper()
		tour := decode[store.Tournament](t, admin.expect(201, "POST", "/tournaments", map[string]string{"name": name, "format": "league"}))
		base := "/tournaments/" + tour.ID.String()
		admin.expect(201, "POST", base+"/participants", map[string]string{"player_id": ann.ID.String(), "team_id": teams[0].ID.String()})
		admin.expect(201, "POST", base+"/participants", map[string]string{"player_id": ben.ID.String(), "team_id": teams[1].ID.String()})
		if start {
			admin.expect(200, "POST", base+"/start", nil)
		}
		return tour
	}
	count := func(table string, id uuid.UUID) (n int) {
		t.Helper()
		col := "tournament_id"
		if table == "tournaments" {
			col = "id"
		}
		if err := e.pool().QueryRow(t.Context(), "SELECT count(*) FROM "+table+" WHERE "+col+"=$1", id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	t.Run("draft", func(t *testing.T) {
		tour := newTournament("Draft night", false)
		admin.expect(204, "DELETE", "/tournaments/"+tour.ID.String(), nil)
		admin.expect(404, "GET", "/tournaments/"+tour.ID.String(), nil)
		if n := count("participants", tour.ID); n != 0 {
			t.Fatalf("participants left behind: %d", n)
		}
	})

	t.Run("active removes fixtures and participants", func(t *testing.T) {
		tour := newTournament("Live night", true)
		if count("matches", tour.ID) == 0 {
			t.Fatal("expected fixtures after start")
		}
		admin.expect(204, "DELETE", "/tournaments/"+tour.ID.String(), nil)
		if n := count("tournaments", tour.ID) + count("matches", tour.ID) + count("participants", tour.ID); n != 0 {
			t.Fatalf("rows left behind: %d", n)
		}
	})

	t.Run("completed is refused", func(t *testing.T) {
		tour := newTournament("Finished night", true)
		admin.expect(200, "POST", "/tournaments/"+tour.ID.String()+"/end", nil)
		admin.expect(409, "DELETE", "/tournaments/"+tour.ID.String(), nil)
		if count("tournaments", tour.ID) != 1 || count("matches", tour.ID) == 0 {
			t.Fatal("completed tournament must be untouched")
		}
	})

	t.Run("missing", func(t *testing.T) {
		admin.expect(404, "DELETE", "/tournaments/"+uuid.NewString(), nil)
	})

	t.Run("viewer is forbidden", func(t *testing.T) {
		tour := newTournament("Viewer night", false)
		v := e.client()
		v.googleLogin("ann@test.dev")
		v.expect(403, "DELETE", "/tournaments/"+tour.ID.String(), nil)
		admin.expect(200, "GET", "/tournaments/"+tour.ID.String(), nil)
	})
}
