# SFMC Grep v2

## Project
Chrome Extension — injected side panel for Salesforce Marketing Cloud.
Replaces the old popup-based SFMC Grep with a CPM-style panel injected directly into SFMC pages.

## Load
1. Go to `chrome://extensions/` → Enable Developer mode
2. Click **Load unpacked** → select `SFMC_Grep_v2/`
3. Navigate to any SFMC page (`mc.s51.exacttarget.com/...` or `*.marketingcloudapps.com/...`)
4. The C3 toggle button appears on the right edge — click to open the panel

## Architecture
```
content.js          ← Panel HTML/CSS injection + token capture (single file, no build step)
background.js       ← Service worker: webRequest token interception + message hub + CORS proxy
injected_script.js  ← Injected into page: SnippetManager + AceEditorHelper (ES module)
handlers/           ← Message handlers (auth, automation, de, search, snippet, quickactions)
services/           ← DE services (create, export, import, report, search)
utils/              ← APIService, SFMCInstanceService, StorageService, ErrorHandler, etc.
core/               ← SnippetManager, AceEditorHelper, DEUsageDetector
```

## Token System (CPM-pattern)
- **Two tokens**: `sgv2_pageHookToken` (Content Builder) + `sgv2_appcoreToken` (CloudPages/admin)
- **Capture method 1**: `webRequest.onBeforeSendHeaders` in `background.js` intercepts `x-csrf-token` from SFMC requests
- **Capture method 2**: Hidden iframes injected by `content.js` to force token-bearing requests
- **Storage**: `chrome.storage.local` keys: `sgv2_pageHookToken`, `sgv2_appcoreToken`
- **No login form**: tokens captured silently from active SFMC browser session

## Panel Tabs
| Tab | Purpose |
|-----|---------|
| Search | Universal search across DEs, Automations, Journeys, Emails, Assets |
| Automations | Browse + inline detail view (steps accordion + SQL/SSJS syntax highlight) |
| DE Tools | Search, Create, Export, Import, Report — all inline |
| Snippets | Saved code snippets; deploy directly into SFMC Ace editor |

## Stack Detection
`utils/SFMCInstanceService.js` — reads `window.location.hostname` to detect stack (e.g. `s51`).

## Key Patterns
- **Paths with spaces**: Write scripts to `C:/Users/ARrushi/AppData/Local/Temp/` and run via `python`
- **No build step**: all ES modules in background; content.js is a plain script
- **Token retrieval**: send `{ type: 'GET_TOKENS' }` to background → returns `{ pageHookToken, appcoreToken }`
- **API calls**: send `{ type: 'MAKE_REQUEST', url, method, headers, body }` to background for CORS bypass
- **Message bus**: content.js ↔ background.js via `chrome.runtime.sendMessage`; page ↔ content.js via `window.postMessage`

## Design System (SLDS / CPM branding)
- Brand blue: `#0176d3` | Dark navy: `#032d60` | Success: `#04844b` | Error: `#c23934`
- Icons: Iconoir SVG (inline, no external dependencies)
- Toggle button: C3 Typeset — Georgia italic "Grep" wordmark + "SGV2" sub-label

## No External CSS Dependencies
Bootstrap and FontAwesome are removed. All styles are inline in `content.js`.
