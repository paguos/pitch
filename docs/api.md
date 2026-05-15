# API Reference

The backend exposes a small, unauthenticated JSON API on port `8080`.
All routes are wired in `backend/internal/api/api.go`.

Base URL in local dev: `http://localhost:8080`.

## Conventions

- Bodies are JSON. `Content-Type: application/json` is enforced on writes.
- Resource IDs are UUIDs (string in JSON, `uuid` in Postgres).
- Errors are returned as `{"error": "<message>"}` with an appropriate
  HTTP status. The full error envelope set:

| Status | Meaning                                                                 |
|--------|-------------------------------------------------------------------------|
| 400    | malformed input (invalid JSON, missing required field, bad UUID)        |
| 404    | resource not found                                                      |
| 409    | conflict — version mismatch, already-started tournament, FK in use, etc. |
| 422    | semantically invalid for the format (e.g. draw submitted in knockout)   |
| 500    | unexpected server error                                                 |

CORS is restricted to the value of `FRONTEND_ORIGIN` (default
`http://localhost:5173`).

---

## Health

### `GET /healthz`

Returns `200 OK` with body `ok`. Used by Docker healthchecks.

---

## Teams

### `GET /teams[?league=<name>]`

Returns the catalog. Optional `league` query string filters by league
name (e.g. `Premier League`, `Bundesliga`, `UEFA`, `CONMEBOL`, ...).

**200 response** — array of:
```json
{
  "id": "uuid",
  "name": "Real Madrid",
  "league": "La Liga",
  "country": "Spain",
  "kind": "club",
  "logo_url": "/logos/spain--real-madrid.png"
}
```

`kind ∈ {club, neutral, national}`. `logo_url` may be `null` for teams
without a mapped crest.

---

## Players

### `GET /players`

**200** — array of `{id, display_name, email, created_at}`. `email` may
be `null`.

### `POST /players`

Body: `{"display_name": "Alice", "email": "alice@example.com"}`. `email`
is optional and lowercased + trimmed before storage. **201** with the
created row. **400** if `display_name` is empty.

### `GET /players/{id}`

**200** with the row, **404** if not found.

### `PATCH /players/{id}`

Body (all fields optional):
```json
{ "display_name": "New name", "email": "new@example.com" }
```
- Passing `"email": ""` (or whitespace only) clears the field.
- Passing `display_name` as empty/whitespace is rejected with **400**.

**200** with the updated row, **404** if not found.

### `DELETE /players/{id}`

**204** on success. **404** if not found. **409** with
`{"error":"cannot delete: player is referenced by one or more
tournaments"}` if the player has any participant row (current or
historical). No cascading delete — tournament history is preserved.

---

## Tournaments

### `GET /tournaments`

**200** — array of tournament rows, newest first.

### `POST /tournaments`

Body: `{"name": "Friday Night", "format": "league"}` — `format ∈
{league, knockout}`. **201** with the created row in `DRAFT` status.

**400** if `name` is empty or `format` is invalid.

### `GET /tournaments/{id}`

**200** — composite payload:
```json
{
  "tournament":   { ... },
  "participants": [ ... ],
  "matches":      [ ... ],
  "standings":    [ ... ]
}
```
- `standings` is populated only for `format=league` once the tournament
  is past `DRAFT`. Recomputed on every read.
- Participant rows include `player_name`, `team_name`, and
  `team_logo_url` joined in for UI convenience.

### `POST /tournaments/{id}/participants` (join)

Body: `{"player_id": "<uuid>", "team_id": "<uuid>"}`. **201** with the
created participant row.

- **404** — tournament or player not found
- **409** — tournament not in `DRAFT`, duplicate join (same player or
  same team already in this tournament)

### `PATCH /tournaments/{id}/participants/{playerID}` (change team)

Body: `{"team_id": "<uuid>"}`. **200** on success, **404** if the player
isn't a participant of this tournament, **409** if the tournament has
already started.

### `DELETE /tournaments/{id}/participants/{playerID}` (leave)

**200 `{"ok": true}`** on success. **409** if the tournament has already
started; **404** if not a participant.

### `POST /tournaments/{id}/start`

Transitions `DRAFT → ACTIVE` and inserts all fixtures (league) or
bracket matches (knockout) in a single transaction.

- **400** — fewer than 2 participants
- **409** — already started

**200 `{"ok": true}`** on success.

### `POST /tournaments/{id}/end`

Manually transitions `ACTIVE → COMPLETED` and stamps `completed_at`.
Idempotent — calling on an already-`COMPLETED` tournament returns `200`
with the current row.

- **404** — not found
- **409** — tournament has not started (still in `DRAFT`)

### `POST /tournaments/{id}/copy`

Creates a new `DRAFT` tournament with the same `format` and all participants
(player + team pairings) copied from the source. Matches are **not** copied —
the draw is generated fresh when the copy is started.

Body: `{"name": "New tournament name"}`

**201** — the new tournament row (same shape as `POST /tournaments`).

- **400** — name empty
- **404** — source tournament not found
- **409** — a tournament with that name already exists

---

## Matches

### `PUT /matches/{id}/score`

Body:
```json
{ "home_goals": 2, "away_goals": 1, "version": 1 }
```

Optimistic locking: the update only fires if the stored
`matches.version` equals the submitted `version`. On success, the
returned row carries the incremented version.

**League rules**: any non-negative `(home, away)` is accepted. The
match transitions `SCHEDULED → REPORTED`.

**Knockout rules**: draws are rejected. The match transitions
`PLAYABLE → COMPLETED`, the winner is propagated into the parent match
`HOME` or `AWAY` slot, and the parent may flip to `PLAYABLE` if both
slots are now filled. If this is the final, the tournament transitions
to `COMPLETED`.

Errors:

| Status | Cause                                                                     |
|--------|---------------------------------------------------------------------------|
| 400    | bad UUID, invalid JSON, negative goals                                    |
| 404    | match not found                                                           |
| 409    | `version conflict` (stale version)                                        |
| 409    | `downstream match already completed; reset it first` (knockout only)      |
| 409    | `match is not yet playable (waiting on feeder match)` (knockout only)     |
| 422    | `draws are not allowed in a knockout match`                               |

---

## What's intentionally absent

- No authentication / no session cookie.
- No `created_by` / `updated_by_player_id` attribution on writes
  (`updated_by_player_id` was accepted by an earlier iteration; it is
  no longer parsed nor stored).
- No knockout "reset" endpoint — see future work in the root `README.md`.
- No real-time push (WS/SSE). The UI refetches on user action.
