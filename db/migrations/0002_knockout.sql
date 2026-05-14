-- +goose Up

-- Reproducible seeding for knockout brackets.
ALTER TABLE tournaments ADD COLUMN rng_seed BIGINT;

-- Knockout matches may have empty slots while their feeder matches are still
-- pending. Make participant FKs nullable.
ALTER TABLE matches ALTER COLUMN home_participant_id DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN away_participant_id DROP NOT NULL;

-- Expand the status check to cover the knockout lifecycle.
-- League keeps using SCHEDULED→REPORTED. Knockout uses PENDING (waiting for
-- feeder) → PLAYABLE (both sides known) → COMPLETED.
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('SCHEDULED','PLAYABLE','PENDING','REPORTED','COMPLETED'));

-- Bracket wiring: each non-final match points at the match that consumes its
-- winner, and into which slot (HOME or AWAY).
ALTER TABLE matches ADD COLUMN next_match_id UUID REFERENCES matches(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN next_match_slot TEXT
  CHECK (next_match_slot IS NULL OR next_match_slot IN ('HOME','AWAY'));

-- +goose Down
ALTER TABLE matches DROP COLUMN IF EXISTS next_match_slot;
ALTER TABLE matches DROP COLUMN IF EXISTS next_match_id;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
  CHECK (status IN ('SCHEDULED','REPORTED'));
ALTER TABLE matches ALTER COLUMN home_participant_id SET NOT NULL;
ALTER TABLE matches ALTER COLUMN away_participant_id SET NOT NULL;
ALTER TABLE tournaments DROP COLUMN IF EXISTS rng_seed;
