#!/usr/bin/env bash
# End-to-end golden path (auth-less): create two players, draft a league,
# add both players (with teams) as participants, start, record a score,
# fetch standings. Output is shown as request/response.
set -euo pipefail

BASE="${BASE:-http://localhost:8080}"

show() { printf "\n\033[1;32m▸ %s\033[0m\n" "$*"; }

new_player() {
  local display="$1" email="$2"
  curl -sS -H 'Content-Type: application/json' \
    -d "{\"display_name\":\"$display\",\"email\":\"$email\"}" \
    "$BASE/players" | jq -r .id
}

show "1. Create Alice and Bob"
ALICE_ID=$(new_player "GP-Alice-$RANDOM" "gp-alice-$RANDOM@example.com")
BOB_ID=$(new_player "GP-Bob-$RANDOM"   "gp-bob-$RANDOM@example.com")
echo "alice_id=$ALICE_ID  bob_id=$BOB_ID"

show "2. List teams (first 3 from La Liga)"
curl -sS "$BASE/teams?league=La%20Liga" | jq '.[0:3]'
TEAM_A=$(curl -sS "$BASE/teams?league=La%20Liga"       | jq -r '.[0].id')
TEAM_B=$(curl -sS "$BASE/teams?league=Premier%20League"| jq -r '.[0].id')

show "3. Create a league tournament (no actor — anyone can create)"
TID=$(curl -sS -H 'Content-Type: application/json' \
  -d "{\"name\":\"Friday Night Cup $RANDOM\",\"format\":\"league\"}" \
  "$BASE/tournaments" | tee /dev/stderr | jq -r .id)
echo "tournament_id=$TID"

show "4. Add Alice (with Team A) to the tournament"
curl -sS -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$ALICE_ID\",\"team_id\":\"$TEAM_A\"}" \
  "$BASE/tournaments/$TID/participants" | jq .

show "5. Add Bob (with Team B) to the tournament"
curl -sS -H 'Content-Type: application/json' \
  -d "{\"player_id\":\"$BOB_ID\",\"team_id\":\"$TEAM_B\"}" \
  "$BASE/tournaments/$TID/participants" | jq .

show "6. Start the tournament (generates round-robin)"
curl -sS -X POST "$BASE/tournaments/$TID/start" | jq .

show "7. Fetch detail — should now have a fixture and ACTIVE status"
DETAIL=$(curl -sS "$BASE/tournaments/$TID")
echo "$DETAIL" | jq '{status:.tournament.status, participants:[.participants[].team_name], matches:(.matches | length)}'

MATCH_ID=$(echo "$DETAIL" | jq -r '.matches[0].id')
MATCH_VER=$(echo "$DETAIL" | jq -r '.matches[0].version')

show "8. Report score 3-1 on the first match (optimistic version check)"
curl -sS -X PUT -H 'Content-Type: application/json' \
  -d "{\"home_goals\":3,\"away_goals\":1,\"version\":$MATCH_VER}" \
  "$BASE/matches/$MATCH_ID/score" | jq .

show "9. Stale-version re-submit must 409"
curl -sS -o /tmp/out -w "HTTP %{http_code}\n" \
  -X PUT -H 'Content-Type: application/json' \
  -d "{\"home_goals\":9,\"away_goals\":9,\"version\":$MATCH_VER}" \
  "$BASE/matches/$MATCH_ID/score"
cat /tmp/out; echo

show "10. Final standings"
curl -sS "$BASE/tournaments/$TID" \
  | jq '.standings | map({pos: .Name, P: .Played, W: .Won, D: .Drawn, L: .Lost, GF: .GoalsFor, GA: .GoalsAgainst, GD: .GoalDiff, Pts: .Points})'

show "11. End the league (manual completion — league formats don't auto-finish)"
curl -sS -X POST "$BASE/tournaments/$TID/end" | jq '{id, status, completed_at, version}'

show "12. Calling end again is idempotent (still 200, status COMPLETED)"
curl -sS -o /tmp/out -w "HTTP %{http_code}\n" -X POST "$BASE/tournaments/$TID/end"
cat /tmp/out | jq '{status, completed_at}'; echo

show "DONE — golden path verified"
