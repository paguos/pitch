# Pitch — FIFA Tournament Console

![CI](https://github.com/paguos/fifa-tournament/actions/workflows/ci.yml/badge.svg)

A self-hosted tournament organizer for FIFA-style 1v1 contests. This iteration
supports both **league** (round robin) and **knockout** (single elimination)
formats. Everything sits behind a sign-in: an **admin** runs the show, and
players sign in with Google to follow their results (read-only).

## Quickstart

Requires Docker + Make. From the repo root:

```bash
make up       # build & start db + backend + frontend
```

Then open <http://localhost:5173>. The teams catalog (96 clubs from the
2025/26 top-five European seasons + ~52 national teams) is loaded by
migrations on backend boot — no separate seed step required for new
volumes. The legacy `make seed` target remains for re-loading the
historical `db/seed/teams.sql` fixture into an existing volume.

```bash
make down     # stop
make clean    # stop + drop volumes
make test     # backend unit tests
```

A handful of starter players (Alice, Bob, Carol, Dave) are seeded by migration
`0004_seed_players.sql`, so the app is immediately usable. If those names
already exist, the seed is skipped.

## Sign-in and roles

- **First run:** a fresh app (no admin yet) opens on a setup screen where you
  choose the password for the `admin` account. That is the only time the
  screen appears. On a deployed instance, open it right after the first deploy.
  Local dev skips it: `docker-compose.yml` sets `DEV_ADMIN_PASSWORD`, so a fresh
  database already has `admin` / `admin-dev-only`. (Dev only: the server
  refuses to start with it outside `APP_ENV=dev`, and it never changes an
  existing admin.)
- **Admin** can change anything: players, tournaments, scores. Admins can also
  give admin rights to other players (Players tab → *make admin*). The last
  admin can't be removed, and you can't remove your own rights.
- **Players** sign in with Google. To let someone in, an admin sets their
  **email** on their player (Players tab → edit). Only that Google account can
  sign in as them; they land as a read-only **viewer**, see every tournament,
  and get a **profile** with their record, plus each tournament's matches and standing. Changing the
  player's email signs them out and unlinks the Google account.
- **Lost the admin password?** Run
  `NEW_ADMIN_PASSWORD='…' /app/server reset-admin-password` inside the backend
  container (`docker compose exec -e NEW_ADMIN_PASSWORD=… backend /app/server reset-admin-password`,
  or `kubectl exec` on the cluster). It also signs the admin out everywhere.
- **Local dev** uses a fake Google page (`GOOGLE_PROVIDER=fake`, dev only):
  type the email to sign in as. To try the real flow, set
  `GOOGLE_PROVIDER=google`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and
  register `http://localhost:5173/api/auth/google/callback` on the Google OAuth
  client.

## Pick a player when adding them

There is **no global "acting player"**. When you add someone to a tournament, the join form lets you
pick **which player** (from the players list) and **which team** right there
in the form. There's no header dropdown to switch identities, no
`localStorage` flag, no `actor_player_id` on requests.

Concretely:

- `POST /tournaments` takes just `{name, format}` (admin only).
- `POST /tournaments/{id}/participants` takes `{player_id, team_id}` — the
  player is selected explicitly per add, so the same browser can add many
  players to the same tournament.
- `DELETE /tournaments/{id}/participants/{playerID}` removes a participant.
- `PATCH /tournaments/{id}/participants/{playerID}` body `{team_id}` swaps
  their team.
- `PUT /matches/{id}/score` takes `{home_goals, away_goals, version}` — no
  actor attribution.

Who may do what is decided by the signed-in user's role, not by these fields.

## Players

The **Players** tab is a small CRUD: list, create, edit, delete. All deletes
go through an in-app `AlertDialog` (never `window.confirm`) with explicit
confirmation. Deleting a player that's referenced by a tournament returns
HTTP 409 and is surfaced inline inside the same dialog — referential integrity
wins over silent cascade so past tournament history stays intact.

## Tech stack

- **Go 1.22** — single self-contained backend binary, easy to vendor and ship.
- **chi** — small, idiomatic HTTP router; we only need pattern matching + middleware.
- **pgx/v5** — Postgres driver + pool; we write SQL by hand, no ORM, no codegen.
- **Postgres 16** — relational source of truth; CHECK constraints + unique indexes carry the domain invariants.
- **React 18 + Vite + TypeScript** — fast HMR, zero-config bundling, strict types.
- **TailwindCSS** — utility CSS; the design system lives in a handful of tokens in `tailwind.config.js` + a small palette in `src/index.css`.
- **shadcn-style primitives** — hand-rolled under `frontend/src/components/ui.tsx` rather than pulled from a generator; keeps the dependency tree small and the surface auditable.

## Architecture

```
┌──────────────┐    HTTP        ┌──────────────┐    pgx pool    ┌──────────┐
│  React SPA   │ ─────────────▶ │  Go backend  │ ─────────────▶ │ Postgres │
│  Vite + TS   │                │ chi · pgx    │                │   16     │
└──────────────┘                └──────────────┘                └──────────┘
       :5173                            :8080                       :5433
```

- **Backend** — single Go binary. Migrations run via goose on boot.
- **Concurrency** — `matches.version` provides optimistic locking on score
  edits; submitting a stale version returns `409 version conflict`.
- **Atomicity** — `POST /tournaments/{id}/start` transitions DRAFT→ACTIVE and
  inserts all fixtures (or bracket matches) in a single transaction.

For the full picture see [`docs/architecture.md`](docs/architecture.md),
[`docs/api.md`](docs/api.md), and [`docs/data-model.md`](docs/data-model.md).

### Pure logic (well-tested)

- **`internal/league.RoundRobin(n)`** — circle method, deterministic.
- **`internal/league.Standings(...)`** — Points (W=3, D=1) → GD → GF → name.
- **`internal/knockout.BuildBracket(...)`** — single-elim bracket with byes
  pre-placed into round 2; deterministic given a seed.

## What is verified

- Player CRUD + delete-confirmation in-app modal (Chrome MCP transcript).
- League golden path: 2 players → create → join → start → score → standings.
- Knockout golden path: 5 players → bracket shape → draws rejected → winner
  propagation → downstream-completed-edit rejected → champion.
- Optimistic locking on score edits (stale version → 409).
- Frontend type-check (`tsc -b`) clean; backend `go build ./...` + `go test
  ./...` clean.

See `docs/local-verification.md` for full transcripts and `scripts/golden-path*.sh`
for reproducible end-to-end smoke tests.

## Future work

- **More roles.** There are two: `admin` and read-only `viewer`. A role that
  can report scores for their own matches would be a natural next step.
- **Real-time updates** — currently the UI re-fetches on user action. WebSocket
  or SSE push is left for later.
- **Match attribution** — the backend accepts `updated_by_player_id` on score
  submissions but does not yet persist it. Add an `updated_by_player_id` column
  on `matches` and an audit log of score edits.
- **Reset-match endpoint** for knockout: the API currently rejects edits that
  would invalidate a completed downstream match; an admin "reset" is the
  natural counterpart.
- **Production hardening** — rate limits, structured logging, audit log,
  observability. The current stack is local-dev-only.

## Layout

```
backend/        Go service
  cmd/server/   main + embedded migration runner
  internal/
    api/        HTTP handlers + auth middleware
    config/     env config
    knockout/   pure bracket builder (unit-tested)
    league/     pure scheduler + standings (unit-tested)
    store/      pgx-based data access
db/
  migrations/   goose SQL migrations (0001..0009)
  seed/         legacy team catalog seed (kept for compatibility)
frontend/       Vite + React + TS SPA
  public/logos/ scraped team crests (PNG)
  src/
    components/ shell, ui primitives, StyledSelect, TeamCrest
    pages/      TournamentList, TournamentNew, TournamentDetail, Players
docs/
  architecture.md         domain model, lifecycles, state machines
  api.md                  endpoint reference
  data-model.md           SQL schema + ER diagram
  local-verification.md   curl + Chrome transcripts
  plan.md, plans/         historical planning artifacts
scripts/
  golden-path.sh           league smoke test
  golden-path-knockout.sh  knockout smoke test
  scrape_logos.py          one-off crest scraper (football-logos.cc)
```

## Make targets

| Target             | What it does                                                       |
|--------------------|--------------------------------------------------------------------|
| `make up`          | build + start db + backend + frontend (detached)                   |
| `make down`        | stop containers (volumes preserved)                                |
| `make clean`       | stop + drop volumes (wipes data)                                   |
| `make logs`        | tail container logs                                                |
| `make seed`        | load `db/seed/teams.sql` into the running DB (legacy)               |
| `make migrate`     | run `goose up` inside the backend container                        |
| `make test`        | backend unit tests (`go test ./...`)                                |
| `make backend-build` | build the Go binary to `backend/bin/server`                       |

## Development

### Pre-commit hooks

Linting and basic checks run via [pre-commit](https://pre-commit.com). The same
hooks run in CI, so green locally means green in CI.

```bash
pip install pre-commit
pre-commit install              # hooks now run on every `git commit`
pre-commit run --all-files      # run the full suite on demand
```

What runs:

- General: trailing whitespace, EOF newlines, YAML validity, merge-conflict markers, large-file guard.
- Backend (`backend/`): `gofmt -l` (formatting) and `go vet ./...`.
- Frontend (`frontend/`): ESLint (`src/**/*.{ts,tsx}`) and `tsc --noEmit`.

Prettier is configured but **not** wired as a pre-commit hook in this
iteration — the existing codebase predates Prettier and applying it would
touch most files. Run it on demand:

```bash
cd frontend
npm run format          # write
npm run format:check    # CI-style check
```

### CI

GitHub Actions runs three jobs on every push and PR (`.github/workflows/ci.yml`):

1. `pre-commit` — runs all hooks via `pre-commit run --all-files`.
2. `backend` — `go build ./...` + `go test ./...`.
3. `frontend` — `npm run lint` + `npm run typecheck`.

## Logos / attribution

Team crests under `frontend/public/logos/` are scraped from
[football-logos.cc](https://football-logos.cc/) (project by Leo4815162342)
via `scripts/scrape_logos.py`. The site advertises free downloads but has
no explicit license; the underlying marks remain the property of the
respective clubs and federations. This catalog is intended for personal /
internal tournament use only — do not redistribute beyond that scope
without verifying the licensing terms.
