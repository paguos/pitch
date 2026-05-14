# Data Model

Postgres 16. Schema as it stands after migrations `0001` through `0009`
(under `db/migrations/`). The historical magic-link / sessions tables
introduced by `0001` were dropped by `0003`; they are intentionally
omitted from the table list below.

Extensions used: `citext` (case-insensitive email), `pgcrypto`
(`gen_random_uuid()`).

## ER diagram

```
                       ┌────────────┐
                       │  players   │
                       ├────────────┤
                       │ id  (PK)   │
                       │ email      │ citext, unique, nullable
                       │ display_name
                       └─────┬──────┘
                             │
                             │  player_id (FK)
                             ▼
┌──────────────┐      ┌────────────────┐      ┌───────────┐
│ tournaments  │◀─────┤  participants  ├─────▶│   teams   │
├──────────────┤  FK  ├────────────────┤  FK  ├───────────┤
│ id  (PK)     │      │ id  (PK)       │      │ id  (PK)  │
│ name         │      │ tournament_id  │      │ name uniq │
│ format       │      │ player_id      │      │ league    │
│ status       │      │ team_id        │      │ country   │
│ created_by   │ ┐    │ seed           │      │ kind      │
│ rng_seed     │ │    │ joined_at      │      │ logo_url  │
│ completed_at │ │    │ UNIQUE(t, p)   │      └───────────┘
│ version      │ │    │ UNIQUE(t, t)   │
└──────────────┘ │    └────────────────┘
                 │  ▲           ▲
                 │  │           │ home_participant_id, away_participant_id
                 │  │           │  (FK, both nullable post-0002)
                 │  │  ┌────────┴────────┐
                 │  │  │     matches     │
                 │  │  ├─────────────────┤
                 │  └──┤ tournament_id   │ FK → tournaments(id) ON DELETE CASCADE
                 │     │ round, ord      │
                 │     │ home/away goals │ nullable
                 │     │ status          │
                 │     │ version         │ optimistic lock
                 │     │ played_at       │
                 │     │ next_match_id   │ FK → matches(id) ON DELETE SET NULL
                 │     │ next_match_slot │ 'HOME' | 'AWAY'
                 │     └─────────────────┘
                 │
                 └── created_by FK → players(id), nullable since 0005
```

## Tables

### `players`

Roster of humans. (Originally `users` in `0001`; renamed by `0003` after
the auth scheme was removed.)

| Column         | Type          | Notes                                         |
|----------------|---------------|-----------------------------------------------|
| `id`           | `uuid PK`     | `gen_random_uuid()`                           |
| `email`        | `citext`      | unique, **nullable** (was required pre-0003)  |
| `display_name` | `text`        | required                                      |
| `created_at`   | `timestamptz` | default `now()`                               |

`email` is contact info only — no auth uses it. The case-insensitive
unique index lives on the `citext` column itself.

### `teams`

Catalog of clubs + national teams.

| Column     | Type        | Notes                                       |
|------------|-------------|---------------------------------------------|
| `id`       | `uuid PK`   | `gen_random_uuid()`                         |
| `name`     | `text`      | **unique**                                  |
| `league`   | `text`      | league name for clubs, FIFA confederation code for national teams |
| `country`  | `text`      |                                             |
| `kind`     | `text`      | CHECK `IN ('club','neutral','national')`    |
| `logo_url` | `text`      | nullable; relative path under `/logos/...`  |

Index: `teams_league_idx` on `(league)`.

After `0007` the catalog holds the 96 clubs of the 2025/26 season for
the top five European leagues. `0008` adds ~52 national teams using
`league = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'AFC' | 'CAF'`. `0009`
populates `logo_url`.

### `tournaments`

| Column         | Type          | Notes                                                    |
|----------------|---------------|----------------------------------------------------------|
| `id`           | `uuid PK`     | `gen_random_uuid()`                                      |
| `name`         | `text`        | required                                                 |
| `format`       | `text`        | CHECK `IN ('league','knockout')`                         |
| `status`       | `text`        | CHECK `IN ('DRAFT','ACTIVE','COMPLETED')`, default `DRAFT` |
| `created_by`   | `uuid`        | FK `players(id)`; **nullable** since `0005`              |
| `created_at`   | `timestamptz` | default `now()`                                          |
| `started_at`   | `timestamptz` | set on `DRAFT → ACTIVE`                                  |
| `completed_at` | `timestamptz` | set on `ACTIVE → COMPLETED` (added in `0006`)            |
| `version`      | `int`         | reserved for future optimistic locking; not enforced yet |
| `rng_seed`     | `bigint`      | nullable; populated for `format='knockout'` on start     |

`created_by` is no longer written by the API (the "acting as" concept was
removed). The column remains as nullable history for any rows from earlier
iterations.

### `participants`

Join table — a player participating in a tournament with a specific team.

| Column          | Type          | Notes                                          |
|-----------------|---------------|------------------------------------------------|
| `id`            | `uuid PK`     | `gen_random_uuid()`                            |
| `tournament_id` | `uuid`        | FK `tournaments(id)` `ON DELETE CASCADE`       |
| `player_id`     | `uuid`        | FK `players(id)` (renamed from `user_id` in `0003`) |
| `team_id`       | `uuid`        | FK `teams(id)`                                 |
| `seed`          | `int`         | default `0`; reserved for future seeding UI     |
| `joined_at`     | `timestamptz` | default `now()`                                |

Unique constraints:
- `(tournament_id, player_id)` — a player can only join a tournament once
- `(tournament_id, team_id)` — each team is owned by at most one player per tournament

Index: `participants_tournament_idx` on `(tournament_id)`.

### `matches`

| Column                 | Type          | Notes                                                                       |
|------------------------|---------------|-----------------------------------------------------------------------------|
| `id`                   | `uuid PK`     | `gen_random_uuid()`                                                         |
| `tournament_id`        | `uuid`        | FK `tournaments(id)` `ON DELETE CASCADE`                                    |
| `round`                | `int`         | 1-indexed                                                                    |
| `ord`                  | `int`         | 0-indexed position within the round                                          |
| `home_participant_id`  | `uuid`        | FK `participants(id)`; **nullable** since `0002` (knockout pending slots)   |
| `away_participant_id`  | `uuid`        | FK `participants(id)`; **nullable** since `0002`                            |
| `home_goals`           | `int`         | nullable                                                                     |
| `away_goals`           | `int`         | nullable                                                                     |
| `status`               | `text`        | CHECK `IN ('SCHEDULED','PLAYABLE','PENDING','REPORTED','COMPLETED')`        |
| `version`              | `int`         | optimistic lock, default `1`                                                |
| `played_at`            | `timestamptz` | set when score is submitted                                                  |
| `next_match_id`        | `uuid`        | FK `matches(id)` `ON DELETE SET NULL`; knockout-only winner-propagation FK   |
| `next_match_slot`      | `text`        | CHECK `IS NULL OR IN ('HOME','AWAY')`                                       |

Index: `matches_tournament_round_idx` on `(tournament_id, round, ord)`.

**Status by format:**
- League: `SCHEDULED → REPORTED`.
- Knockout: `PENDING → PLAYABLE → COMPLETED`.

The combined CHECK constraint accepts the union of both vocabularies.

## Deletion semantics

- `DELETE FROM tournaments` cascades to `participants` and `matches`.
- `DELETE FROM players` is **rejected at the application layer** if any
  participant references the player. There is no `ON DELETE CASCADE`
  from `participants.player_id` to `players.id` — the FK refuses the
  delete, the store layer maps that to `ErrPlayerInUse`, and the API
  returns `409`. This preserves historical tournament rows.
- `DELETE FROM teams` is allowed (clubs come and go between seasons),
  but `participants.team_id` has no `ON DELETE` clause, so the FK will
  refuse to delete a team that's still referenced. Migration `0007`
  works around this by clearing participants first.

## Migration index

Files under `db/migrations/`, applied in lexical order by goose on
backend boot.

| File                                | Subject                                                          |
|-------------------------------------|------------------------------------------------------------------|
| `0001_init.sql`                     | Initial schema (with magic-link auth — later dropped by `0003`)  |
| `0002_knockout.sql`                 | Add `rng_seed`, expand match status check, next-match pointers   |
| `0003_players.sql`                  | Drop auth tables; rename `users` → `players`; `email` optional   |
| `0004_seed_players.sql`             | Idempotent seed of Alice/Bob/Carol/Dave                          |
| `0005_drop_created_by_not_null.sql` | `tournaments.created_by` becomes nullable                        |
| `0006_tournament_completed_at.sql`  | Add `tournaments.completed_at`                                    |
| `0007_teams_2526.sql`               | Truncate + reseed teams for 25/26 (96 clubs, top 5 leagues)      |
| `0008_national_teams.sql`           | Allow `kind='national'`; seed ~52 national teams                 |
| `0009_team_logos.sql`               | Add `teams.logo_url`; map ~150 crests under `frontend/public/logos/` |
