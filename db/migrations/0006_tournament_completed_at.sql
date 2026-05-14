-- +goose Up
-- Track when a tournament was marked COMPLETED. Set by both the manual
-- POST /tournaments/:id/end endpoint (league + knockout safety valve) and by
-- the knockout auto-completion path when the final is scored.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- +goose Down
ALTER TABLE tournaments DROP COLUMN IF EXISTS completed_at;
