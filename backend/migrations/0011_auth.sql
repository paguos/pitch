-- +goose Up
-- Authentication: a bootstrap password admin plus Google-signed-in players.
-- A viewer/admin account is linked to a player; the player's email is the
-- allowlist entry. The bootstrap admin has a username and password and no player.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      citext UNIQUE,
  password_hash text,
  role          text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  player_id     uuid UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  google_sub    text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CHECK (username IS NOT NULL OR player_id IS NOT NULL)
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- +goose Down
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
