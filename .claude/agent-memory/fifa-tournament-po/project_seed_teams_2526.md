---
name: seed-teams-2526
description: Team catalog is 25/26 season top 5 leagues (96 clubs); migration 0007 truncates and reseeds
metadata:
  type: project
---

Migration `db/migrations/0007_teams_2526.sql` is the source of truth for the
team catalog: Premier League 20, La Liga 20, Serie A 20, Bundesliga 18,
Ligue 1 18 = 96 clubs (2025/26 season). It `DELETE FROM participants` then
`DELETE FROM teams` before reinserting — destructive on purpose. The
earlier `db/seed/teams.sql` is no longer authoritative (kept for `make seed`
on a wiped DB, but the migration wins on every backend boot).

**Why:** Pablo wanted full 25/26 squads (not the ~10/league sample) and no
fictional teams. The country picker depends on `teams.country` being
populated and accurate, which this migration enforces.

**How to apply:** When the league composition changes (promotion/relegation
between seasons), add a new migration that truncates and reseeds — don't
patch 0007 in place. The country dropdown sorts by team-count desc, so a
league with fewer teams will appear lower.

Related: [[styled-select-component]]
