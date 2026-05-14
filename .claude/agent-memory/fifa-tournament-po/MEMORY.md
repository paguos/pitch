# Memory

- [No-auth iteration](project_no_auth_iteration.md) — no auth, no global "acting" player; join form picks `player_id` + `team_id` per add
- [No browser dialogs](feedback_no_browser_dialogs.md) — use the in-app `AlertDialog` component for confirmations, never `window.confirm/alert/prompt`
- [Delete referential integrity](project_delete_referential_integrity.md) — player delete returns 409 when referenced; modal surfaces error inline rather than cascading
- [Tournament completion](project_tournament_completion.md) — knockout auto-completes on final; league needs manual `POST /tournaments/:id/end` (idempotent); UI uses AlertDialog when matches are still unscored
- [StyledSelect component](project_styled_select_component.md) — button-triggered listbox in `components/StyledSelect.tsx`; replaces native `<select>` for all pickers
- [Teams 25/26 catalog](project_seed_teams_2526.md) — migration 0007 truncates teams and reseeds 96 clubs across top 5 leagues
