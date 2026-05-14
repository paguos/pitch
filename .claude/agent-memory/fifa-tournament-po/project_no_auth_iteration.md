---
name: project-no-auth-iteration
description: No auth and no global "acting player" — adding someone to a tournament picks player_id + team_id explicitly in the form
metadata:
  type: project
---

The Pitch MVP has no authentication AND no global "acting player" concept.
The brief "Acting as" header dropdown iteration was removed because it forced
identity-switching to add multiple players from the same browser.

Current model:

- **No global actor.** No `ActorProvider`, no `useActor`, no
  `pitch.actor_player_id` in `localStorage`, no header dropdown.
- **Join flow** on the tournament detail page is a 2-field form: pick a
  `player_id` from the players list (filtered to those not already joined)
  and a `team_id` (filtered to teams not yet taken). Click "add to tournament"
  to add. The same browser can add many players in succession.
- **API shapes**:
  - `POST /tournaments` body `{name, format}` — no actor required, anyone
    can create. `tournaments.created_by` is now nullable (migration 0005)
    and is no longer written.
  - `POST /tournaments/{id}/participants` body `{player_id, team_id}`.
  - `DELETE /tournaments/{id}/participants/{playerID}` removes a participant.
  - `PATCH /tournaments/{id}/participants/{playerID}` body `{team_id}`
    swaps team.
  - `PUT /matches/{id}/score` body `{home_goals, away_goals, version}` —
    no `updated_by_player_id`, no attribution.

**Why:** the dropdown was the wrong UX — it forced context-switching
identities to add multiple players. The explicit per-add picker is the
natural multi-player flow and removes a whole class of "who am I right now"
confusion. Anyone with access can drive everything; this is a UX shortcut,
not a security boundary.

**How to apply:** Do not reintroduce session cookies, login routes, an
acting/current-user concept on the frontend, or `requireUser` middleware.
When designing endpoints or UI flows that involve a participant, always
carry the `player_id` in the request body/path. Score submission has no
attribution column on `matches`.

Related: [[feedback-no-browser-dialogs]],
[[project-delete-referential-integrity]].
