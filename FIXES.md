# CloudPage Maestro — Fix Log

A chronological log of bugs and their working fixes. **Read this before touching any related code.** Never undo an entry without re-reading "Never regress to" and confirming with the user.

---

## 2026-06-15 — Single-row Unpublish on enriched landing pages 404s as a code resource

**Problem:** Clicking Unpublish on a landing page (from the row action button, after the row had been async-enriched) POSTed to `/code-resources/{siteId}/unpublish` and returned `HTTP 404: Resource does not exist (30003)`. Batch Unpublish on the same row worked.

**Root cause:** Two render paths used different `itemType` conventions for the `data-type` attribute on action buttons:
- Initial render (`renderTable`, ~line 4348): `const itemType = isLanding ? 'landing' : 'asset';`
- Post-enrichment patch (`patchEnrichedRow`, ~line 3805): `const itemType = item.assetType?.name?.toLowerCase() || 'landingpage';`

`patchEnrichedRow` rewrites `cells[8].innerHTML` (the actions cell) AFTER async enrichment, so the unpublish button ended up with `data-type="landingpage"` instead of `"landing"`. The dispatch in the action-button click handler checks `if (type === 'landing') unpublishPage(...) else unpublishCodeResource(...)` — `'landingpage' !== 'landing'`, so it fell to the code-resource branch, fetched `/sites?siteAssetId={id}`, used the returned `siteId` as if it were a `codeResourceId`, and POSTed `/code-resources/{siteId}/unpublish` → 404. Batch Unpublish was unaffected because it reads `cb.dataset.type` from the checkbox, which `patchEnrichedRow` doesn't rewrite.

**Fix:** Make `patchEnrichedRow` use the same convention as the initial render — `isLanding ? 'landing' : 'asset'` — so the rewritten action buttons keep the right `data-type` value the dispatch expects.

**Verified by:** TBD — user testing required. Search for a landing page, wait for enrichment, click the row's Unpublish button. Expect: `POST /landing-pages/{siteId}/unpublish` (200), not `/code-resources/...` (404).

**Never regress to:**
- **A second `itemType` formula in any new render/patch helper.** There is exactly one mapping (`isLanding ? 'landing' : 'asset'`) and the dispatch (`type === 'landing'`) depends on it. Any new spot that writes `data-type` on a publish/unpublish/download/etc. button must use the same expression, or you reintroduce this 404. If you want a different convention, change the dispatch too.
- **Reading `assetType.name?.toLowerCase()` directly into a button `data-type` attribute.** That convention is for matching against the asset-type enum (e.g. `'landingpage'`, `'jscoderesource'`) — not for the dispatch shortcut. Mixing the two is exactly what caused this bug.

---

## 2026-06-01 — Edit URL (batch) — change domain + site key for many landing pages in one modal

**What it does:** New batch action. Select any number of landing-page rows → "Edit URL" → spreadsheet-style modal with one editable row per LP (Domain dropdown + Site Key input + live URL preview). Edit individually or use "Set domain for all". Apply runs (in sequence per LP): unpublish-if-needed → SiteKeyPageKey/Validate → PUT landing-pages/{id}. After the loop, originally-published pages get a "Republish N pages?" prompt that fires the existing publishPage in a loop with progress. Selection is cleared via `cpmClearSelection()` (same rule the other batch actions use, see 2026-05-27 entry) and the list auto-refreshes by programmatically clicking `#cpm-refresh` so rendered rows reflect the new URLs/status immediately.

**Endpoints (all cookie + X-CSRF-Token: appcoreToken, same auth pattern publish/unpublish already use, host `cloud-pages.${stack}.marketingcloudapps.com`):**
- `GET /fuelapi/internal/v2/cloudpages/domains` → domain options
- `GET /fuelapi/internal/v2/cloudpages/landing-pages/{id}` → current key, domain, categoryId, name, requiresSsl, status (needed for the PUT body)
- `GET /fuelapi/internal/v1/cloudpages/SiteKeyPageKey/Validate?domain=X&siteKey=Y` → `[]` when available
- `PUT /fuelapi/internal/v2/cloudpages/landing-pages/{id}` body `{landingPageId, categoryId, name, key, domain, requiresSsl}`

**Files touched:**
- `CloudPage_Maestro_Chrome/content.js` — `ICONS.editPencil`, toolbar button `#cpm-batch-edit-url`, count handling in `updateBulkActions`, click wiring in `setupEventListeners`, and a new block after `batchMoveDebug` containing `cpmEuRequest`/`cpmEuFetchDomains`/`cpmEuFetchDetail`/`cpmEuValidate`/`cpmEuSave`, `openEditUrlModal`, and `offerRepublishAfterEdit`. Mirrored to `CloudPage_Maestro_Firefox/`.

**Verified by:** TBD — user testing required. Select 1-3 landing pages (mix of Published + Draft), click "Edit URL", change keys/domains, Apply. Expect: published rows briefly unpublish, all PUTs succeed, republish prompt appears for the originally-published ones, refresh shows the new URLs.

**Never regress to:**
- **PUTting without first unpublishing a published page.** SFMC rejects the URL change while the page is live; the unpublish-first step is required. Route through `openEditUrlModal`'s loop or always check `status` before PUT.
- **Guessing or hardcoding the SOAP/REST host for the cloud-pages app.** Always use the same `cloud-pages.${stack}.marketingcloudapps.com` template the existing publish/unpublish use, so adding more endpoints stays consistent.
- **Skipping the SiteKeyPageKey/Validate check.** Without it, a conflict surfaces as a 400 from PUT mid-batch; better to fail-fast in the modal with an inline error and let the user fix the key before any unpublish fires.
- **Applying Edit URL to code resources.** The PUT endpoint is `landing-pages/{id}` only; code resources have different mechanics. The button is gated on `dataset.type === 'landing'` selections — keep that gate.
- **Adding a new batch action and forgetting `cpmClearSelection()` + auto-refresh.** Edit URL initially shipped without these and the 2026-05-27 checkbox-persistence bug re-appeared on the next render. Every new batch flow must end with `cpmClearSelection()` and (for actions that mutate visible row data like URL/status) a `document.getElementById('cpm-refresh')?.click()` so the table doesn't show stale URLs.

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
