---
name: feedback-no-browser-dialogs
description: Never use window.confirm / alert / prompt — always use the in-app AlertDialog component
metadata:
  type: feedback
---

All confirmations must use the in-app `AlertDialog` component (in
`frontend/src/components/ui.tsx`). Never use `window.confirm`,
`window.alert`, or `window.prompt`.

**Why:** Two reasons stated by Pablo: (a) the Chrome MCP tooling we use for
verification freezes on browser-native dialogs, and (b) UX quality — the
native dialogs look like a 1998 browser.

**How to apply:** Whenever a destructive or confirmation flow is needed
(delete, leave, reset, etc.), render an `AlertDialog` with explicit
`CANCEL` / `CONFIRM` buttons. For destructive actions pass
`destructive={true}` to get the coral styling. Surface server-side errors
inline inside the same dialog (replace the body), disabling the confirm
button rather than dismissing the modal.
