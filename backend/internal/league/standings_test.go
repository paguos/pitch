package league

import "testing"

func TestStandings_Basic(t *testing.T) {
	ps := []ParticipantRef{
		{ID: "a", Name: "Alice"},
		{ID: "b", Name: "Bob"},
		{ID: "c", Name: "Carol"},
	}
	ms := []MatchResult{
		{HomeID: "a", AwayID: "b", HomeGoals: 2, AwayGoals: 1, Reported: true},
		{HomeID: "b", AwayID: "c", HomeGoals: 0, AwayGoals: 0, Reported: true},
		{HomeID: "a", AwayID: "c", HomeGoals: 3, AwayGoals: 0, Reported: true},
	}
	s := Standings(ps, ms)
	if s[0].ParticipantID != "a" || s[0].Points != 6 {
		t.Fatalf("expected Alice first with 6pts, got %+v", s[0])
	}
	if s[1].ParticipantID != "b" {
		t.Fatalf("expected Bob second (1pt, GD -1 beats Carol 1pt GD -3), got %+v", s[1])
	}
	if s[2].ParticipantID != "c" {
		t.Fatalf("expected Carol third, got %+v", s[2])
	}
}

func TestStandings_NameTiebreaker(t *testing.T) {
	ps := []ParticipantRef{
		{ID: "z", Name: "Zed"},
		{ID: "a", Name: "Alice"},
	}
	// No reported matches, so both tied at 0/0/0 → Alice first by name.
	s := Standings(ps, nil)
	if s[0].Name != "Alice" {
		t.Fatalf("expected Alice first by name tiebreaker, got %+v", s)
	}
}

func TestStandings_IgnoresUnreported(t *testing.T) {
	ps := []ParticipantRef{{ID: "a", Name: "A"}, {ID: "b", Name: "B"}}
	ms := []MatchResult{{HomeID: "a", AwayID: "b", HomeGoals: 5, AwayGoals: 0, Reported: false}}
	s := Standings(ps, ms)
	for _, r := range s {
		if r.Played != 0 || r.Points != 0 {
			t.Fatalf("unreported match should not count: %+v", r)
		}
	}
}
