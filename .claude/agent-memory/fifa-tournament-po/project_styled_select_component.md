---
name: styled-select-component
description: Reusable StyledSelect (button-triggered listbox) replaces native <select> across pickers; lives in components/StyledSelect.tsx
metadata:
  type: project
---

`frontend/src/components/StyledSelect.tsx` is the reusable styled dropdown.
It's a button-triggered listbox (not a native `<select>`) so the dark/pitch
aesthetic — coral or pitch hairline panel, eyebrow header, per-row checkmark
on selected, edge accent bar on highlighted row — can be styled. Supports
keyboard nav (ArrowUp/Down, Home/End, Enter, Esc), grouping via
`StyledOption.group`, and a right-side `hint` (used for team-count badges
and league name).

**Why:** Native `<select>` can't carry the coral/pitch outlined panel +
checkmark look Pablo asked for; previously the team picker was a plain
HTML select inconsistent with the rest of the UI.

**How to apply:** Use `<StyledSelect>` for every picker. Don't fall back to
the legacy `Select` in `components/ui.tsx` (kept only for legacy callers if
any remain; the tournament Add-Participant form uses StyledSelect for
player, country, and team pickers as of 0007). The Add-Participant form is
the canonical example of cascading usage (country → team).

Related: [[seed-teams-2526]]
