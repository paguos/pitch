# CLAUDE.md — FIFA Tournament

Repo-scoped instructions for Claude Code sessions working in this directory.

## About this project

Local-only FIFA tournament organizer. Supports **league** (round-robin) and
**knockout** (single-elimination) formats, players CRUD, and a 2025/26 season
club + national team catalog with logos. **No authentication** — this is
intentional for the current iteration; participants are passed explicitly in
request bodies. Runs entirely on a developer machine via Docker Compose.

## How to run

```bash
make up      # frontend :5173, backend :8080, postgres :5433
make down    # stop containers
make clean   # stop + remove volumes (wipes DB)
```

- `make seed` exists but is **legacy** — the team catalog is loaded by
  migrations (`db/migrations/0007_*`, `0008_*`, `0009_*`), so a fresh `make up`
  already has the catalog.
- **No pre-seeded players.** Create them in the UI or via `POST /players`.

## Tech stack

- **Backend**: Go, [chi](https://github.com/go-chi/chi) router, [pgx](https://github.com/jackc/pgx)
  pool, [goose](https://github.com/pressly/goose) migrations, Postgres 16.
- **Frontend**: React + Vite + TypeScript + Tailwind. Components are
  hand-rolled (shadcn-inspired but not shadcn) — see
  `frontend/src/components/`:
  - `ui.tsx` — `Button`, `AlertDialog`, primitives
  - `StyledSelect.tsx` — replaces native `<select>` everywhere
  - `TeamCrest.tsx` — club/national crest renderer
  - `Shell.tsx` — app layout shell

## Project layout

```
backend/          Go service (cmd/, internal/store, internal/http, ...)
frontend/         Vite + React + TS app
db/migrations/    goose SQL migrations (append-only)
scripts/          One-off scripts (logo scraper, etc.)
docs/             Architecture, API, data model, iteration plans
```

## Where to look first

- `docs/architecture.md` — domain model, match/tournament state machines.
- `docs/api.md` — endpoint reference (request/response shapes).
- `docs/data-model.md` — table schema and relationships.
- `docs/plans/` — historical iteration plans; useful context for why things
  ended up the way they did.

## Conventions

- **No git commits without explicit user approval.** Restating per-repo
  because it's important.
- **Never use browser-native `confirm` / `alert` / `prompt`.** Use the in-app
  `AlertDialog` from `frontend/src/components/ui.tsx`. Reason: Chrome MCP
  verification freezes on browser dialogs, and the in-app modal is the
  established UX pattern.
- **No auth in this iteration.** When a feature needs "who did this?", use
  the participant-passed pattern (`player_id` in the request body), not a
  global actor / session.
- **Migrations are append-only.** Add `0010_<name>.sql` rather than editing
  existing ones. Catalog migrations (`0007`/`0008`/`0009`) replace data with
  truncate-and-reseed; new catalog-mutating migrations should follow the same
  idempotent pattern.
- **Frontend volume mount caveat.** `frontend/src` is NOT volume-mounted in
  `docker-compose.yml`, so every frontend change needs
  `docker compose up -d --build frontend`. Known nit; flagged, not fixed.
- **Optimistic locking on score edits.** Any new score-mutating endpoint must
  accept a `version` field and bump it on write. See `internal/store/store.go`
  for the existing pattern.
- **Knockout bracket invariants.** Byes are NOT materialized as matches —
  top seeds are pre-placed into round 2. Editing a knockout result whose
  downstream match is `COMPLETED` is hard-rejected with `409`. Don't relax
  this without a product call.
- **Logo licensing.** Crests in `frontend/public/logos/` come from
  football-logos.cc with no explicit license — treat as personal/internal
  use only. If this project is ever made public, replace them.

## Common pitfalls — if you change X, also change Y

- **New endpoint?** Update `docs/api.md`.
- **New table or column?** Update `docs/data-model.md`.
- **New visual component?** Match the existing aesthetic: dark pitch
  background, mono type, coral + green accents, thin hairline borders,
  uppercase eyebrow labels with small-caps tracking. Run the
  `frontend-design:frontend-design` skill before building, not after.
- **Touching the `teams` catalog?** Regenerate logos if the team list
  changes — script at `scripts/scrape_logos.py`. Mind the licensing caveat
  above.

## What NOT to do

- **Don't re-introduce auth** without asking. It was intentionally removed.
- **Don't add external company / employer references** in code or docs.
  This is a personal project.
- **Don't ship `console.log` debug prints** in production builds.
- **Don't reformat unrelated files** in PRs — keep diffs scoped.
