# Chrome Web Store submission package

Copy-paste ready text for both extensions. Drafted to match the tone of the existing SFMC tools on the Web Store (Inspector, Companion, Automation Viewer, IntelliType) without sounding like marketing fluff. No em dashes anywhere.

Screenshots and the small promo tile (440 by 280) still need to be produced from your end. Everything else below is ready.

---

## Shared: privacy policy

Host this once and link to it from both listings. Easiest path is GitHub Pages on either repo, served at `https://metalhacker01.github.io/CloudPage_Maestro/PRIVACY.html` or similar. Save the text below as `PRIVACY.md` in one repo, enable Pages, and use that URL in both Chrome Web Store listings.

```
Privacy Policy

Last updated: May 2026

This privacy policy applies to the Chrome extensions CloudPage Maestro and SFMC Scout (the "extensions"), both published by Aldorino Rrushi.

1. What the extensions do
   The extensions add a panel inside Salesforce Marketing Cloud (SFMC) that helps users manage and inspect their own SFMC assets. The extensions only run on SFMC domains (*.exacttarget.com, *.marketingcloudapps.com, *.sfmc-content.com) and only when the user is already signed into SFMC.

2. What data is accessed
   The extensions read data from the user's own active SFMC session: landing pages, code resources, data extensions, automations, journeys, content assets, folders, statuses, and URLs. All API calls go to the user's SFMC instance using the user's existing browser cookies. No data leaves the user's browser.

3. CSRF tokens
   For write operations (publish, unpublish, move, create), SFMC requires a short-lived x-csrf-token header. The extensions passively read this header from outbound traffic the user's own SFMC tab is already sending, and store it in chrome.storage.local for the duration of the session. The token is a session-scoped CSRF token issued by SFMC, not a credential. It cannot be used outside the user's logged-in browser. Tokens are never transmitted to any third party.

4. What data is sent off-device
   None. All API requests go directly from the browser to the user's SFMC instance. The extensions do not contact any server controlled by the developer. There is no analytics, no telemetry, no remote logging.

5. Local storage
   chrome.storage.local is used to persist: UI preferences (dark/light theme, panel width, panel-open state), short-lived CSRF tokens, and (for SFMC Scout only) user-saved code snippets. Storage is cleared when the user uninstalls the extension or clears Chrome storage manually.

6. Third-party services
   None. The extensions do not load remote code, do not include analytics, and do not call any developer-controlled endpoint.

7. Children
   The extensions are developer tools intended for Salesforce Marketing Cloud users. They are not directed at children.

8. Changes to this policy
   This policy may be updated when extension functionality changes. The "Last updated" date will reflect material changes.

9. Contact
   Aldorino Rrushi
   GitHub: https://github.com/MetalHacker01
   Email: aldorino.rrushi@gmail.com
```

Drop your contact email in the last field. The Web Store form will ask for a privacy policy URL; use the GitHub Pages URL where this is hosted.

---

## CloudPage Maestro

### Name
```
CloudPage Maestro
```

### Short description (132 character limit)

Pick one. Both fit under the limit.

Option A (focused on the action):
```
Batch publish, unpublish, search, move, download and export Salesforce Marketing Cloud landing pages and code resources.
```

Option B (focused on the pain):
```
Manage hundreds of SFMC CloudPages at once. Bulk publish, unpublish, search, download HTML, export to CSV, all in one panel.
```

### Category
```
Developer Tools
```

### Language
```
English
```

### Single purpose statement
```
Batch management of Salesforce Marketing Cloud CloudPages assets: publish, unpublish, search, filter, move, download source files, and export metadata.
```

### Detailed description

```
CloudPage Maestro adds a panel to Salesforce Marketing Cloud that lets you work with CloudPages assets in bulk instead of one at a time. Open it on any SFMC tab and you get the asset list across every page of the Business Unit, with status, URL, folder path, and last-modified info already filled in.

What you can do from the panel:

• Bulk publish and unpublish. Select any number of landing pages or code resources and run the action in one click. Concurrent batches with a progress toast.

• Bulk move. A folder tree picker shows the full SFMC category hierarchy. Move dozens of assets at once.

• Search. Server-side search across name, content, description, and folder path. Filter by type: Landing Pages, JSON, JavaScript, CSS.

• Download All. One click packages every landing page HTML and every code resource source file (JS, CSS, JSON) into a ZIP with the SFMC folder tree preserved exactly. There is also a flat HTML-only mode for when you just want the pages.

• Export All to CSV. Every asset across every page, with status, URL, folder path, customer key, modified by, and asset ID. UTF-8 with BOM so Excel renders accents correctly.

• Live URL preview. Hover a published landing page URL in the table and a small iframe preview pops up.

• Single-asset download. Every row has a download icon for grabbing just that asset.

• Dark and light mode. The whole panel, including modals and progress toasts, follows your selected theme. Persists across sessions.

• Keyboard shortcuts. Esc to close, Ctrl+Shift+F to focus search, Ctrl+A to select all visible.

How it works

CloudPage Maestro reads from SFMC's internal /cloud/fuelapi/ proxy using your existing session cookies. There is no login, no OAuth flow, no credential entry. The moment you are signed into SFMC, the extension just works. For write operations (publish, unpublish, move), SFMC requires a short-lived CSRF token. The extension picks it up passively from outbound traffic SFMC is already sending and stores it locally for the duration of your session.

No data leaves your browser. The extension does not call any third-party server. There is no analytics or telemetry.

This is an unofficial community tool. It is not affiliated with, endorsed by, or supported by Salesforce. Internal SFMC endpoints are subject to change.

Source code: https://github.com/MetalHacker01/CloudPage_Maestro
Documentation: https://metalhacker01.github.io/CloudPage_Maestro/
```

### Permission justifications

Paste these into the per-permission fields in the dev console.

**storage**
```
Persists UI preferences (dark/light theme, panel width, last-open filter) and short-lived CSRF tokens passively captured from the user's own active SFMC session. All values are stored locally in chrome.storage.local. Nothing is transmitted off the device.
```

**webRequest**
```
Reads the x-csrf-token header from outbound API requests that the user's own SFMC tab is already sending. SFMC requires this header on write operations (publish, unpublish, move). The extension does not modify or block any request. It only observes outgoing headers to keep a fresh token available so the user does not have to re-authenticate when running bulk actions.
```

**Host permissions (`*.exacttarget.com`, `*.marketingcloudapps.com`, `*.sfmc-content.com`)**
```
These are the only domains where Salesforce Marketing Cloud is served. The extension's panel is injected into the user's SFMC tab and all API calls go to the user's own SFMC instance on these domains. No other domains are accessed.
```

### Data usage disclosures (yes/no fields in dev console)

| Question | Answer | Note |
|---|---|---|
| Personally identifiable information | No | |
| Health information | No | |
| Financial / payment info | No | |
| Authentication information | Yes | Disclose: "Captures a short-lived CSRF token from the user's own active SFMC session, stored locally in chrome.storage.local. Used to authorize bulk write operations on the user's behalf. Never transmitted to any third party." |
| Personal communications | No | |
| Location | No | |
| Web history | No | |
| User activity | No | |
| Website content | No | |

### Other dev console fields

- **Remote code:** No. The only third-party library is JSZip 3.10.1, which is bundled locally inside `lib/jszip.min.js`.
- **Privacy policy URL:** the GitHub Pages URL you set up from the shared policy above.
- **Support URL:** `https://github.com/MetalHacker01/CloudPage_Maestro/issues`
- **Homepage URL:** `https://github.com/MetalHacker01/CloudPage_Maestro`
- **Distribution country list:** All countries (unless you have a reason to restrict).
- **Visibility:** Public.
- **Pricing:** Free.

---

## SFMC Scout

### Name
```
SFMC Scout
```

### Short description (132 character limit)
```
Search, inspect and report on Data Extensions, Automations, Journeys, Emails, Templates and Activities from a panel inside SFMC.
```

### Category
```
Developer Tools
```

### Language
```
English
```

### Single purpose statement
```
Cross-module search and inspection of Salesforce Marketing Cloud assets (Data Extensions, Automations, Journeys, Emails, Templates, Activities, Snippets) from an injected side panel, plus DE create / import / export / report tools and standalone HTML reports.
```

### Detailed description

```
SFMC Scout adds a persistent side panel to Salesforce Marketing Cloud that lets you search, inspect, and work with assets across every module from one place. Universal search hits Data Extensions, Automations, Journeys, Emails, Templates, Content Builder assets, and Activities in one keystroke. Each result row already shows enough context to act on (folder breadcrumb, status pills, IDs, file size). Click any row to open an inline detail card right inside the panel. No login, no OAuth, no credentials. The moment you are signed into SFMC, the panel works.

What is in the panel:

• Universal search. One bar, every module. Results stream in progressively as each source responds, grouped by type with the top matches first.
  - Data Extensions: name, key, folder path (walks Shared Items tree so cross-BU and shared-subfolder DEs show their real path, no more "Unknown Folder").
  - Automations: status pill, last run, color-coded state (Active, Scheduled, Paused, Error, Ready).
  - Journeys: status pill, version, HTS flag, trigger type, channel. Click to expand an inline detail card with activity count, cumulative population, entry source DE name and ID, entry criteria as a code block, humanized schedule, and an Open in Journey Builder button.
  - Content Builder Assets, Emails, and Templates: name, type, folder breadcrumb, asset ID, Email ID. Click to expand: file size and dimensions for uploads, a Preview button for emails and templates that renders the HTML in a modal, an Open File button for uploaded files (clickable CDN link).
  - Activities (SQL Queries, Scripts, Filters, Send Emails, Imports, File Transfers, Data Extracts): folder breadcrumb plus an Update Mode chip (Overwrite, Append, Update) inline on every row.

• Automations browser. Color-coded status badges. Click any automation to view its full step breakdown with every SQL query, script, and activity. Syntax-highlighted SQL and SSJS code blocks, expandable per step. Open the automation in SFMC Automation Studio directly from the detail view.

• Data Extension tools.
  Search: find any DE with field count, folder, sendable flag.
  Create: build a new DE with typed fields, sendable / testable configuration, folder selector.
  Export: download all DEs as structured JSON or individual files in a ZIP.
  Import: restore DEs from a previously exported JSON, with optional folder re-creation.
  Report: full HTML report with row counts, field counts, sendable mapping, folder path. CSV download lives inside the report (works offline once opened).

• Journeys browser. Active and draft journeys with the same rich row pills as the search results, and the same inline detail card on click.

• Standalone HTML reports. All reports open in a new tab as self-contained pages with a Download CSV button in the report header (UTF-8 BOM, runs entirely in the page), live filter input, sortable columns, color-coded status badges, dark and light theme support. Available reports:
  - Automations Report: Name, Status, Key, Last Run, Schedule, Steps, Folder, Created By, Description, Created, Modified.
  - Journeys Report: Name, Status, Version, HTS, Trigger, Entry DE, Population, Channel, Modified.
  - Assets Report: Name (clickable CDN link for files), Type, Status, ID, Email ID, Customer Key, Folder, Created By, Created, Modified.
  - Activities Report: Name, Type, Key, Target DE, Update Type, Folder, Description, Modified.
  - Data Extensions Report: full field inventory with row counts, sendable mapping, folder path.

• Snippets. Save, label, and tag reusable AMPscript, SSJS, and SQL snippets. Deploy a snippet directly into an open SFMC Ace editor (Cloud Pages, Script Activities) with one click. Syntax-highlighted preview.

• Dark and light mode. Theme persists across sessions and applies to the panel and every generated report.

How it works

Scout reads from SFMC's internal /cloud/fuelapi/ proxy using your existing session cookies. No login, no OAuth, no credential entry. The moment you are signed into SFMC, the panel works. For the few endpoints that require a CSRF token (DE create, DE import, contact lookup), the extension passively reads the token from outbound traffic SFMC is already sending and stores it locally for the duration of the session.

Universal Search uses real server-side filters (the same ones SFMC's own UI uses), so it returns full matches even on production orgs with 5,000+ automations and 400+ journeys. Search results are capped at the top 40 matches per type by relevance, then grouped and collapsed to the top 10 per group with "Show all N" inline expansion. The dedicated DE Tools, Automations, and Reports tabs give you full paginated browsing for exhaustive work.

No data leaves your browser. The extension does not call any third-party server. There is no analytics or telemetry.

This is an unofficial community tool. It is not affiliated with, endorsed by, or supported by Salesforce. Internal SFMC endpoints are subject to change.

Source code: https://github.com/MetalHacker01/SFMC_Scout
```

### Permission justifications

**storage**
```
Persists UI preferences (theme, panel state), short-lived CSRF tokens passively captured from the user's own active SFMC session, and user-saved code snippets (AMPscript, SSJS, SQL). All values are stored locally in chrome.storage.local. Nothing is transmitted off the device.
```

**webRequest**
```
Reads the x-csrf-token header from outbound API requests that the user's own SFMC tab is already sending. SFMC requires this header on the small subset of operations that involve creating or modifying records (DE create, DE import). The extension does not modify or block any request. It only observes outgoing headers so the user can run those actions without re-authenticating manually.
```

**tabs**
```
Opens the selected SFMC asset (automation, journey, data extension) in a new SFMC tab when the user clicks a search result or a "Open in SFMC" button in the panel. Standard chrome.tabs.create with the SFMC URL.
```

**scripting**
```
Used by the Snippets feature only. When the user clicks "Deploy to editor" on a saved code snippet, chrome.scripting injects the snippet text into the open SFMC Ace editor (CloudPages HTML editor, Script Activity editor). The injection target is always the user's own active SFMC tab. No code from any external source is injected; only snippets the user themselves saved in the panel.
```

**Host permissions (`*.exacttarget.com`, `*.marketingcloudapps.com`)**
```
These are the only domains where Salesforce Marketing Cloud is served. The panel is injected into the user's SFMC tab and all API calls go to the user's own SFMC instance on these domains. No other domains are accessed.
```

### Data usage disclosures

| Question | Answer | Note |
|---|---|---|
| Personally identifiable information | No | |
| Health information | No | |
| Financial / payment info | No | |
| Authentication information | Yes | Same disclosure as CPM: short-lived CSRF token, stored locally, never transmitted off-device. |
| Personal communications | No | |
| Location | No | |
| Web history | No | |
| User activity | No | |
| Website content | No | (Snippets are user-authored code stored locally, not "website content" in the policy sense.) |

### Other dev console fields

- **Remote code:** No. No CDN-loaded scripts.
- **Privacy policy URL:** same GitHub Pages URL as CPM.
- **Support URL:** `https://github.com/MetalHacker01/SFMC_Scout/issues`
- **Homepage URL:** `https://github.com/MetalHacker01/SFMC_Scout`
- **Distribution country list:** All countries.
- **Visibility:** Public.
- **Pricing:** Free.

---

## Submission checklist

Run through this before clicking submit on each extension.

### Before zipping the package

- [ ] `manifest.json` version bumped if you are re-uploading after a failed review
- [ ] No unused permissions in `manifest.json` (verified clean for both)
- [ ] `lib/jszip.min.js` is present for CPM (manifest content_scripts loads it before `content.js`)
- [ ] No `console.log` of sensitive data left over (both projects are clean)
- [ ] Open `chrome://extensions/` with developer mode on, Load unpacked the folder, confirm panel works on a real SFMC tab

### Build the upload ZIP

Zip the folder contents, not the folder wrapper.

For CPM, from inside `CloudPage_Maestro_Chrome/`:
```
manifest.json
background.js
content.js
lib/jszip.min.js
icons/icon-16.png
icons/icon-48.png
icons/icon-128.png
icons/CP_Maestro_Logo.png
icons/CP_Maestro_Logo_Colored.png
```

For Scout, from inside `SFMC_Scout/`:
```
manifest.json
background.js
content.js
panel.css
injected_script.js
core/
handlers/
services/
utils/
icons/
```
Skip `debug.html`, `debug.js`, `index.html`, `archive/`, `docs/`, `FIXES.md`, `CLAUDE.md`, `.git/`, `.gitignore`, `.vscode/`, `README.md`. The review only wants the runtime files.

### Required uploads in the dev console

| Field | CPM | Scout |
|---|---|---|
| Package ZIP | ready | ready |
| Store icon (128x128) | `icons/icon-128.png` | `icons/icon-128.png` |
| Screenshots (at least 1, ideally 3-5, 1280x800 or 640x400) | need from you | need from you |
| Small promo tile (440x280) | need from you | need from you |
| Marquee promo (1400x560, optional but recommended) | optional | optional |

### Things to capture in screenshots

Plan 4 to 5 per extension to fill the gallery.

**CPM:**
1. Panel open on SFMC with the full asset list visible. Both modes (one shot dark, one shot light).
2. A batch unpublish in progress with the bottom-right progress toast visible.
3. The Download All dropdown menu open.
4. The folder picker modal (Move action) showing the SFMC category tree.
5. The Export All overlay mid-progress.

**Scout:**
1. Universal search with multiple result groups visible (DEs + Automations + Assets).
2. Automation detail view with SQL syntax highlighting.
3. DE Tools tab with the Create / Export / Import / Report buttons.
4. A generated report (Assets or Automations) in its own tab.
5. Snippets tab with the deploy-to-editor button.

Blur any real customer names, email addresses, or account IDs visible in your test BU before uploading.

### Review expectations

- Typical first-time review: 1 to 3 business days. Extensions with broad host permissions can take up to a week if the reviewer wants clarification.
- The reviewer may email you asking to clarify why `webRequest` is needed. Reply with the same justification text above; usually unblocks within a day.
- If rejected for a vague reason, you can resubmit immediately after fixing. There is no penalty for multiple resubmissions.

### Order of operations recommendation

1. Get the privacy policy hosted first. Without a URL, both submissions will be blocked.
2. Submit CPM first as the lower-risk submission (fewer permissions, simpler scope). Use it as the shakedown for the review process.
3. Once CPM is published, submit Scout. Reviewers have your dev history at that point and Scout's extra permissions (`tabs`, `scripting`) get less scrutiny.

---

## What I still need from you

- Screenshots (5 per extension) once you have them. I can help write the captions / alt text if useful.
- Small promo tiles (440x280). If you do not want to design them, the simplest version is your logo centered on a brand-color background with the extension name in white. I can write you a one-page brief for that if you want.

Privacy email is set to `aldorino.rrushi@gmail.com`. Privacy policies are hosted at:
- CPM: `https://metalhacker01.github.io/CloudPage_Maestro/PRIVACY.html`
- Scout: `https://metalhacker01.github.io/SFMC_Scout/PRIVACY.html`

Submission ZIPs are at:
- CPM: `dist/cloudpage-maestro-chrome-v1.0.0.zip`
- Scout: `dist/sfmc-scout-chrome-v2.1.0.zip`

Once screenshots and promo tiles land, you have everything for a clean submission.
