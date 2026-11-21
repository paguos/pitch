# API Reference

The backend exposes a small JSON API on port `8080`. Every route except
`/healthz` and `/auth/*` needs a signed-in session, and every write needs the
`admin` role (see [Authentication](#authentication)). All routes are wired in
`backend/internal/api/api.go`.

The browser always reaches the API under `/api` on the app's own origin
(nginx in production, the Vite proxy in dev), which strips the prefix before
the request reaches the backend. The paths below are the backend's paths.
Direct access, e.g. from the scripts in `scripts/`, uses
`http://localhost:8080` and a cookie jar.

## Conventions

- Bodies are JSON. `Content-Type: application/json` is enforced on writes.
- Resource IDs are UUIDs (string in JSON, `uuid` in Postgres).
- Errors are returned as `{"error": "<message>"}` with an appropriate
  HTTP status. The full error envelope set:

| Status | Meaning                                                                 |
|--------|-------------------------------------------------------------------------|
| 400    | malformed input (invalid JSON, missing required field, bad UUID)        |
| 401    | not signed in (or the session expired)                                  |
| 403    | signed in but not allowed: viewers get this on every write              |
| 404    | resource not found                                                      |
| 409    | conflict — version mismatch, already-started tournament, FK in use, etc. |
| 422    | semantically invalid for the format (e.g. draw submitted in knockout)   |
| 500    | unexpected server error                                                 |

CORS is restricted to the value of `FRONTEND_ORIGIN` (default
`http://localhost:5173`), with credentials allowed. State-changing requests
that carry an `Origin` header must match `PUBLIC_BASE_URL` or
`FRONTEND_ORIGIN`, otherwise they get **403** (CSRF guard).

---

## Authentication

Two kinds of account, both using the same HttpOnly session cookie
(`pitch_session`, `SameSite=Lax`, 30 days, stored hashed in Postgres):

- **`admin`** — the default account, created on first run with a password. It
  is not a player.
- **Players** — sign in with Google. A Google email is accepted only if an
  admin has put it on a player (`players.email`, matched case-insensitively).
  The player is a **viewer** (read-only) unless an admin grants `admin`, which
  can be done before their first sign-in.

Roles: `admin` can do everything; `viewer` can call every `GET` except that
account details (`email`, `role`, `signed_in`) of other players are hidden.
Roles are read from the database on every request, so changes apply at once.

### `GET /auth/status` (public)

**200** `{"setup_required": bool, "google_enabled": bool, "user": null | {id, username, role, player_id, player_name}}`.
The SPA calls this first to decide between the setup screen, the sign-in
screen and the app. `setup_required` is true while no admin exists.

### `POST /auth/setup` (public, once)

Body `{"password": "..."}` (at least 12 characters). Creates the `admin`
account and signs it in: **201** with the user. **409** once an admin exists.
There is no setup token: on a fresh install the first request wins.

### `POST /auth/login` (public)

Body `{"username": "admin", "password": "..."}`. **200** with the user and a
session cookie, **401** `invalid credentials` (never says which part was
wrong), **429** after 10 failures per client IP or per username in 15 minutes.

### `POST /auth/logout` (public)

**204**. Ends the session and clears the cookie.

### `GET /auth/google/start`, `GET /auth/google/callback` (public)

Browser redirects, not JSON. `start` sets a short-lived cookie (state, nonce,
PKCE verifier) and redirects to Google; `callback` verifies state and the ID
token (`email_verified`, nonce, audience), matches the email to a player,
starts a session and redirects to `/`. Failures redirect to
`/login?error=<code>` with `not_invited` (email not on a player, or the Google
account differs from the one linked to that player), `failed`, or
`google_unavailable`.

The first sign-in links the Google account (`sub`) to the player. Changing or
clearing the player's email unlinks it and ends their sessions.

With `GOOGLE_PROVIDER=fake` (dev only, refused when `APP_ENV` is not `dev`)
`start` goes to `GET /auth/google/fake`, a page where you type the email to
sign in as.

### `GET /me/results`

Signed-in users. **200** array, one entry per tournament the signed-in
player takes part in (newest first): `{tournament, participant, standing,
position, matches}`. `standing` and `position` are `null` for knockouts and
drafts. Each match carries `home_name`/`away_name` (teams) and
`home_player`/`away_player` (the players behind them). The default admin is not
a player and gets `[]`.

### `GET /players/{id}/results`

Signed-in users, read-only. Same shape as `GET /me/results`, for any player, so
everyone can look at anyone's profile. An unknown player is **404**, a bad id
**400**. Account details (email, role) still come from `GET /players/{id}`,
which hides them from viewers except on their own player.

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

**200** — array of `{id, display_name, email, created_at, role, signed_in}`.
`email` may be `null`. `role` is `"admin"`, `"viewer"` or `null` (no account
yet) and `signed_in` is true once they have signed in with Google. Viewers
only see `email`, `role` and `signed_in` on their own player; for everyone
else those come back as `null` / `null` / `false`.

### `POST /players`

Admin only. Body: `{"display_name": "Alice", "email": "alice@example.com"}`.
`email` is optional, lowercased + trimmed before storage, and is what lets
the person sign in with Google. **201** with the created row. **400** if
`display_name` is empty. **409** if another player already has that email.

### `GET /players/{id}`

**200** with the row, **404** if not found.

### `PATCH /players/{id}`

Body (all fields optional):
```json
{ "display_name": "New name", "email": "new@example.com" }
```
- Passing `"email": ""` (or whitespace only) clears the field.
- Passing `display_name` as empty/whitespace is rejected with **400**.
- Changing or clearing the email unlinks the player's Google account and ends
  their sessions (their role is kept).

Admin only. **200** with the updated row, **404** if not found, **409** if
the email belongs to another player, or if you clear the email of a player
who is an admin (remove admin rights first).

### `PUT /players/{id}/role`

Admin only. Body `{"role": "admin" | "viewer"}`. Grants or removes admin
rights; the player's account is created if they have not signed in yet, so
the role is waiting for them on first sign-in. **200** with the player.
**400** for an unknown role, **404** if not found, **409** if the player has
no email, if you try to remove your own admin rights, or if it would remove
the last admin.

### `DELETE /players/{id}`

Admin only. **204** on success. **404** if not found. **409** with
`{"error":"cannot delete: player is referenced by one or more
tournaments"}` if the player has any participant row (current or
historical). No cascading delete — tournament history is preserved. Also
**409** if the player is the last admin.

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

Access: an admin, or a signed-in player who is entered in the match's
tournament while that tournament is `ACTIVE`. Players can report a result and
correct it any number of times until the tournament ends; after that only an
admin can change it.

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
| 403    | not an admin and not a player in this tournament, or the tournament is not `ACTIVE` |
| 404    | match not found (admins; everyone else gets 403)                          |
| 409    | `version conflict` (stale version)                                        |
| 409    | `downstream match already completed; reset it first` (knockout only)      |
| 409    | `match is not yet playable (waiting on feeder match)` (knockout only)     |
| 422    | `draws are not allowed in a knockout match`                               |

---

## What's intentionally absent

- No self-service sign-up and no invite emails: an admin adds the email to a
  player, then tells the person.
- No password for players: they only sign in with Google.
- No `created_by` / `updated_by_player_id` attribution on writes
  (`updated_by_player_id` was accepted by an earlier iteration; it is
  no longer parsed nor stored).
- No knockout "reset" endpoint — see future work in the root `README.md`.
- No real-time push (WS/SSE). The UI refetches on user action.
