# Architecture

A self-hosted FIFA tournament organizer with two formats — **league**
(round-robin) and **knockout** (single elimination). Stateless Go backend,
React SPA, Postgres. No authentication.

Historical planning artifacts live under [`plan.md`](plan.md) and
[`plans/`](plans/). This document describes the system as it stands today.

## Components

```
┌──────────────┐    HTTP/JSON    ┌──────────────┐    pgx pool    ┌──────────┐
│  React SPA   │ ──────────────▶ │  Go backend  │ ──────────────▶ │ Postgres │
│  Vite + TS   │                 │ chi · pgx    │                 │   16     │
└──────────────┘                 └──────────────┘                 └──────────┘
       :5173                            :8080                        :5433
```

- **`backend/`** — single Go binary. chi router, pgx/v5 connection pool,
  hand-written SQL (no ORM, no codegen). Migrations run on boot via
  embedded goose.
- **`frontend/`** — React 18 + Vite + TypeScript + Tailwind. Hand-rolled
  UI primitives under `src/components/ui.tsx` (a minimal shadcn-style
  subset). No global state library; pages re-fetch on user action.
- **`db/`** — goose-style SQL migrations under `db/migrations/`, plus a
  team-catalog seed file at `db/seed/teams.sql`.

## Domain model

The five core entities, with their key invariants:

| Entity        | Identity                       | Cardinality                                            | Notes                                                                    |
|---------------|--------------------------------|--------------------------------------------------------|--------------------------------------------------------------------------|
| `Player`      | UUID                           | many                                                   | `display_name` required; `email` optional contact info, not used for auth |
| `Team`        | UUID                           | many                                                   | catalog of clubs + national teams; `kind ∈ {club, neutral, national}`    |
| `Tournament`  | UUID                           | many                                                   | `format ∈ {league, knockout}`, `status ∈ {DRAFT, ACTIVE, COMPLETED}`     |
| `Participant` | UUID                           | one per `(tournament, player)` and `(tournament, team)`| join table — picks a team for a player within a tournament                |
| `Match`       | UUID                           | many per tournament                                    | round/ord ordered; carries score, version, optional bracket pointer       |

```
                  ┌──────────┐
                  │ Player   │
                  └────┬─────┘
                       │
                       │ player_id
                       ▼
┌──────────────┐  ┌──────────────┐  team_id  ┌──────────┐
│ Tournament   │◀─┤ Participant  ├──────────▶│  Team    │
└──────┬───────┘  └──────┬───────┘           └──────────┘
       │ tournament_id   │ home / away
       ▼                 │
┌──────────────┐ ◀───────┘
│  Match       │ ──┐ next_match_id (knockout only)
└──────────────┘ ◀─┘
```

## Tournament lifecycle

```
            POST /tournaments
                  │
                  ▼
          ┌────────────────┐
          │    DRAFT       │  ── joins, leaves, team-swaps allowed
          └────────┬───────┘
                   │ POST /tournaments/:id/start
                   ▼
          ┌────────────────┐
          │   ACTIVE       │  ── scores submitted via PUT /matches/:id/score
          └────────┬───────┘
                   │
                   │  league:    POST /tournaments/:id/end (manual)
                   │  knockout:  auto on final scored, or POST /:id/end (safety valve)
                   ▼
          ┌────────────────┐
          │  COMPLETED     │  ── read-only
          └────────────────┘
```

- **DRAFT → ACTIVE** atomically inserts all fixtures (league) or the
  full bracket (knockout) in a single transaction.
- **ACTIVE → COMPLETED**:
  - **League** has no natural last-fixture trigger, so the operator marks
    it complete via `POST /tournaments/:id/end`. The UI nudges them with
    a hint when all matches are reported (and warns if some still aren't).
  - **Knockout** auto-completes when the final is scored.
  - The `POST /:id/end` endpoint is idempotent and works as a safety
    valve for knockout too (e.g. operator wants to abandon early).

## League format

### Schedule

`internal/league.RoundRobin(n)` implements the **circle method** to
generate a single round-robin schedule. For odd `n` it inserts a bye seat
so every round has `⌊n/2⌋` real matches. The result is deterministic
given `n` — no randomness, no seeding.

Each fixture is persisted as a `Match` row with `round`, `ord`,
`home_participant_id`, `away_participant_id`, `status = SCHEDULED`,
`version = 1`.

### Standings

`internal/league.Standings(...)` computes the table from the participant
list + reported matches. **Tiebreaker hierarchy**:

1. Points (Win = 3, Draw = 1, Loss = 0)
2. Goal difference
3. Goals for
4. Name (alphabetic — deterministic stable order)

Standings are recomputed on every `GET /tournaments/:id` from the matches
that exist at read time. There is no materialized standings table.

## Knockout format

### Bracket construction

`internal/knockout.BuildBracket(participants, seed)`:

1. Shuffle the `n` participants deterministically using `seed`
   (`rand.Source` from Go's stdlib `math/rand`).
2. Pad up to the next power of two `B`. The `B - n` shortfall becomes
   **byes**, and they go to the top seeds (lowest positions in standard
   bracket order: 1, 16, 8, 9, 4, 13, ...).
3. Build placeholder matches for every round 2..R as `PENDING`.
4. For each pair `(2k, 2k+1)` in the seeded slot array:
   - Both filled → real round-1 match, `PLAYABLE`.
   - Exactly one filled → bye; the present participant is pre-placed
     directly into the corresponding round-2 slot (no bye match is
     materialized).
   - Both empty → not possible with our seeding.
5. Round-2 matches with both slots already filled (because both
   children were byes) flip to `PLAYABLE`.
6. Every non-final match carries `next_round`, `next_ord`, `next_slot ∈
   {HOME, AWAY}` so winner propagation has nowhere to branch.

The `rng_seed` is persisted on the tournament row so the bracket is
reproducible.

### Match state machine (knockout)

```
   PENDING ──(both feeders resolved)──▶ PLAYABLE ──(score submitted)──▶ COMPLETED
                                            ▲
                                            │
                                            └── pre-placed via bye
```

League matches use a simpler two-state machine: `SCHEDULED → REPORTED`.

### Winner propagation

When a knockout match is scored:

1. Validate not a draw (`422 unprocessable entity` if drawn).
2. Validate the version matches (optimistic lock, `409` otherwise).
3. Validate the **downstream** match isn't already `COMPLETED` — if it is,
   the edit is rejected with `409 downstream match already completed; reset
   it first`. This prevents accidental retroactive edits that would
   invalidate matches further down the bracket.
4. Update the match row to `COMPLETED` with the score.
5. Write the winner's participant id into the parent match's `HOME` or
   `AWAY` slot per `next_match_slot`.
6. If both slots of the parent are now filled, flip its status to
   `PLAYABLE`.
7. If this was the final (no parent), the tournament auto-transitions
   to `COMPLETED` and `completed_at` is set.

Steps 4–6 happen in a single transaction with the score update.

### Reset

A reset path (admin operation to roll a match back to `PLAYABLE` and undo
downstream propagation) is documented as future work in the root README
but is not implemented today.

## Concurrency

Every `Match` row has a monotonic `version int` column. Score submission
is `PUT /matches/:id/score` with `{home_goals, away_goals, version}`:
the update only fires if the stored version equals the submitted one,
otherwise the API returns `409 version conflict`. The frontend refreshes
its view on conflict.

There is no global tournament-level locking; concurrency is per-match.
The atomic DRAFT→ACTIVE transition uses a single transaction at the SQL
level, so a double-`start` simply loses the race.

## Players CRUD and referential integrity

Players are a small CRUD: list, create, edit, delete. Delete returns
`409` if the player is referenced by any participant row (past or
current). The frontend surfaces this inline in the same `AlertDialog`
modal — there is no cascading delete. This preserves tournament history.

The UI never uses `window.confirm` / `window.alert` / `window.prompt`;
all confirmations are routed through the in-app `AlertDialog`
component.

## Frontend pickers

Team and player pickers use the custom `StyledSelect` component
(`frontend/src/components/StyledSelect.tsx`) — a button-triggered
listbox — rather than the native `<select>`. This is consistent across
the join form, the new-tournament form, and the players page.

## Pure, well-tested logic

Three modules contain pure functions with table-driven unit tests:

- `internal/league/schedule.go` — `RoundRobin(n)`
- `internal/league/standings.go` — `Standings(refs, matches)`
- `internal/knockout/bracket.go` — `BuildBracket(participants, seed)`

These are deliberately decoupled from `pgx` and `chi`, so they're easy to
reason about and to regression-test as the rules evolve.

## Migrations

See [`data-model.md`](data-model.md) for the full schema. The migration
history (under `db/migrations/`):

| #     | Subject                                                                |
|-------|------------------------------------------------------------------------|
| 0001  | Initial schema: users + magic-link + sessions + teams + tournaments    |
| 0002  | Knockout columns on `matches` (next pointer, expanded status check)    |
| 0003  | Drop magic-link/session tables; rename `users` → `players`             |
| 0004  | Seed starter players (Alice, Bob, Carol, Dave) idempotently            |
| 0005  | Drop `tournaments.created_by NOT NULL`                                 |
| 0006  | Add `tournaments.completed_at`                                         |
| 0007  | Reseed teams catalog for 2025/26 (96 clubs, top 5 leagues)             |
| 0008  | Expand `teams.kind` to allow `national`; seed ~52 national teams       |
| 0009  | Add `teams.logo_url`; populate from `frontend/public/logos/`           |

## API reference

See [`api.md`](api.md).
