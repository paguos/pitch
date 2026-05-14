-- +goose Up
-- 2025/26 season catalog for the top 5 European leagues.
--
-- Strategy: wipe the existing teams catalog and reinsert a fresh, complete
-- catalog. Cascading delete cleans up any referencing participants — at the
-- time this migration is written, the live DB has no tournaments/players so
-- the cascade is a no-op in practice. (If you re-run this on a populated DB,
-- be aware: every participant referencing a deleted team_id will be removed
-- too, because participants.team_id has ON DELETE behaviour configured by
-- the FK; here we manually clear participants first to make it explicit and
-- so the operation is portable.)
--
-- Counts: Premier League 20, La Liga 20, Bundesliga 18, Serie A 20,
-- Ligue 1 18. Total 96 clubs.

-- Clear any references first so the team rows can be deleted cleanly.
DELETE FROM participants;
DELETE FROM teams;

INSERT INTO teams (name, league, country, kind) VALUES
  -- =====================================================================
  -- Premier League — England (20 clubs, 2025/26)
  -- 17 surviving from 24/25 + promoted: Leeds United, Burnley, Sunderland
  -- (relegated from 24/25: Leicester City, Ipswich Town, Southampton)
  -- =====================================================================
  ('Liverpool',              'Premier League', 'England', 'club'),
  ('Arsenal',                'Premier League', 'England', 'club'),
  ('Manchester City',        'Premier League', 'England', 'club'),
  ('Chelsea',                'Premier League', 'England', 'club'),
  ('Newcastle United',       'Premier League', 'England', 'club'),
  ('Aston Villa',            'Premier League', 'England', 'club'),
  ('Nottingham Forest',      'Premier League', 'England', 'club'),
  ('Brighton & Hove Albion', 'Premier League', 'England', 'club'),
  ('AFC Bournemouth',        'Premier League', 'England', 'club'),
  ('Brentford',              'Premier League', 'England', 'club'),
  ('Fulham',                 'Premier League', 'England', 'club'),
  ('Crystal Palace',         'Premier League', 'England', 'club'),
  ('Everton',                'Premier League', 'England', 'club'),
  ('West Ham United',        'Premier League', 'England', 'club'),
  ('Manchester United',      'Premier League', 'England', 'club'),
  ('Wolverhampton Wanderers','Premier League', 'England', 'club'),
  ('Tottenham Hotspur',      'Premier League', 'England', 'club'),
  ('Leeds United',           'Premier League', 'England', 'club'),    -- promoted (Champ. 24/25 winners)
  ('Burnley',                'Premier League', 'England', 'club'),    -- promoted (Champ. 24/25 runners-up)
  ('Sunderland',             'Premier League', 'England', 'club'),    -- promoted (Champ. playoff winners)

  -- =====================================================================
  -- La Liga — Spain (20 clubs, 2025/26)
  -- 17 surviving + promoted: Levante UD, Elche CF, Real Oviedo
  -- (relegated from 24/25: Leganés, Las Palmas, Valladolid)
  -- =====================================================================
  ('Real Madrid',            'La Liga', 'Spain', 'club'),
  ('FC Barcelona',           'La Liga', 'Spain', 'club'),
  ('Atletico Madrid',        'La Liga', 'Spain', 'club'),
  ('Athletic Club',          'La Liga', 'Spain', 'club'),
  ('Villarreal CF',          'La Liga', 'Spain', 'club'),
  ('Real Betis',             'La Liga', 'Spain', 'club'),
  ('Real Sociedad',          'La Liga', 'Spain', 'club'),
  ('Sevilla FC',             'La Liga', 'Spain', 'club'),
  ('Valencia CF',            'La Liga', 'Spain', 'club'),
  ('Celta Vigo',             'La Liga', 'Spain', 'club'),
  ('CA Osasuna',             'La Liga', 'Spain', 'club'),
  ('Rayo Vallecano',         'La Liga', 'Spain', 'club'),
  ('RCD Mallorca',           'La Liga', 'Spain', 'club'),
  ('Getafe CF',              'La Liga', 'Spain', 'club'),
  ('RCD Espanyol',           'La Liga', 'Spain', 'club'),
  ('Deportivo Alaves',       'La Liga', 'Spain', 'club'),
  ('Girona FC',              'La Liga', 'Spain', 'club'),
  ('Levante UD',             'La Liga', 'Spain', 'club'),              -- promoted
  ('Elche CF',               'La Liga', 'Spain', 'club'),              -- promoted
  ('Real Oviedo',            'La Liga', 'Spain', 'club'),              -- promoted (playoff winners)

  -- =====================================================================
  -- Bundesliga — Germany (18 clubs, 2025/26)
  -- 16 surviving + promoted: Hamburger SV, 1. FC Köln
  -- (relegated from 24/25: VfL Bochum, Holstein Kiel)
  -- =====================================================================
  ('Bayern Munich',          'Bundesliga', 'Germany', 'club'),
  ('Bayer Leverkusen',       'Bundesliga', 'Germany', 'club'),
  ('Eintracht Frankfurt',    'Bundesliga', 'Germany', 'club'),
  ('Borussia Dortmund',      'Bundesliga', 'Germany', 'club'),
  ('SC Freiburg',            'Bundesliga', 'Germany', 'club'),
  ('1. FSV Mainz 05',        'Bundesliga', 'Germany', 'club'),
  ('RB Leipzig',             'Bundesliga', 'Germany', 'club'),
  ('VfB Stuttgart',          'Bundesliga', 'Germany', 'club'),
  ('Borussia Monchengladbach','Bundesliga', 'Germany', 'club'),
  ('VfL Wolfsburg',          'Bundesliga', 'Germany', 'club'),
  ('FC Augsburg',            'Bundesliga', 'Germany', 'club'),
  ('TSG Hoffenheim',         'Bundesliga', 'Germany', 'club'),
  ('Werder Bremen',          'Bundesliga', 'Germany', 'club'),
  ('1. FC Union Berlin',     'Bundesliga', 'Germany', 'club'),
  ('FC St. Pauli',           'Bundesliga', 'Germany', 'club'),
  ('1. FC Heidenheim',       'Bundesliga', 'Germany', 'club'),
  ('Hamburger SV',           'Bundesliga', 'Germany', 'club'),          -- promoted (2.BL champions)
  ('1. FC Koln',             'Bundesliga', 'Germany', 'club'),          -- promoted (2.BL runners-up)

  -- =====================================================================
  -- Serie A — Italy (20 clubs, 2025/26)
  -- 17 surviving + promoted: Sassuolo, Pisa, Cremonese
  -- (relegated from 24/25: Venezia, Empoli, Monza)
  -- =====================================================================
  ('Napoli',                 'Serie A', 'Italy', 'club'),
  ('Inter Milan',            'Serie A', 'Italy', 'club'),
  ('Atalanta',               'Serie A', 'Italy', 'club'),
  ('Juventus',               'Serie A', 'Italy', 'club'),
  ('AS Roma',                'Serie A', 'Italy', 'club'),
  ('AC Milan',               'Serie A', 'Italy', 'club'),
  ('Bologna',                'Serie A', 'Italy', 'club'),
  ('SS Lazio',               'Serie A', 'Italy', 'club'),
  ('Fiorentina',             'Serie A', 'Italy', 'club'),
  ('Torino',                 'Serie A', 'Italy', 'club'),
  ('Udinese',                'Serie A', 'Italy', 'club'),
  ('Genoa',                  'Serie A', 'Italy', 'club'),
  ('Como',                   'Serie A', 'Italy', 'club'),
  ('Hellas Verona',          'Serie A', 'Italy', 'club'),
  ('Cagliari',               'Serie A', 'Italy', 'club'),
  ('Parma',                  'Serie A', 'Italy', 'club'),
  ('Lecce',                  'Serie A', 'Italy', 'club'),
  ('Sassuolo',               'Serie A', 'Italy', 'club'),                -- promoted (Serie B champions)
  ('Pisa',                   'Serie A', 'Italy', 'club'),                -- promoted (Serie B runners-up)
  ('Cremonese',              'Serie A', 'Italy', 'club'),                -- promoted (Serie B playoff winners)

  -- =====================================================================
  -- Ligue 1 — France (18 clubs, 2025/26)
  -- 15 surviving + promoted: Lorient, Paris FC, Metz
  -- (relegated from 24/25: Saint-Etienne, Montpellier, Reims via playoff)
  -- Note: 24/25 was the first 18-team Ligue 1 season; 25/26 stays at 18.
  -- =====================================================================
  ('Paris Saint-Germain',    'Ligue 1', 'France', 'club'),
  ('Olympique de Marseille', 'Ligue 1', 'France', 'club'),
  ('AS Monaco',              'Ligue 1', 'France', 'club'),
  ('OGC Nice',               'Ligue 1', 'France', 'club'),
  ('LOSC Lille',              'Ligue 1', 'France', 'club'),
  ('Olympique Lyonnais',     'Ligue 1', 'France', 'club'),
  ('RC Strasbourg',          'Ligue 1', 'France', 'club'),
  ('RC Lens',                'Ligue 1', 'France', 'club'),
  ('Stade Brestois',         'Ligue 1', 'France', 'club'),
  ('Toulouse FC',            'Ligue 1', 'France', 'club'),
  ('Auxerre',                'Ligue 1', 'France', 'club'),
  ('FC Nantes',              'Ligue 1', 'France', 'club'),
  ('Angers SCO',             'Ligue 1', 'France', 'club'),
  ('Stade Rennais',          'Ligue 1', 'France', 'club'),
  ('Le Havre AC',            'Ligue 1', 'France', 'club'),
  ('FC Lorient',             'Ligue 1', 'France', 'club'),                -- promoted (Ligue 2 champions)
  ('Paris FC',               'Ligue 1', 'France', 'club'),                -- promoted (Ligue 2 runners-up)
  ('FC Metz',                'Ligue 1', 'France', 'club')                 -- promoted (Ligue 1 playoff winners)
ON CONFLICT (name) DO NOTHING;

-- +goose Down
-- Down is intentionally a no-op: restoring the previous catalog is out of
-- scope, and Goose will run any earlier seed files (which were idempotent)
-- if the deployment migrates back.
SELECT 1;
