// Package store wraps pgx with hand-written queries. Small surface; we keep
// SQL close to the call sites for clarity. If this grows, consider sqlc.
package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")
var ErrVersionConflict = errors.New("version conflict")
var ErrDraw = errors.New("draws are not allowed in a knockout match")
var ErrDownstreamCompleted = errors.New("downstream match already completed; reset it first")
var ErrMatchNotPlayable = errors.New("match is not yet playable")
var ErrPlayerInUse = errors.New("player is referenced by tournaments and cannot be deleted")
var ErrTournamentNotStarted = errors.New("tournament has not started")
var ErrNameTaken = errors.New("a tournament with that name already exists")

type Store struct {
	DB *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store { return &Store{DB: pool} }

// --- Players ---

type Player struct {
	ID          uuid.UUID `json:"id"`
	Email       *string   `json:"email"`
	DisplayName string    `json:"display_name"`
	CreatedAt   time.Time `json:"created_at"`
}

func (s *Store) ListPlayers(ctx context.Context) ([]Player, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, email, display_name, created_at
		FROM players ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Player
	for rows.Next() {
		var p Player
		if err := rows.Scan(&p.ID, &p.Email, &p.DisplayName, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) GetPlayer(ctx context.Context, id uuid.UUID) (Player, error) {
	var p Player
	err := s.DB.QueryRow(ctx, `SELECT id, email, display_name, created_at FROM players WHERE id=$1`, id).
		Scan(&p.ID, &p.Email, &p.DisplayName, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

func (s *Store) CreatePlayer(ctx context.Context, displayName string, email *string) (Player, error) {
	var p Player
	err := s.DB.QueryRow(ctx, `
		INSERT INTO players (display_name, email)
		VALUES ($1, $2)
		RETURNING id, email, display_name, created_at
	`, displayName, email).Scan(&p.ID, &p.Email, &p.DisplayName, &p.CreatedAt)
	return p, err
}

func (s *Store) UpdatePlayer(ctx context.Context, id uuid.UUID, displayName *string, email *string, clearEmail bool) (Player, error) {
	// We allow partial updates. Build the SET clause dynamically only across
	// the two columns we accept.
	var p Player
	q := `UPDATE players SET `
	args := []any{}
	sep := ""
	if displayName != nil {
		args = append(args, *displayName)
		q += sep + "display_name=$" + itoa(len(args))
		sep = ", "
	}
	if email != nil {
		args = append(args, *email)
		q += sep + "email=$" + itoa(len(args))
		sep = ", "
	} else if clearEmail {
		q += sep + "email=NULL"
		sep = ", "
	}
	if sep == "" {
		// Nothing to update; return current row.
		return s.GetPlayer(ctx, id)
	}
	args = append(args, id)
	q += " WHERE id=$" + itoa(len(args)) + " RETURNING id, email, display_name, created_at"
	err := s.DB.QueryRow(ctx, q, args...).Scan(&p.ID, &p.Email, &p.DisplayName, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

func (s *Store) DeletePlayer(ctx context.Context, id uuid.UUID) error {
	// Block delete if the player is referenced by participants or created any
	// tournaments. We prefer integrity over silent cascade so history stays
	// intact.
	var refs int
	if err := s.DB.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM participants WHERE player_id=$1) +
		  (SELECT COUNT(*) FROM tournaments  WHERE created_by=$1)
		-- created_by remains a soft reference for historical rows; we still
		-- block delete to keep audit trails intact.
	`, id).Scan(&refs); err != nil {
		return err
	}
	if refs > 0 {
		return ErrPlayerInUse
	}
	tag, err := s.DB.Exec(ctx, `DELETE FROM players WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// itoa avoids importing strconv just for tiny ints used in dynamic SQL.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// --- Teams ---

type Team struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	League  string    `json:"league"`
	Country string    `json:"country"`
	Kind    string    `json:"kind"`
	LogoURL *string   `json:"logo_url"`
}

func (s *Store) ListTeams(ctx context.Context, league string) ([]Team, error) {
	q := `SELECT id, name, league, country, kind, logo_url FROM teams`
	args := []any{}
	if league != "" {
		q += ` WHERE league = $1`
		args = append(args, league)
	}
	q += ` ORDER BY league, name`
	rows, err := s.DB.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Team
	for rows.Next() {
		var t Team
		if err := rows.Scan(&t.ID, &t.Name, &t.League, &t.Country, &t.Kind, &t.LogoURL); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// --- Tournaments ---

type Tournament struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Format      string     `json:"format"`
	Status      string     `json:"status"`
	CreatedBy   *uuid.UUID `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
	Version     int        `json:"version"`
	RngSeed     *int64     `json:"rng_seed,omitempty"`
}

// CreateTournament inserts a new tournament. The `creator` arg is retained
// for legacy callers but is ignored — tournaments are created anonymously now
// that the "acting as" concept is gone.
func (s *Store) CreateTournament(ctx context.Context, name, format string, _ uuid.UUID) (Tournament, error) {
	var t Tournament
	err := s.DB.QueryRow(ctx, `
		INSERT INTO tournaments (name, format, created_by)
		VALUES ($1, $2, NULL)
		RETURNING id, name, format, status, created_by, created_at, started_at, completed_at, version, rng_seed
	`, name, format).Scan(&t.ID, &t.Name, &t.Format, &t.Status, &t.CreatedBy, &t.CreatedAt, &t.StartedAt, &t.CompletedAt, &t.Version, &t.RngSeed)
	return t, err
}

func (s *Store) ListTournaments(ctx context.Context) ([]Tournament, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, name, format, status, created_by, created_at, started_at, completed_at, version, rng_seed
		FROM tournaments ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Tournament
	for rows.Next() {
		var t Tournament
		if err := rows.Scan(&t.ID, &t.Name, &t.Format, &t.Status, &t.CreatedBy, &t.CreatedAt, &t.StartedAt, &t.CompletedAt, &t.Version, &t.RngSeed); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) GetTournament(ctx context.Context, id uuid.UUID) (Tournament, error) {
	var t Tournament
	err := s.DB.QueryRow(ctx, `
		SELECT id, name, format, status, created_by, created_at, started_at, completed_at, version, rng_seed
		FROM tournaments WHERE id=$1
	`, id).Scan(&t.ID, &t.Name, &t.Format, &t.Status, &t.CreatedBy, &t.CreatedAt, &t.StartedAt, &t.CompletedAt, &t.Version, &t.RngSeed)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

// CopyTournament creates a new DRAFT tournament with the same format and
// participants (player+team pairs) as the source. Matches are not copied —
// the draw is generated fresh when the copy is started.
func (s *Store) CopyTournament(ctx context.Context, sourceID uuid.UUID, newName string) (Tournament, error) {
	var t Tournament

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return t, err
	}
	defer tx.Rollback(ctx)

	var format string
	err = tx.QueryRow(ctx, `SELECT format FROM tournaments WHERE id=$1`, sourceID).Scan(&format)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO tournaments (name, format, created_by)
		VALUES ($1, $2, NULL)
		RETURNING id, name, format, status, created_by, created_at, started_at, completed_at, version, rng_seed
	`, newName, format).Scan(
		&t.ID, &t.Name, &t.Format, &t.Status,
		&t.CreatedBy, &t.CreatedAt, &t.StartedAt, &t.CompletedAt,
		&t.Version, &t.RngSeed,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return t, ErrNameTaken
		}
		return t, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO participants (tournament_id, player_id, team_id)
		SELECT $1, player_id, team_id FROM participants WHERE tournament_id=$2
	`, t.ID, sourceID)
	if err != nil {
		return t, err
	}

	return t, tx.Commit(ctx)
}

// --- Participants ---

type Participant struct {
	ID           uuid.UUID `json:"id"`
	TournamentID uuid.UUID `json:"tournament_id"`
	PlayerID     uuid.UUID `json:"player_id"`
	PlayerName   string    `json:"player_name"`
	TeamID       uuid.UUID `json:"team_id"`
	TeamName     string    `json:"team_name"`
	TeamLogoURL  *string   `json:"team_logo_url"`
	Seed         int       `json:"seed"`
}

func (s *Store) ListParticipants(ctx context.Context, tournamentID uuid.UUID) ([]Participant, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT p.id, p.tournament_id, p.player_id, pl.display_name, p.team_id, t.name, t.logo_url, p.seed
		FROM participants p
		JOIN players pl ON pl.id = p.player_id
		JOIN teams   t  ON t.id  = p.team_id
		WHERE p.tournament_id = $1
		ORDER BY p.joined_at ASC
	`, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Participant
	for rows.Next() {
		var p Participant
		if err := rows.Scan(&p.ID, &p.TournamentID, &p.PlayerID, &p.PlayerName, &p.TeamID, &p.TeamName, &p.TeamLogoURL, &p.Seed); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) JoinTournament(ctx context.Context, tournamentID, playerID, teamID uuid.UUID) (Participant, error) {
	var p Participant
	err := s.DB.QueryRow(ctx, `
		INSERT INTO participants (tournament_id, player_id, team_id) VALUES ($1, $2, $3)
		RETURNING id, tournament_id, player_id, team_id, seed
	`, tournamentID, playerID, teamID).Scan(&p.ID, &p.TournamentID, &p.PlayerID, &p.TeamID, &p.Seed)
	return p, err
}

func (s *Store) LeaveTournament(ctx context.Context, tournamentID, playerID uuid.UUID) error {
	tag, err := s.DB.Exec(ctx, `DELETE FROM participants WHERE tournament_id=$1 AND player_id=$2`, tournamentID, playerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ChangeTeam(ctx context.Context, tournamentID, playerID, teamID uuid.UUID) error {
	tag, err := s.DB.Exec(ctx, `UPDATE participants SET team_id=$3 WHERE tournament_id=$1 AND player_id=$2`,
		tournamentID, playerID, teamID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- Matches ---

type Match struct {
	ID                uuid.UUID  `json:"id"`
	TournamentID      uuid.UUID  `json:"tournament_id"`
	Round             int        `json:"round"`
	Ord               int        `json:"ord"`
	HomeParticipantID *uuid.UUID `json:"home_participant_id"`
	AwayParticipantID *uuid.UUID `json:"away_participant_id"`
	HomeGoals         *int       `json:"home_goals"`
	AwayGoals         *int       `json:"away_goals"`
	Status            string     `json:"status"`
	Version           int        `json:"version"`
	PlayedAt          *time.Time `json:"played_at"`
	NextMatchID       *uuid.UUID `json:"next_match_id"`
	NextMatchSlot     *string    `json:"next_match_slot"`
}

func (s *Store) ListMatches(ctx context.Context, tournamentID uuid.UUID) ([]Match, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, tournament_id, round, ord, home_participant_id, away_participant_id,
		       home_goals, away_goals, status, version, played_at, next_match_id, next_match_slot
		FROM matches WHERE tournament_id=$1 ORDER BY round, ord
	`, tournamentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Match
	for rows.Next() {
		var m Match
		if err := rows.Scan(&m.ID, &m.TournamentID, &m.Round, &m.Ord, &m.HomeParticipantID, &m.AwayParticipantID,
			&m.HomeGoals, &m.AwayGoals, &m.Status, &m.Version, &m.PlayedAt, &m.NextMatchID, &m.NextMatchSlot); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// StartLeague atomically transitions DRAFT→ACTIVE and inserts all fixtures.
func (s *Store) StartLeague(ctx context.Context, tournamentID uuid.UUID, fixtures []FixtureInsert) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tournaments SET status='ACTIVE', started_at=now(), version=version+1
		WHERE id=$1 AND status='DRAFT'
	`, tournamentID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("tournament not in DRAFT")
	}
	for _, f := range fixtures {
		_, err := tx.Exec(ctx, `
			INSERT INTO matches (tournament_id, round, ord, home_participant_id, away_participant_id)
			VALUES ($1, $2, $3, $4, $5)
		`, tournamentID, f.Round, f.Ord, f.HomeParticipantID, f.AwayParticipantID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type FixtureInsert struct {
	Round, Ord                           int
	HomeParticipantID, AwayParticipantID uuid.UUID
}

// SubmitScore updates a league match using optimistic locking on version.
func (s *Store) SubmitScore(ctx context.Context, matchID uuid.UUID, home, away, expectedVersion int) (Match, error) {
	var m Match
	err := s.DB.QueryRow(ctx, `
		UPDATE matches
		   SET home_goals=$2, away_goals=$3, status='REPORTED', version=version+1, played_at=now()
		 WHERE id=$1 AND version=$4
		 RETURNING id, tournament_id, round, ord, home_participant_id, away_participant_id,
		           home_goals, away_goals, status, version, played_at, next_match_id, next_match_slot
	`, matchID, home, away, expectedVersion).Scan(
		&m.ID, &m.TournamentID, &m.Round, &m.Ord, &m.HomeParticipantID, &m.AwayParticipantID,
		&m.HomeGoals, &m.AwayGoals, &m.Status, &m.Version, &m.PlayedAt, &m.NextMatchID, &m.NextMatchSlot,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrVersionConflict
	}
	return m, err
}

// --- Knockout ---

// BracketInsert mirrors knockout.BracketMatch but uses participant pointers
// for nullable slots, and resolves NextRound/Ord to NextMatchID later.
type BracketInsert struct {
	Round     int
	Ord       int
	HomeID    *uuid.UUID
	AwayID    *uuid.UUID
	Status    string
	NextRound int
	NextOrd   int
	NextSlot  string
}

// StartKnockout atomically transitions DRAFT→ACTIVE, persists the rng_seed,
// inserts all bracket matches, and wires next_match_id pointers in a second
// pass (so referenced rows exist).
func (s *Store) StartKnockout(ctx context.Context, tournamentID uuid.UUID, seed int64, inserts []BracketInsert) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tournaments
		   SET status='ACTIVE', started_at=now(), version=version+1, rng_seed=$2
		 WHERE id=$1 AND status='DRAFT'
	`, tournamentID, seed)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("tournament not in DRAFT")
	}

	type key struct{ round, ord int }
	ids := make(map[key]uuid.UUID, len(inserts))
	for _, ins := range inserts {
		var id uuid.UUID
		err := tx.QueryRow(ctx, `
			INSERT INTO matches (tournament_id, round, ord, home_participant_id, away_participant_id, status)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id
		`, tournamentID, ins.Round, ins.Ord, ins.HomeID, ins.AwayID, ins.Status).Scan(&id)
		if err != nil {
			return err
		}
		ids[key{ins.Round, ins.Ord}] = id
	}

	for _, ins := range inserts {
		if ins.NextRound == 0 {
			continue
		}
		nextID, ok := ids[key{ins.NextRound, ins.NextOrd}]
		if !ok {
			return errors.New("bracket wiring: next match not found")
		}
		_, err := tx.Exec(ctx, `
			UPDATE matches SET next_match_id=$2, next_match_slot=$3
			 WHERE id=$1
		`, ids[key{ins.Round, ins.Ord}], nextID, ins.NextSlot)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) SubmitScoreKnockout(ctx context.Context, matchID uuid.UUID, home, away, expectedVersion int) (Match, error) {
	var m Match
	if home == away {
		return m, ErrDraw
	}

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return m, err
	}
	defer tx.Rollback(ctx)

	var (
		curStatus        string
		curVersion       int
		homePID, awayPID *uuid.UUID
		curHome, curAway *int
		tournamentID     uuid.UUID
		nextMatchID      *uuid.UUID
		nextMatchSlot    *string
	)
	err = tx.QueryRow(ctx, `
		SELECT tournament_id, status, version, home_participant_id, away_participant_id,
		       home_goals, away_goals, next_match_id, next_match_slot
		  FROM matches WHERE id=$1 FOR UPDATE
	`, matchID).Scan(&tournamentID, &curStatus, &curVersion, &homePID, &awayPID,
		&curHome, &curAway, &nextMatchID, &nextMatchSlot)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	if err != nil {
		return m, err
	}
	if curVersion != expectedVersion {
		return m, ErrVersionConflict
	}
	if curStatus == "PENDING" {
		return m, ErrMatchNotPlayable
	}
	if homePID == nil || awayPID == nil {
		return m, ErrMatchNotPlayable
	}

	newWinner := *homePID
	if away > home {
		newWinner = *awayPID
	}

	if nextMatchID != nil {
		var downStatus string
		var downHome, downAway *uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT status, home_participant_id, away_participant_id
			  FROM matches WHERE id=$1 FOR UPDATE
		`, *nextMatchID).Scan(&downStatus, &downHome, &downAway)
		if err != nil {
			return m, err
		}
		var existingDownPID *uuid.UUID
		if nextMatchSlot != nil && *nextMatchSlot == "HOME" {
			existingDownPID = downHome
		} else {
			existingDownPID = downAway
		}
		winnerChanges := existingDownPID == nil || *existingDownPID != newWinner
		if downStatus == "COMPLETED" && winnerChanges {
			return m, ErrDownstreamCompleted
		}

		if winnerChanges {
			var q string
			if *nextMatchSlot == "HOME" {
				q = `UPDATE matches SET home_participant_id=$2, version=version+1,
				        status = CASE
				          WHEN status='COMPLETED' THEN status
				          WHEN away_participant_id IS NOT NULL THEN 'PLAYABLE'
				          ELSE 'PENDING'
				        END
				      WHERE id=$1`
			} else {
				q = `UPDATE matches SET away_participant_id=$2, version=version+1,
				        status = CASE
				          WHEN status='COMPLETED' THEN status
				          WHEN home_participant_id IS NOT NULL THEN 'PLAYABLE'
				          ELSE 'PENDING'
				        END
				      WHERE id=$1`
			}
			if _, err := tx.Exec(ctx, q, *nextMatchID, newWinner); err != nil {
				return m, err
			}
		}
	}

	err = tx.QueryRow(ctx, `
		UPDATE matches
		   SET home_goals=$2, away_goals=$3, status='COMPLETED',
		       version=version+1, played_at=now()
		 WHERE id=$1 AND version=$4
		 RETURNING id, tournament_id, round, ord, home_participant_id, away_participant_id,
		           home_goals, away_goals, status, version, played_at, next_match_id, next_match_slot
	`, matchID, home, away, expectedVersion).Scan(
		&m.ID, &m.TournamentID, &m.Round, &m.Ord, &m.HomeParticipantID, &m.AwayParticipantID,
		&m.HomeGoals, &m.AwayGoals, &m.Status, &m.Version, &m.PlayedAt, &m.NextMatchID, &m.NextMatchSlot,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrVersionConflict
	}
	if err != nil {
		return m, err
	}

	if nextMatchID == nil {
		if _, err := tx.Exec(ctx, `
			UPDATE tournaments SET status='COMPLETED', completed_at=now(), version=version+1
			 WHERE id=$1 AND status='ACTIVE'
		`, tournamentID); err != nil {
			return m, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return m, err
	}
	return m, nil
}

// EndTournament marks a tournament COMPLETED. Idempotent: if the tournament
// is already COMPLETED, it returns the current row unchanged. Returns
// ErrNotFound if the tournament does not exist. State is a one-way transition
// (ACTIVE → COMPLETED), so no optimistic-lock check is needed here.
func (s *Store) EndTournament(ctx context.Context, tournamentID uuid.UUID) (Tournament, error) {
	var t Tournament
	// Only flip when ACTIVE; if already COMPLETED, leave row untouched.
	_, err := s.DB.Exec(ctx, `
		UPDATE tournaments
		   SET status='COMPLETED', completed_at=now(), version=version+1
		 WHERE id=$1 AND status='ACTIVE'
	`, tournamentID)
	if err != nil {
		return t, err
	}
	err = s.DB.QueryRow(ctx, `
		SELECT id, name, format, status, created_by, created_at, started_at, completed_at, version, rng_seed
		  FROM tournaments WHERE id=$1
	`, tournamentID).Scan(
		&t.ID, &t.Name, &t.Format, &t.Status, &t.CreatedBy, &t.CreatedAt, &t.StartedAt, &t.CompletedAt, &t.Version, &t.RngSeed,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}
	if t.Status == "DRAFT" {
		return t, ErrTournamentNotStarted
	}
	return t, nil
}

func (s *Store) GetMatch(ctx context.Context, matchID uuid.UUID) (Match, error) {
	var m Match
	err := s.DB.QueryRow(ctx, `
		SELECT id, tournament_id, round, ord, home_participant_id, away_participant_id,
		       home_goals, away_goals, status, version, played_at, next_match_id, next_match_slot
		  FROM matches WHERE id=$1
	`, matchID).Scan(
		&m.ID, &m.TournamentID, &m.Round, &m.Ord, &m.HomeParticipantID, &m.AwayParticipantID,
		&m.HomeGoals, &m.AwayGoals, &m.Status, &m.Version, &m.PlayedAt, &m.NextMatchID, &m.NextMatchSlot,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}
