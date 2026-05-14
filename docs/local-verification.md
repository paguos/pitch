# Local Verification — auth-less iteration

Captured 2026-05-14. Reproduce with:

```bash
make up
make seed
./scripts/golden-path.sh           # league
./scripts/golden-path-knockout.sh  # knockout
```

There is no auth in this iteration and there is **no global "acting" player**.
Every endpoint that involves a participant takes the `player_id` explicitly
in the request body (or path). Tournament creation and score submission take
no actor at all.

## Unit tests

```
$ cd backend && go test ./...
ok   github.com/fifa-tournament/backend/internal/knockout
ok   github.com/fifa-tournament/backend/internal/league
?    cmd/server, internal/api, internal/config, internal/store   [no test files]
```

## League golden path — highlights

```
▸ 3. Create a league tournament (no actor — anyone can create)
{"id":"…","status":"DRAFT","format":"league","created_by":null,...}

▸ 4. Add Alice (with Team A) to the tournament
{"player_id":"…","team_id":"…","seed":1,...}

▸ 5. Add Bob (with Team B) to the tournament
{"player_id":"…","team_id":"…","seed":2,...}

▸ 6. Start the tournament (generates round-robin)
{ "ok": true }

▸ 8. Report score 3-1 on the first match
{ "status": "REPORTED", "home_goals": 3, "away_goals": 1, "version": 2, ... }

▸ 9. Stale-version re-submit must 409
HTTP 409  {"error":"version conflict"}
```

## Knockout golden path — highlights

```
▸ 3. Create a KO tournament (no actor needed)
▸ 4. Add all 5 players (each with their team) as participants
▸ 6. Fetch detail — verify bracket shape
status=ACTIVE total=4 R1=1 R2=2 R3=1 R2-prefilled=3
  ✓ bracket shape correct: B=8, byes=3, total=4 (R1=1, R2=2, F=1)

▸ 7. Negative — submit a draw on R1 (must be rejected)
HTTP 422 — body: {"error":"draws are not allowed in a knockout match"}

▸ 11. Negative — re-score R1 after R2 child completed
HTTP 409 — body: {"error":"downstream match already completed; reset it first"}

▸ 13. Verify tournament COMPLETED + champion
  ✓ tournament COMPLETED; champion: <some team>
```

## Chrome MCP — add-participant flow + no header dropdown

Captured against the live frontend.

### 1. The "Acting as" dropdown is gone

The header now contains only the brand, nav (Tournaments · Players · New) and
a UTC clock. There is no select element for "acting as", and `localStorage`
does not contain `pitch.actor_player_id`.

### 2. Add 2+ players to a tournament via the new form

On a fresh DRAFT tournament detail page, the actions bar shows:

```
PLAYER  [— pick player —     v ]   TEAM  [— pick team —     v ]   [ add to tournament → ]
```

Pick player Alice + team Real Madrid → click `add to tournament →`. The
participants list updates with `01 · REAL MADRID · manager · Alice` and the
player dropdown no longer offers Alice. Repeat with Bob + Arsenal: row
`02 · ARSENAL · manager · Bob` is added. Multiple players can be added from
the same browser without any header switching.

### 3. Score submission has no actor field

After starting the tournament, click `report →` on a fixture, enter `3 : 1`,
click `save`. The PUT request body is `{home_goals, away_goals, version}` —
no `updated_by_player_id` field. The match flips to REPORTED.

### 4. Players CRUD still works

`/players` renders the existing list; `+ new player` opens the in-app
`AlertDialog`. No browser `confirm` is used anywhere.

## What is intentionally deferred

- Real auth — see README "Future work".
- Score-edit attribution (no `updated_by` column on matches).
- Reset-match admin endpoint for knockout.
- WebSocket / SSE push for live updates.
