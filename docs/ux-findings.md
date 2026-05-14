# UX findings — end-user walkthrough

Captured during a Chrome-driven end-to-end pass of the League and Knockout golden paths on 2026-05-14.
Two critical bugs were fixed in-flight (see "Fixed during run"); everything below is leftover for Pablo to triage.

## Fixed during run (critical, blocked the golden path)

| # | Where | Symptom | Fix applied |
| - | ----- | ------- | ----------- |
| C1 | `pages/AuthCallback.tsx` | After consuming a magic link, `nav('/')` did a client-side route change. The Shell only fetches `/me` on mount, so the header still read "SIGN IN" and the user appeared unauthenticated until a manual reload. | Replaced `nav('/', { replace: true })` with `window.location.replace('/')` so the Shell remounts and refetches the session. |
| C2 | `lib/api.ts` → `getTournament` | Backend returns `participants: null`, `matches: null`, `standings: null` for an empty tournament. Frontend then crashed on `detail.participants.find(...)` and the tournament detail page rendered as a fully blank dark screen with no recovery. | Coerced `participants`/`matches`/`standings` to `[]` in `api.getTournament`. Also tightened the `TournamentDetail.standings` type from `StandingsRow[] \| null` to `StandingsRow[]`. The proper long-term fix is on the backend (return empty slices, not `null`); the frontend coercion is a belt-and-suspenders guard. |

Note: the frontend container in `docker-compose.yml` has **no source volume mount**, so edits to `frontend/src/...` are not picked up by HMR — `docker compose up -d --build frontend` is required to apply any frontend change. Pablo may want to mount `./frontend:/app` (with a node_modules anonymous volume) so the inner-loop matches a normal Vite dev experience.

## Leftover UX rough edges

### High

| # | Where | Finding | Suggested fix |
| - | ----- | ------- | ------------- |
| H1 | `TournamentNew.tsx` | The "max participants" field that the task brief expects for Knockout (`max=8`) is not exposed in the UI. The backend appears to accept tournaments without it and generate a bracket from whoever joined. For knockout, capacity has real consequences (bye count, bracket shape, registration cap). | Add a numeric "max participants" input that becomes visible/required when format=KNOCKOUT. Default 8, allowed powers of 2 or any N with backend-computed byes. |
| H2 | Backend (`GetTournament`) | Returning `null` for empty slices is a footgun for any future consumer (we already hit C2). | In the Go handler, initialize `Participants`, `Matches`, `Standings` to non-nil empty slices before JSON encoding. |
| H3 | `Shell.tsx` footer | Footer reads "league mode active · knockout deferred", which is stale — knockout is fully implemented and demoed today. New users (and Pablo's stakeholders) will assume knockout is unfinished. | Drop the "knockout deferred" half, or change to "league · knockout active". |

### Medium

| # | Where | Finding | Suggested fix |
| - | ----- | ------- | ------------- |
| M1 | `TournamentNew.tsx` | LEAGUE card shows "✓ available" but KNOCKOUT card does not, despite being available. Reads as if knockout is disabled. | Either show "✓ available" on both, or drop the badge entirely. |
| M2 | `TournamentDetail.tsx` header stats | KO matches go directly from PLAYABLE → COMPLETED (skipping REPORTED). The header stat "REPORTED" therefore stays at `00` through an entire knockout tournament. | For KO, relabel the stat to "completed" (or count COMPLETED matches into the same number). |
| M3 | Bracket pending matches | PENDING semi/final cards show `— TBD —` for both sides even when one slot is already filled by a bye (e.g. "SC Freiburg vs — TBD —"). A casual user can't tell that Freiburg got a bye. | Either render the bye-recipient name in PENDING cards immediately, or add an explicit "bye" badge on the recipient. |
| M4 | Login page | While logged out, the login form re-renders without a "magic link" panel visible until the user submits. Then the minted dev link appears below in tiny text. The link is clickable, but the affordance ("click this link to sign in") isn't obvious — first-timers may copy/paste it into a new tab. | Add a short hint line above the link: "Click the link below to consume it (dev only)." |
| M5 | Score editing | The `<input type="number">` shows native browser steppers (up/down arrows). They overlap the field aesthetic and feel out of place against the rest of the type-set UI. | Hide native steppers via CSS (`appearance: textfield`) or replace with custom +/- buttons. |

### Low

| # | Where | Finding | Suggested fix |
| - | ----- | ------- | ------------- |
| L1 | `TournamentDetail.tsx` | The "your team" select for a participant filters out other taken teams (good), but offers no visual sort/grouping beyond league `optgroup`. With many leagues this dropdown gets long. | Add a search/typeahead, or surface "most popular leagues" first. |
| L2 | `TournamentDetail.tsx` participants tab | After the tournament is ACTIVE, the participants list is no longer reachable from the default tab on knockout (auto-jumps to BRACKET) — fine. But the LEAVE button vanishes immediately, which is correct, yet there's no UI confirmation of the transition; users may briefly think their join "broke". | Add a one-frame toast like "Tournament started · bracket locked." |
| L3 | KO bracket layout | The 1-match quarter, 2-match semi, 1-match final layout uses equal-width columns. With only 1 match the column has lots of empty vertical space. | Auto-collapse columns to fit content height, or center the lone match in the column. |
| L4 | Score input keyboard UX | Pressing Enter in a score input does not submit the form (there's no `<form>` wrapper). Users may try to hit Enter and nothing happens. | Wrap the editing row in a `<form onSubmit={submit}>`; keep the existing Save button. |
| L5 | Header time | Live UTC clock in the header is a fun touch but is set on a 1s `setInterval` even when the user is on the login page or idle — minor battery/CPU. Also there's a brief flicker where time is empty on first render. | Initialize with current time synchronously and use `requestAnimationFrame` once a second or accept as-is (cosmetic). |
| L6 | Tournament ledger | The list still includes seeded fixtures from prior dev sessions (e.g. "Testy Test", "Friday Night Cup x2"). For a demo, a "scratch all" or "filter by status" affordance would help. | Add a status filter chip row above the table. Out of scope for MVP. |

## Verified working (no issues)

- Login form renders cleanly, magic-link request → consume flow works once the post-consume reload is in place.
- League creation, join (UI), join (API), start (UI), score report (UI), score edit (UI), standings recompute (3/0 → 1/1).
- Knockout creation, bracket generation with 5 participants (1 R1 + 2 R2 + 1 final, 3 byes pre-placed into R2), winner propagation R1 → R2 → final, champion banner on completion.
- Knockout draw rejection — clear inline error: "draws are not allowed in a knockout match".
- Re-scoring a completed R1 match when its R2 successor is already completed — clear inline error: "downstream match already completed; reset it first".
- The footer "knockout deferred" copy is the only place where the app misrepresents its own capability (H3 above).

## Screenshots / GIFs

- `docs/league-demo.gif` — League golden path (login → create → join → start → report → edit → standings).
- `docs/knockout-demo.gif` — Knockout golden path (create → join → start → bracket → draw rejection → score progression → champion → downstream-reject error).
