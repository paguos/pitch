-- +goose Up
-- Drop the magic-link/session auth tables and rename the user concept to "player".
-- Email is retained as optional contact info.

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS magic_links;

-- Rename users → players, and rename foreign keys throughout.
ALTER TABLE users RENAME TO players;
ALTER TABLE players ALTER COLUMN email DROP NOT NULL;

-- Rename FK columns on participants and tournaments.
ALTER TABLE participants RENAME COLUMN user_id TO player_id;
ALTER TABLE participants RENAME CONSTRAINT participants_user_id_fkey TO participants_player_id_fkey;
ALTER TABLE participants RENAME CONSTRAINT participants_tournament_id_user_id_key TO participants_tournament_id_player_id_key;

ALTER TABLE tournaments RENAME CONSTRAINT tournaments_created_by_fkey TO tournaments_created_by_players_fkey;

-- +goose Down
ALTER TABLE tournaments RENAME CONSTRAINT tournaments_created_by_players_fkey TO tournaments_created_by_fkey;
ALTER TABLE participants RENAME CONSTRAINT participants_tournament_id_player_id_key TO participants_tournament_id_user_id_key;
ALTER TABLE participants RENAME CONSTRAINT participants_player_id_fkey TO participants_user_id_fkey;
ALTER TABLE participants RENAME COLUMN player_id TO user_id;

ALTER TABLE players ALTER COLUMN email SET NOT NULL;
ALTER TABLE players RENAME TO users;

CREATE TABLE magic_links (
  token       text PRIMARY KEY,
  email       citext NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE sessions (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
