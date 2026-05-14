-- +goose Up
-- The "acting as" concept has been removed. Tournament creation no longer
-- carries an actor, so `created_by` is no longer required. Keep the column
-- (and FK to players) nullable for historical rows, and stop writing to it.

ALTER TABLE tournaments ALTER COLUMN created_by DROP NOT NULL;

-- +goose Down
-- This Down is best-effort: it will fail if any rows have NULL created_by.
ALTER TABLE tournaments ALTER COLUMN created_by SET NOT NULL;
