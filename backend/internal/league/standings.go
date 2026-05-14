package league

import "sort"

// ParticipantRef identifies a participant for standings computation.
type ParticipantRef struct {
	ID   string
	Name string // display name used as final tiebreaker
}

// MatchResult is a reported league match.
type MatchResult struct {
	HomeID     string
	AwayID     string
	HomeGoals  int
	AwayGoals  int
	Reported   bool
}

// Row is one row of the standings table.
type Row struct {
	ParticipantID string
	Name          string
	Played        int
	Won           int
	Drawn         int
	Lost          int
	GoalsFor      int
	GoalsAgainst  int
	GoalDiff      int
	Points        int
}

// Standings computes the sorted standings table.
// Sort: points desc, goal diff desc, goals for desc, name asc.
// Unreported matches are ignored.
func Standings(participants []ParticipantRef, matches []MatchResult) []Row {
	idx := make(map[string]*Row, len(participants))
	rows := make([]Row, len(participants))
	for i, p := range participants {
		rows[i] = Row{ParticipantID: p.ID, Name: p.Name}
		idx[p.ID] = &rows[i]
	}
	for _, m := range matches {
		if !m.Reported {
			continue
		}
		h, ok1 := idx[m.HomeID]
		a, ok2 := idx[m.AwayID]
		if !ok1 || !ok2 {
			continue
		}
		h.Played++
		a.Played++
		h.GoalsFor += m.HomeGoals
		h.GoalsAgainst += m.AwayGoals
		a.GoalsFor += m.AwayGoals
		a.GoalsAgainst += m.HomeGoals
		switch {
		case m.HomeGoals > m.AwayGoals:
			h.Won++
			h.Points += 3
			a.Lost++
		case m.HomeGoals < m.AwayGoals:
			a.Won++
			a.Points += 3
			h.Lost++
		default:
			h.Drawn++
			a.Drawn++
			h.Points++
			a.Points++
		}
	}
	for i := range rows {
		rows[i].GoalDiff = rows[i].GoalsFor - rows[i].GoalsAgainst
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Points != rows[j].Points {
			return rows[i].Points > rows[j].Points
		}
		if rows[i].GoalDiff != rows[j].GoalDiff {
			return rows[i].GoalDiff > rows[j].GoalDiff
		}
		if rows[i].GoalsFor != rows[j].GoalsFor {
			return rows[i].GoalsFor > rows[j].GoalsFor
		}
		return rows[i].Name < rows[j].Name
	})
	return rows
}
