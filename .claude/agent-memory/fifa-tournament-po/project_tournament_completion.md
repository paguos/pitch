---
name: tournament-completion
description: How tournaments transition to COMPLETED — knockout auto-completes on the final, league requires manual "end tournament" button
metadata:
  type: project
---

Tournament completion is format-aware:

- **Knockout**: auto-completes when the final match (the one with `next_match_id IS NULL`) is scored. Handled inside `SubmitScoreKnockout` in the same transaction that records the final. Also stamps `completed_at`.
- **League**: there is no natural "last fixture" trigger because a league can be ended even with unplayed matches (forfeits, walkovers, organiser calls it). So league tournaments need a manual **End tournament** button — there is no auto-completion path.

**Endpoint**: `POST /tournaments/:id/end`
- Idempotent: calling on an already-COMPLETED tournament returns 200 with the current row unchanged (does NOT re-stamp `completed_at` or bump version).
- 409 if status is DRAFT (`ErrTournamentNotStarted`).
- Works for both formats — it's a safety valve for knockout too if a final somehow can't be scored.
- No optimistic-lock check: ACTIVE→COMPLETED is a one-way transition.

**UI rules (TournamentDetail)**:
- Button only shown while `status === 'ACTIVE'`.
- Hint text below the "tournament locked" line: shows `complete NN more matches or end anyway` (coral) when unscored matches exist, or `all matches scored · ready to end` (pitch) when ready.
- "Scored" = match status in {`REPORTED`, `COMPLETED`} (covers both formats).
- If all scored: button is primary (pitch); click ends immediately, no modal.
- If any unscored: button is ghost (border-only); click opens the `AlertDialog` ([[no-browser-dialogs]]) with destructive confirm styling. Modal copy explains that current standings will be final.
- On COMPLETED: button is hidden; for league a `LeagueWinnerBanner` is shown above the actions strip with the top standings row (Pts → GD → GF → Name, sort done backend-side). For knockout, the existing champion banner inside the bracket tab is kept (no change).

**Schema**: migration `0006_tournament_completed_at.sql` added `tournaments.completed_at timestamptz NULL`.
