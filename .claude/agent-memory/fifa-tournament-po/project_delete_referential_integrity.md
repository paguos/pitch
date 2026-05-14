---
name: project-delete-referential-integrity
description: Player deletion blocks (409) when referenced by tournaments or participants — never cascades silently
metadata:
  type: project
---

`DELETE /players/:id` returns HTTP 409 with body
`{"error":"cannot delete: player is referenced by one or more tournaments"}`
when the player has any rows in `participants` or `tournaments.created_by`.

**Why:** Cascading would corrupt historical tournament records (winners,
score history). Pablo asked for "block on referential integrity" rather than
silent cascade. History wins.

**How to apply:** The delete dialog in `pages/Players.tsx` keeps the modal
open on 409, replaces its body with the server error, and disables the
Delete button so the user has to Cancel out. Apply the same pattern for any
future destructive action: surface the API error inline, never dismiss the
modal on failure. Related: [[feedback-no-browser-dialogs]].
