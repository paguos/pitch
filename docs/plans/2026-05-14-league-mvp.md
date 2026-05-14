# FIFA Tournament MVP — League Vertical Slice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship an end-to-end league tournament: users register via magic link, create a league, join with a team, start it (round-robin schedule via circle method), record scores, see live standings.

**Architecture:** Go monolith (chi router + sqlc + pgx) talking to Postgres 16, React/Vite/TS/Tailwind SPA frontend. Stateless backend, cookie session, optimistic locking on Match. docker-compose for local dev. Knockout format is data-model-friendly but not implemented.

**Tech Stack:** Go 1.22, chi, pgx, sqlc, goose (migrations), Postgres 16, React 18, Vite 5, TypeScript, TailwindCSS, shadcn primitives (hand-rolled minimal subset to avoid heavy generator).

---

## Task 1: Repo skeleton + docker-compose
- Create `backend/`, `frontend/`, `db/migrations/`, `db/seed/`, `docs/`.
- Root `Makefile` with `up`, `down`, `seed`, `test`, `logs`.
- `docker-compose.yml` with three services: `db` (postgres:16), `backend`, `frontend`.

## Task 2: DB schema + migrations (goose)
Tables:
- `users(id uuid pk, email citext unique, created_at)`
- `sessions(token text pk, user_id, expires_at)`
- `magic_links(token text pk, email, expires_at, consumed_at)`
- `teams(id uuid pk, name text, league text, country text, kind text)` — kind in (`club`, `neutral`)
- `tournaments(id uuid pk, name text, format text, status text, created_by, created_at, started_at, version int)` — format in (`league`, `knockout`); status in (`DRAFT`,`ACTIVE`,`COMPLETED`)
- `participants(id uuid pk, tournament_id, user_id, team_id, seed int, unique(tournament_id, user_id), unique(tournament_id, team_id))`
- `matches(id uuid pk, tournament_id, round int, home_participant_id, away_participant_id, home_goals int null, away_goals int null, status text, version int, played_at timestamptz null)` — status in (`SCHEDULED`,`REPORTED`)

Indexes on FKs and `(tournament_id, round)`.

## Task 3: sqlc setup
- `sqlc.yaml` with pgx/v5 driver, queries in `backend/internal/db/queries/`.
- Initial queries: user CRUD, magic link create/consume, session create/lookup, tournament CRUD, participant join/leave, match insert batch, match update with version check, standings aggregate.

## Task 4: League scheduler (pure function, unit tested)
- `backend/internal/league/schedule.go`: circle-method round-robin. Input: ordered participant IDs. Output: `[][]Pairing` (rounds → matches). If odd N, add a BYE sentinel and skip those pairings.
- Test: N=2,3,4,5,6 — verify (a) every pair plays once, (b) round count is N-1 (even) or N (odd, with byes), (c) deterministic order.

## Task 5: Standings computation (pure, unit tested)
- `backend/internal/league/standings.go`: takes participants + reported matches → sorted standings.
- Sort key: points desc → GD desc → GF desc → name asc.
- Win=3, Draw=1, Loss=0. Unreported matches ignored.
- Test: hand-crafted fixture sets, including ties broken by GD/GF/name.

## Task 6: HTTP server skeleton
- `backend/cmd/server/main.go`: chi router, pgx pool, env config (`APP_ENV`, `DATABASE_URL`, `PORT`, `COOKIE_SECRET`).
- Middleware: request ID, recoverer, JSON content-type, CORS for the frontend origin.
- `/healthz` returns 200.

## Task 7: Auth (magic link)
- `POST /auth/request` body `{email}` → mint token, store row, print `http://localhost:5173/auth/callback?token=...` to stdout. If `APP_ENV=dev`, also return `{magic_link}` in JSON.
- `POST /auth/consume` body `{token}` → consume link, create session, set httponly cookie `sid`, return `{user}`.
- `POST /auth/logout` → delete session, clear cookie.
- `GET /me` → current user from session.
- Middleware `requireUser` for protected routes.

## Task 8: Tournament endpoints
- `POST /tournaments` (auth) `{name, format}` — only `league` supported; `knockout` returns 501.
- `GET /tournaments` — list all.
- `GET /tournaments/:id` — detail (tournament + participants + matches + standings if started).
- `POST /tournaments/:id/join` `{team_id}` — DRAFT only, team not taken, user not already in.
- `POST /tournaments/:id/leave` — DRAFT only.
- `PATCH /tournaments/:id/participants/me` `{team_id}` — change team while DRAFT.
- `POST /tournaments/:id/start` — DRAFT→ACTIVE, generate league fixtures.
- `PUT /matches/:id/score` `{home_goals, away_goals, version}` — optimistic lock; 409 on mismatch.
- `GET /teams` — list catalog with optional `league` filter.

## Task 9: Team catalog seed
- `db/seed/teams.sql`: ~10 clubs each from Premier League, La Liga, Bundesliga, Serie A, Ligue 1 + 5 neutral fictional teams. UUIDs are deterministic via `gen_random_uuid()` is fine — we just need names.
- `make seed` runs the SQL.

## Task 10: Frontend bootstrap
- Vite + React + TS template; install Tailwind, configure.
- Tailwind theme: distinctive (use brand-y greens/blacks reminiscent of pitch, not generic shadcn slate).
- Minimal UI primitives in `src/components/ui/` (Button, Input, Card, Badge, Table) — small hand-rolled, not the shadcn CLI generator.
- API client `src/lib/api.ts` with credentials: include.
- Routing: react-router-dom.

## Task 11: Frontend pages
- `/login` — email input, submit → POST /auth/request → show clickable magic link returned by dev mode.
- `/auth/callback` — consumes `?token=`, redirects to /.
- `/` — tournaments list + "Create" button.
- `/tournaments/new` — name + format (league only enabled).
- `/tournaments/:id` — tabs: Participants / Fixtures / Standings; join/change-team picker; score entry inline for own matches (admin can edit any).

## Task 12: docker-compose wiring
- `backend` Dockerfile (multi-stage), runs migrations on start.
- `frontend` Dockerfile (Vite dev server, or build+nginx for prod-ish). For MVP use Vite dev server with HMR.
- `db` with named volume.
- `make up` → `docker compose up -d --build`.

## Task 13: Golden-path verification
- Boot stack, two users register (Alice + Bob), each picks a team, create league, both join, start, record one score, fetch standings.
- Capture curl request/response in `docs/local-verification.md`.

## Task 14: README
- Quickstart, magic-link dev flow, architecture sketch, what is verified, what is deferred.
