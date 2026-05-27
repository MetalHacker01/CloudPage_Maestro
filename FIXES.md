# CloudPage Maestro — Fix Log

A chronological log of bugs and their working fixes. **Read this before touching any related code.** Never undo an entry without re-reading "Never regress to" and confirming with the user.

---

## 2026-05-27 — Checkboxes stay checked after a batch action (move / publish / unpublish)

**Problem:** After selecting rows and running a batch action, the checkboxes stayed ticked — confusing, looked like the selection was still live.

**Root cause:** Two issues. (1) `performBatchMove` cleared the `selectedPages` model but never unchecked the DOM checkboxes, so after a Move the boxes stayed visibly ticked. (2) `bulkPublish` / `bulkUnpublish` cleared both, but the cleanup was duplicated inline in three places and inconsistent. (3) Restore-on-render read a DOM snapshot (`previouslyCheckedIds`) instead of the `selectedPages` model, a second source of truth that let stale ticks re-appear on the next Refresh.

**Fix:**
- New `cpmClearSelection()` (content.js, just before `bulkUnpublish`) — the single cleanup path: clears `selectedPages`, unchecks every `.page-select-checkbox`, resets the select-all box (`checked` + `indeterminate`), refreshes the bulk-action bar.
- `bulkPublish`, `bulkUnpublish`, and `performBatchMove` all call it now (Move previously skipped the DOM uncheck).
- Restore-on-render now reads `window.CPM_STATE.selectedPages` (single source of truth) instead of a DOM snapshot; removed the `previouslyCheckedIds` preserve block. Bonus: selection now persists correctly across pagination.
- Mirrored to `CloudPage_Maestro_Firefox/content.js`.

**Verified by:** TBD — user testing required. Select rows, run move/publish/unpublish, confirm all checkboxes (and select-all) clear immediately and stay clear after Refresh.

**Never regress to:**
- **Clearing only `selectedPages` without unchecking the DOM checkboxes** (the original Move bug), or duplicating the cleanup inline per action. Route every batch action's cleanup through `cpmClearSelection()`.
- **Restoring checkbox state from a DOM snapshot.** `window.CPM_STATE.selectedPages` is the single source of truth; restore-on-render must read from it so clearing the model reliably clears the UI.

---

## 2026-05-27 — Toggle tab stays in the open position after closing via X / Escape

**Problem:** With the panel open, closing it via the X button (or the Escape key) left the toggle tab parked where it sits while the panel is open, instead of sliding back to the screen edge.

**Root cause:** The toggle's position is driven entirely by the `panel-open` class (`.cpm-toggle-btn.panel-open` repositions it to track the open panel). Only the toggle-click handler (content.js ~1005) and the peer-pause path (`cpmPauseForPeer`, ~85) cleared that class. The X-button handler (~3001) and the Escape handler (~3174) only did `panel.classList.add('minimized')` and set the state flag — they never removed `panel-open` from the toggle, so the tab stayed offset.

**Fix:** New canonical `cpmClosePanel()` (content.js, right after `cpmAnnouncePanelState`) that: adds `minimized`, sets `CPM_STATE.isPanelOpen = false`, removes `panel-open` from the toggle, and announces `sfmc-panel:close` to the peer. The X-button and Escape handlers now both call `cpmClosePanel()`. Mirrored to `CloudPage_Maestro_Firefox/content.js`.

**Verified by:** TBD — user testing required. Reload the extension, open the panel, close via X and via Escape, confirm the toggle returns to the edge in both standalone and dual-extension (Scout installed) modes.

**Never regress to:**
- **Closing the panel with a bare `panel.classList.add('minimized')`.** Every close path must also clear the toggle's `panel-open` class, otherwise the tab is left parked in the open position. Route all closes through `cpmClosePanel()` rather than duplicating the close logic.
- **A close path that doesn't announce `sfmc-panel:close`.** With both extensions installed, the peer (Scout) stays paused until it hears the close event. The toggle-click path always announced; the X/Escape paths did not, so Scout could stay paused after CPM closed. `cpmClosePanel()` announces for every user-close.
- **Routing `cpmPauseForPeer` through `cpmClosePanel()`.** That path intentionally does NOT announce close (Scout just opened); keep it separate so it doesn't tell Scout to resume the moment it took over.
