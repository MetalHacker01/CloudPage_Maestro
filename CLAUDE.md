# CloudPage Maestro

## Project Overview

Chrome Extension injecting a management overlay into Salesforce Marketing Cloud (SFMC) CloudPages.
Enables batch publish/unpublish, search, filtering, asset enrichment, folder navigation, and CSV/JSON export.
Client: Cengage. SFMC stack: s51 (detected dynamically from URL at runtime).

Unofficial tool - relies on SFMC internal APIs (not Salesforce-supported).

## Tech Stack

- **JavaScript (ES5/ES6)** - no build step, no bundler, load unpacked directly
- **Chrome Extension Manifest v3** - service worker (background.js) + content script (content_v8.js)
- **Chrome APIs** - chrome.storage.local, chrome.runtime.sendMessage, chrome.webRequest
- **SFMC Internal APIs** - Content Builder (/fuelapi/asset/v1/content/assets/query) and CloudPages (/fuelapi/internal/v2/cloudpages/)
- **SLDS** (Salesforce Lightning Design System) - inline styles mirroring SFMC UI conventions

## Key Directories

| Path | Purpose |
|------|---------|
| Chrome_Extension_v8/ | Active version - manifest, background.js, content_v8.js, icons |
| Chrome_Extension/ | Stable v6 reference - do not modify |
| Final_Version/ | Canonical docs: API specs, project history, query schemas |
| cursor/Chrome_Extension_v7/ | Failed modular refactor - do not use as base |
| cursor/CURSOR_V6_CHANGELOG.md | Detailed v6 bug fixes and decisions |

## Build / Load Commands

No build step. Load as unpacked Chrome extension:

1. Open chrome://extensions/
2. Enable Developer mode (top-right toggle)
3. Click Load unpacked and select Chrome_Extension_v8/
4. Navigate to mc.s51.exacttarget.com/cloud/#app/CloudPages/

To reload after edits: click the refresh icon on the extension card.

## Key Files

| File | Purpose |
|------|---------|
| Chrome_Extension_v8/manifest.json | Permissions, host patterns, content script registration |
| Chrome_Extension_v8/background.js | Token interception (webRequest), API proxy (CORS bypass), token polling helper |
| Chrome_Extension_v8/content_v8.js | All UI, state, API calls, enrichment, export, token capture iframes |

### content_v8.js sections (approximate line ranges)

| Section | ~Lines | Notes |
|---------|--------|-------|
| Config + constants | 1-30 | DEBUG_MODE, CPM_CONFIG object |
| Request queue | 54-80 | Concurrency limiter |
| Enrichment cache | 84-104 | 5-min TTL Map |
| State (window.CPM_STATE) | 106-160 | Global state object |
| Token capture + iframe injection | 195-290 | captureTokensFromDOM(), injectTokenCaptureIframes() |
| Init + token fetch | 290-330 | Polls background for tokens on open |
| Data loading | 1680-1860 | loadAllData(), loadPage() |
| Content Builder API | 2100-2150 | fetchCloudPagesAPI() - pagination fixed |
| Enrichment | 2000-2100 | enrichVisibleItems(), lazy + cached |
| Render + UI | 700-1500 | renderTable(), createMainUI() |
| Batch ops | 1900-2000 | batchPublishAsync(), batchUnpublishAsync() |
| Export | ~2200 | exportCSV(), exportJSON() |

## Additional Documentation

Check these before making changes in the relevant area:

- .claude/docs/architectural_patterns.md - dual-token, request queue, enrichment cache, query format, CSP, background proxy, stack detection
- Final_Version/API_ACTIONS_DOCUMENTATION.md - all SFMC endpoints, payloads, response shapes
- Final_Version/SFMC_UI_Query_Scheme.md - OR-tree query builder format for Content Builder search
- Final_Version/ENRICHMENT_API_GUIDE.md - site details enrichment endpoints and response parsing
- cursor/CURSOR_V6_CHANGELOG.md - what was fixed in v6 and why (critical context for v8)
- Final_Version/PROJECT_DOCUMENTATION.md - full history, UI decisions, version rationale
