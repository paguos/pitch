-- +goose Up
-- Add international national teams to the catalog, alongside the 96 clubs
-- seeded by migration 0007.
--
-- The teams table already carries a `kind` column (introduced in 0001) used
-- to distinguish club entries. We extend the allowed values to include
-- 'national' and seed ~50 of the strongest FIFA national teams across the
-- six FIFA confederations.
--
-- For national rows:
--   - `country` is the nation itself (e.g. France national team → 'France')
--   - `league`  is the confederation code (UEFA / CONMEBOL / CONCACAF /
--                AFC / CAF) so it remains useful for future grouping/UI.
--   - `name`    is just the nation name (e.g. 'Brazil'), since that is how
--                national sides are colloquially referenced.
--
-- Counts (52 total):
--   UEFA      22, CONMEBOL  9, CONCACAF 6, AFC 7, CAF 8.

-- Relax the kind CHECK to include 'national'. Postgres requires a drop &
-- re-add since CHECK constraints aren't directly mutable.
ALTER TABLE teams DROP CONSTRAINT teams_kind_check;
ALTER TABLE teams
  ADD CONSTRAINT teams_kind_check
  CHECK (kind IN ('club','neutral','national'));

INSERT INTO teams (name, league, country, kind) VALUES
  -- =====================================================================
  -- UEFA — Europe (22)
  -- =====================================================================
  ('France',         'UEFA', 'France',         'national'),
  ('England',        'UEFA', 'England',        'national'),
  ('Spain',          'UEFA', 'Spain',          'national'),
  ('Germany',        'UEFA', 'Germany',        'national'),
  ('Italy',          'UEFA', 'Italy',          'national'),
  ('Portugal',       'UEFA', 'Portugal',       'national'),
  ('Netherlands',    'UEFA', 'Netherlands',    'national'),
  ('Belgium',        'UEFA', 'Belgium',        'national'),
  ('Croatia',        'UEFA', 'Croatia',        'national'),
  ('Switzerland',    'UEFA', 'Switzerland',    'national'),
  ('Denmark',        'UEFA', 'Denmark',        'national'),
  ('Austria',        'UEFA', 'Austria',        'national'),
  ('Poland',         'UEFA', 'Poland',         'national'),
  ('Sweden',         'UEFA', 'Sweden',         'national'),
  ('Ukraine',        'UEFA', 'Ukraine',        'national'),
  ('Türkiye',        'UEFA', 'Türkiye',        'national'),
  ('Serbia',         'UEFA', 'Serbia',         'national'),
  ('Wales',          'UEFA', 'Wales',          'national'),
  ('Hungary',        'UEFA', 'Hungary',        'national'),
  ('Czech Republic', 'UEFA', 'Czech Republic', 'national'),
  ('Norway',         'UEFA', 'Norway',         'national'),
  ('Scotland',       'UEFA', 'Scotland',       'national'),

  -- =====================================================================
  -- CONMEBOL — South America (9)
  -- =====================================================================
  ('Brazil',     'CONMEBOL', 'Brazil',     'national'),
  ('Argentina',  'CONMEBOL', 'Argentina',  'national'),
  ('Uruguay',    'CONMEBOL', 'Uruguay',    'national'),
  ('Colombia',   'CONMEBOL', 'Colombia',   'national'),
  ('Ecuador',    'CONMEBOL', 'Ecuador',    'national'),
  ('Peru',       'CONMEBOL', 'Peru',       'national'),
  ('Chile',      'CONMEBOL', 'Chile',      'national'),
  ('Paraguay',   'CONMEBOL', 'Paraguay',   'national'),
  ('Venezuela',  'CONMEBOL', 'Venezuela',  'national'),

  -- =====================================================================
  -- CONCACAF — North & Central America (6)
  -- =====================================================================
  ('USA',         'CONCACAF', 'USA',         'national'),
  ('Mexico',      'CONCACAF', 'Mexico',      'national'),
  ('Canada',      'CONCACAF', 'Canada',      'national'),
  ('Costa Rica',  'CONCACAF', 'Costa Rica',  'national'),
  ('Panama',      'CONCACAF', 'Panama',      'national'),
  ('Jamaica',     'CONCACAF', 'Jamaica',     'national'),

  -- =====================================================================
  -- AFC — Asia (7)
  -- =====================================================================
  ('Japan',         'AFC', 'Japan',         'national'),
  ('South Korea',   'AFC', 'South Korea',   'national'),
  ('Iran',          'AFC', 'Iran',          'national'),
  ('Australia',     'AFC', 'Australia',     'national'),
  ('Saudi Arabia',  'AFC', 'Saudi Arabia',  'national'),
  ('Qatar',         'AFC', 'Qatar',         'national'),
  ('Iraq',          'AFC', 'Iraq',          'national'),

  -- =====================================================================
  -- CAF — Africa (8)
  -- =====================================================================
  ('Morocco',     'CAF', 'Morocco',     'national'),
  ('Senegal',     'CAF', 'Senegal',     'national'),
  ('Egypt',       'CAF', 'Egypt',       'national'),
  ('Algeria',     'CAF', 'Algeria',     'national'),
  ('Nigeria',     'CAF', 'Nigeria',     'national'),
  ('Tunisia',     'CAF', 'Tunisia',     'national'),
  ('Ivory Coast', 'CAF', 'Ivory Coast', 'national'),
  ('Cameroon',    'CAF', 'Cameroon',    'national'),
  ('Ghana',       'CAF', 'Ghana',       'national');
