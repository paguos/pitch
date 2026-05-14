-- +goose Up
-- Seed starter players so the app is immediately usable after `make up && make seed`.
-- ON CONFLICT keeps re-runs idempotent for a database that already has any of
-- these. We dedupe on display_name because the table doesn't have a unique
-- index there — but `WHERE NOT EXISTS` is the safer construct.
INSERT INTO players (display_name, email)
SELECT v.display_name, v.email FROM (VALUES
  ('Alice', 'alice@example.com'),
  ('Bob',   'bob@example.com'),
  ('Carol', 'carol@example.com'),
  ('Dave',  'dave@example.com')
) AS v(display_name, email)
WHERE NOT EXISTS (
  SELECT 1 FROM players p
   WHERE p.display_name = v.display_name
      OR p.email = v.email::citext
);

-- +goose Down
DELETE FROM players WHERE display_name IN ('Alice','Bob','Carol','Dave');
