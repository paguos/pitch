package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	RoleAdmin  = "admin"
	RoleViewer = "viewer"
)

var (
	ErrSetupDone       = errors.New("setup already completed")
	ErrNotInvited      = errors.New("email is not assigned to a player")
	ErrSubMismatch     = errors.New("google account does not match the one linked to this player")
	ErrLastAdmin       = errors.New("cannot remove the last admin")
	ErrSelfDemote      = errors.New("you cannot remove your own admin rights")
	ErrPlayerNoEmail   = errors.New("player needs an email before they can sign in")
	ErrAdminNeedsEmail = errors.New("an admin player's email cannot be cleared; remove admin rights first")
	ErrInvalidRole     = errors.New("invalid role")
	ErrEmailTaken      = errors.New("another player already has that email")
)

// User is an authenticated account. The bootstrap admin has a Username and no
// player; everyone else is linked to a player whose email is their identity.
type User struct {
	ID         uuid.UUID  `json:"id"`
	Username   *string    `json:"username"`
	Role       string     `json:"role"`
	PlayerID   *uuid.UUID `json:"player_id"`
	PlayerName *string    `json:"player_name"`
}

func (u User) IsAdmin() bool { return u.Role == RoleAdmin }

// NeedsSetup reports whether the app is fresh (no admin exists yet).
func (s *Store) NeedsSetup(ctx context.Context) (bool, error) {
	var exists bool
	err := s.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE role='admin')`).Scan(&exists)
	return !exists, err
}

// CreateBootstrapAdmin creates the default "admin" account, but only while no
// admin exists. The unique username makes concurrent claims safe: at most one
// insert wins, the other gets ErrSetupDone.
func (s *Store) CreateBootstrapAdmin(ctx context.Context, passwordHash string) (User, error) {
	var u User
	err := s.DB.QueryRow(ctx, `
		INSERT INTO users (username, password_hash, role)
		SELECT 'admin', $1, 'admin'
		WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='admin')
		RETURNING id, username, role
	`, passwordHash).Scan(&u.ID, &u.Username, &u.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrSetupDone
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return u, ErrSetupDone
	}
	return u, err
}

// GetUserForLogin returns the user and password hash for a username.
func (s *Store) GetUserForLogin(ctx context.Context, username string) (User, string, error) {
	var u User
	var hash *string
	err := s.DB.QueryRow(ctx, `
		SELECT id, username, role, password_hash FROM users
		WHERE username=$1 AND password_hash IS NOT NULL
	`, username).Scan(&u.ID, &u.Username, &u.Role, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, "", ErrNotFound
	}
	if hash == nil {
		return u, "", ErrNotFound
	}
	return u, *hash, err
}

// GoogleLogin resolves a verified Google identity to a user. The email must
// belong to a player (case-insensitively). The first sign-in binds the Google
// subject to the user; later sign-ins must present the same subject.
func (s *Store) GoogleLogin(ctx context.Context, sub, email string) (User, error) {
	var u User
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return u, err
	}
	defer tx.Rollback(ctx)

	var playerID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM players WHERE email=$1`, email).Scan(&playerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotInvited
	}
	if err != nil {
		return u, err
	}

	// Ensure a user row exists (the admin may already have created one by
	// granting a role before the first sign-in).
	if _, err = tx.Exec(ctx, `
		INSERT INTO users (player_id, role) VALUES ($1, 'viewer')
		ON CONFLICT (player_id) DO NOTHING
	`, playerID); err != nil {
		return u, err
	}
	var boundSub *string
	err = tx.QueryRow(ctx, `
		SELECT id, role, google_sub FROM users WHERE player_id=$1 FOR UPDATE
	`, playerID).Scan(&u.ID, &u.Role, &boundSub)
	if err != nil {
		return u, err
	}
	switch {
	case boundSub == nil:
		if _, err = tx.Exec(ctx, `UPDATE users SET google_sub=$1 WHERE id=$2`, sub, u.ID); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
				return u, ErrSubMismatch // this Google account is already linked elsewhere
			}
			return u, err
		}
	case *boundSub != sub:
		return u, ErrSubMismatch
	}
	if _, err = tx.Exec(ctx, `UPDATE users SET last_login_at=now() WHERE id=$1`, u.ID); err != nil {
		return u, err
	}
	if err = tx.Commit(ctx); err != nil {
		return u, err
	}
	return s.GetUser(ctx, u.ID)
}

func (s *Store) GetUser(ctx context.Context, id uuid.UUID) (User, error) {
	var u User
	err := s.DB.QueryRow(ctx, `
		SELECT u.id, u.username, u.role, u.player_id, p.display_name
		FROM users u LEFT JOIN players p ON p.id = u.player_id
		WHERE u.id=$1
	`, id).Scan(&u.ID, &u.Username, &u.Role, &u.PlayerID, &u.PlayerName)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// --- Sessions ---

func (s *Store) CreateSession(ctx context.Context, userID uuid.UUID, tokenHash string, expires time.Time) error {
	// Opportunistic cleanup keeps the table small without a background job.
	if _, err := s.DB.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now()`); err != nil {
		return err
	}
	_, err := s.DB.Exec(ctx, `
		INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)
	`, tokenHash, userID, expires)
	return err
}

// SessionUser returns the user for a live session. The role is read from the
// database on every request, so a role change applies immediately.
func (s *Store) SessionUser(ctx context.Context, tokenHash string) (User, error) {
	var u User
	err := s.DB.QueryRow(ctx, `
		SELECT u.id, u.username, u.role, u.player_id, p.display_name
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN players p ON p.id = u.player_id
		WHERE s.token_hash=$1 AND s.expires_at > now()
	`, tokenHash).Scan(&u.ID, &u.Username, &u.Role, &u.PlayerID, &u.PlayerName)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM sessions WHERE token_hash=$1`, tokenHash)
	return err
}

// --- Roles ---

// SetPlayerRole grants or revokes admin for a player, creating their user row
// if they have not signed in yet. Safeguards: the player needs an email, the
// last admin cannot be demoted, and nobody can demote themselves.
func (s *Store) SetPlayerRole(ctx context.Context, actor uuid.UUID, playerID uuid.UUID, role string) error {
	if role != RoleAdmin && role != RoleViewer {
		return ErrInvalidRole
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var email *string
	err = tx.QueryRow(ctx, `SELECT email FROM players WHERE id=$1`, playerID).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if email == nil {
		return ErrPlayerNoEmail
	}

	// Lock all admin rows so concurrent demotions are serialized.
	rows, err := tx.Query(ctx, `SELECT id FROM users WHERE role='admin' FOR UPDATE`)
	if err != nil {
		return err
	}
	admins := map[uuid.UUID]bool{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		admins[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	var targetID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO users (player_id, role) VALUES ($1, $2)
		ON CONFLICT (player_id) DO UPDATE SET role = EXCLUDED.role
		RETURNING id
	`, playerID, role).Scan(&targetID)
	if err != nil {
		return err
	}
	if role == RoleViewer && admins[targetID] {
		if targetID == actor {
			return ErrSelfDemote
		}
		if len(admins) <= 1 {
			return ErrLastAdmin
		}
	}
	return tx.Commit(ctx)
}

// ListTournamentsForPlayer returns the tournaments a player participates in,
// newest first.
func (s *Store) ListTournamentsForPlayer(ctx context.Context, playerID uuid.UUID) ([]Tournament, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT t.id, t.name, t.format, t.status, t.created_by, t.created_at, t.started_at,
		       t.completed_at, t.version, t.rng_seed
		FROM tournaments t
		WHERE EXISTS (SELECT 1 FROM participants p WHERE p.tournament_id = t.id AND p.player_id = $1)
		ORDER BY t.created_at DESC
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Tournament
	for rows.Next() {
		var t Tournament
		if err := rows.Scan(&t.ID, &t.Name, &t.Format, &t.Status, &t.CreatedBy, &t.CreatedAt,
			&t.StartedAt, &t.CompletedAt, &t.Version, &t.RngSeed); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ResetAdminPassword replaces the default admin's password and ends their
// sessions. It returns ErrNotFound when the default admin does not exist yet
// (the app is still waiting for first-run setup).
func (s *Store) ResetAdminPassword(ctx context.Context, passwordHash string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var id uuid.UUID
	err = tx.QueryRow(ctx, `UPDATE users SET password_hash=$1 WHERE username='admin' RETURNING id`, passwordHash).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
