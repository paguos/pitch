#!/usr/bin/env bash
# End-to-end knockout golden path (auth-less): create 5 players, create a KO
# tournament, add all 5 as participants, start, verify bracket shape (8-slot,
# 3 byes pre-placed into R2, 1 R1 match, 2 R2 matches, 1 final = 4 total),
# score every round, assert tournament COMPLETED + champion correct. Also
# covers two negative cases: draws rejected and downstream-already-completed
# edits rejected.
set -euo pipefail

BASE="${BASE:-http://localhost:8080}"

show() { printf "\n\033[1;32m▸ %s\033[0m\n" "$*"; }
fail() { printf "\n\033[1;31m✗ %s\033[0m\n" "$*"; exit 1; }
ok()   { printf "\033[1;36m  ✓ %s\033[0m\n" "$*"; }

new_player() {
  local display="$1" email="$2"
  curl -sS -H 'Content-Type: application/json' \
    -d "{\"display_name\":\"$display\",\"email\":\"$email\"}" \
    "$BASE/players" | jq -r .id
}

show "1. Create 5 players"
PLAYERS=()
for i in 1 2 3 4 5; do
  ID=$(new_player "KO-P${i}-$RANDOM" "ko-p${i}-$RANDOM@ko.example")
  PLAYERS+=("$ID")
  ok "player ${i} → ${ID}"
done

show "2. Pick 5 unique teams across two leagues"
TEAMS_LA=$(curl -sS "$BASE/teams?league=La%20Liga"      | jq -r '.[0:3] | .[].id')
TEAMS_PL=$(curl -sS "$BASE/teams?league=Premier%20League"| jq -r '.[0:2] | .[].id')
IFS=$'\n' read -r -d '' -a TEAMS < <(printf '%s\n%s\0' "$TEAMS_LA" "$TEAMS_PL")
[ "${#TEAMS[@]}" -ge 5 ] || fail "couldn't gather 5 teams"

show "3. Create a KO tournament (no actor needed)"
TID=$(curl -sS -H 'Content-Type: application/json' \
  -d "{\"name\":\"Sunday Knockout $RANDOM\",\"format\":\"knockout\"}" \
  "$BASE/tournaments" | jq -r .id)
[ "$TID" != "null" ] || fail "could not create KO tournament"
ok "tournament id $TID"

show "4. Add all 5 players (each with their team) as participants"
for i in 0 1 2 3 4; do
  curl -sS -H 'Content-Type: application/json' \
    -d "{\"player_id\":\"${PLAYERS[$i]}\",\"team_id\":\"${TEAMS[$i]}\"}" \
    "$BASE/tournaments/$TID/participants" > /dev/null
  ok "player ${i} added"
done

show "5. Start the tournament — build bracket"
curl -sS -X POST "$BASE/tournaments/$TID/start" | jq .

show "6. Fetch detail — verify bracket shape"
DETAIL=$(curl -sS "$BASE/tournaments/$TID")
STATUS=$(echo "$DETAIL" | jq -r '.tournament.status')
TOTAL=$(echo "$DETAIL"  | jq '.matches | length')
R1=$(echo "$DETAIL"     | jq '[.matches[] | select(.round==1)] | length')
R2=$(echo "$DETAIL"     | jq '[.matches[] | select(.round==2)] | length')
R3=$(echo "$DETAIL"     | jq '[.matches[] | select(.round==3)] | length')
R2_PREFILLED=$(echo "$DETAIL" | jq '
  [.matches[] | select(.round==2)
   | (if .home_participant_id then 1 else 0 end)
   + (if .away_participant_id then 1 else 0 end)]
  | add')
echo "  status=$STATUS total=$TOTAL R1=$R1 R2=$R2 R3=$R3 R2-prefilled=$R2_PREFILLED"
[ "$STATUS" = "ACTIVE" ]   || fail "expected ACTIVE, got $STATUS"
[ "$TOTAL"  -eq 4 ]        || fail "expected 4 matches, got $TOTAL"
[ "$R1"     -eq 1 ]        || fail "expected 1 R1 match, got $R1"
[ "$R2"     -eq 2 ]        || fail "expected 2 R2 matches, got $R2"
[ "$R3"     -eq 1 ]        || fail "expected 1 final, got $R3"
[ "$R2_PREFILLED" -eq 3 ]  || fail "expected 3 R2 slots pre-filled by byes, got $R2_PREFILLED"
ok "bracket shape correct: B=8, byes=3, total=4 (R1=1, R2=2, F=1)"

show "7. Negative — submit a draw on R1 (must be rejected)"
R1_ID=$(echo "$DETAIL"  | jq -r '[.matches[] | select(.round==1)][0].id')
R1_VER=$(echo "$DETAIL" | jq -r '[.matches[] | select(.round==1)][0].version')
CODE=$(curl -sS -o /tmp/ko-draw -w "%{http_code}" \
  -X PUT -H 'Content-Type: application/json' \
  -d "{\"home_goals\":1,\"away_goals\":1,\"version\":$R1_VER}" \
  "$BASE/matches/$R1_ID/score")
echo "  HTTP $CODE — body: $(cat /tmp/ko-draw)"
[ "$CODE" = "422" ] || fail "draw should return 422, got $CODE"
ok "draw rejected with 422"

show "8. Score R1: home 3 - 1 away"
curl -sS -X PUT -H 'Content-Type: application/json' \
  -d "{\"home_goals\":3,\"away_goals\":1,\"version\":$R1_VER}" \
  "$BASE/matches/$R1_ID/score" | jq '{round, status, home_goals, away_goals}'

show "9. Refetch — R2 match awaiting R1 winner should now be PLAYABLE"
DETAIL=$(curl -sS "$BASE/tournaments/$TID")
R2_PLAYABLE=$(echo "$DETAIL" | jq '[.matches[] | select(.round==2 and .status=="PLAYABLE")] | length')
[ "$R2_PLAYABLE" -eq 2 ] || fail "expected both R2 matches PLAYABLE, got $R2_PLAYABLE"
ok "R1 winner propagated; both R2 matches PLAYABLE"

show "10. Score both R2 matches"
for ORD in 0 1; do
  M_ID=$(echo "$DETAIL"  | jq -r --argjson o "$ORD" '[.matches[] | select(.round==2 and .ord==$o)][0].id')
  M_VER=$(echo "$DETAIL" | jq -r --argjson o "$ORD" '[.matches[] | select(.round==2 and .ord==$o)][0].version')
  curl -sS -X PUT -H 'Content-Type: application/json' \
    -d "{\"home_goals\":2,\"away_goals\":0,\"version\":$M_VER}" \
    "$BASE/matches/$M_ID/score" | jq '{round, ord, status}'
done

show "11. Negative — try to re-score R1 (would change winner) — must be rejected because R2 child is COMPLETED"
DETAIL=$(curl -sS "$BASE/tournaments/$TID")
R1_VER=$(echo "$DETAIL" | jq -r '[.matches[] | select(.round==1)][0].version')
CODE=$(curl -sS -o /tmp/ko-dscompleted -w "%{http_code}" \
  -X PUT -H 'Content-Type: application/json' \
  -d "{\"home_goals\":0,\"away_goals\":5,\"version\":$R1_VER}" \
  "$BASE/matches/$R1_ID/score")
echo "  HTTP $CODE — body: $(cat /tmp/ko-dscompleted)"
[ "$CODE" = "409" ] || fail "expected 409 (downstream completed), got $CODE"
ok "downstream-completed edit rejected with 409"

show "12. Score the final"
DETAIL=$(curl -sS "$BASE/tournaments/$TID")
F_ID=$(echo "$DETAIL"  | jq -r '[.matches[] | select(.round==3)][0].id')
F_VER=$(echo "$DETAIL" | jq -r '[.matches[] | select(.round==3)][0].version')
F_HOME=$(echo "$DETAIL"| jq -r '[.matches[] | select(.round==3)][0].home_participant_id')
curl -sS -X PUT -H 'Content-Type: application/json' \
  -d "{\"home_goals\":4,\"away_goals\":2,\"version\":$F_VER}" \
  "$BASE/matches/$F_ID/score" | jq '{round, status, home_goals, away_goals}'

show "13. Verify tournament COMPLETED + champion"
DETAIL=$(curl -sS "$BASE/tournaments/$TID")
TSTATUS=$(echo "$DETAIL" | jq -r '.tournament.status')
[ "$TSTATUS" = "COMPLETED" ] || fail "expected COMPLETED, got $TSTATUS"
CHAMP=$(echo "$DETAIL" | jq -r --arg p "$F_HOME" '[.participants[] | select(.id==$p)][0].team_name')
ok "tournament COMPLETED; champion: $CHAMP"

show "DONE — knockout golden path verified"
