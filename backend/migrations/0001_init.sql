-- +goose Up
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       citext UNIQUE NOT NULL,
  display_name text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE teams (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name    text NOT NULL,
  league  text NOT NULL,
  country text NOT NULL,
  kind    text NOT NULL CHECK (kind IN ('club','neutral')),
  UNIQUE (name)
);
CREATE INDEX teams_league_idx ON teams(league);

CREATE TABLE tournaments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  format      text NOT NULL CHECK (format IN ('league','knockout')),
  status      text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','COMPLETED')) DEFAULT 'DRAFT',
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  version     int NOT NULL DEFAULT 1
);

CREATE TABLE participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  team_id       uuid NOT NULL REFERENCES teams(id),
  seed          int NOT NULL DEFAULT 0,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id),
  UNIQUE (tournament_id, team_id)
);
CREATE INDEX participants_tournament_idx ON participants(tournament_id);

CREATE TABLE matches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id        uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round                int NOT NULL,
  ord                  int NOT NULL,
  home_participant_id  uuid NOT NULL REFERENCES participants(id),
  away_participant_id  uuid NOT NULL REFERENCES participants(id),
  home_goals           int,
  away_goals           int,
  status               text NOT NULL CHECK (status IN ('SCHEDULED','REPORTED')) DEFAULT 'SCHEDULED',
  version              int NOT NULL DEFAULT 1,
  played_at            timestamptz
);
CREATE INDEX matches_tournament_round_idx ON matches(tournament_id, round, ord);

-- +goose Down
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS participants;
DROP TABLE IF EXISTS tournaments;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS magic_links;
DROP TABLE IF EXISTS users;
