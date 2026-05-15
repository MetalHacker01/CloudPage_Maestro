# CloudPage Maestro

<p align="center">
  <img src="CP_Maestro_Logo.png" alt="CloudPage Maestro" width="180">
</p>

<p align="center">
  <strong>A browser extension for batch-managing Salesforce Marketing Cloud CloudPages.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#installation">Installation</a> ·
  <a href="DOCUMENTATION.html">Documentation</a> ·
  <a href="#under-the-hood">Under the Hood</a>
</p>

---

## Overview

CloudPage Maestro is a Chrome / Firefox extension that brings batch operations to Salesforce Marketing Cloud's CloudPages — publish, unpublish, move, search, sort, enrich, download, and export landing pages and code resources without leaving SFMC.

It runs entirely in the browser. No backend, no OAuth dance, no server-side credentials. It rides the user's existing SFMC session and the platform's internal `/cloud/fuelapi/` proxy.

## Features

### Core
- **Bulk publish / unpublish / move** for landing pages and code resources
- **Search** across name, content, description, folder
- **Filter** by asset type (Landing Pages, JSON, JavaScript, CSS)
- **Sort** by clicking any column header
- **Folder picker** for batch moves with the full SFMC category tree
- **Resizable panel** — drag the left edge, width persists across sessions
- **Dark / Light mode** with a theme toggle in the header
- **Keyboard shortcuts** — `Esc` to close, `Ctrl+Shift+F` to focus search, `Ctrl+A` to select all

### Speed
- **Cookie-only auth** for reads — no CSRF token gymnastics, no ghost-tab capture, no 15-second wait on panel open
- **Bulk V2 endpoint** populates status + URL for every landing page in one call
- **Concurrent enrichment** for items the V2 endpoint doesn't cover (batches of 10)
- **Concurrent batch operations** (5 in-flight for writes)
- **Smart caching** with TTL on enrichment results

### Export & Download
- **Export All to CSV** — every asset across every page, fully enriched, ready for Excel
- **Download All** dropdown — two modes:
  - **All files + folder tree** — every landing page HTML, every code resource (JS/CSS/JSON), packaged in a ZIP with the full SFMC category structure preserved
  - **HTML only (flat)** — just the landing page HTML files in a single folder
- **Single-asset download** — click the download icon on any row

### Quality of life
- **Real-time token status** — badges actively probe the server and show "OK / Stale / Missing", click to re-probe
- **Auto-recovery on 401** — when a publish token expires mid-action, the extension recaptures it and retries silently
- **URL preview** — hover any published landing page URL to see a live iframe preview
- **Progress toast** for batch operations with theme-aware visuals
- **Progressive row reveal** — table cells fade in row-by-row so the page feels alive

## Installation

### Chrome (recommended)

1. Clone or download this repository
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the [`CloudPage_Maestro_Chrome/`](CloudPage_Maestro_Chrome/) folder
6. Navigate to your SFMC instance (`*.exacttarget.com` or `*.marketingcloudapps.com`) — the extension auto-activates

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select [`CloudPage_Maestro_Firefox/manifest.json`](CloudPage_Maestro_Firefox/manifest.json)
4. Navigate to SFMC — the extension auto-activates

### Tampermonkey (legacy, kept for portability)

A Tampermonkey userscript variant lives at [`tampermonkey_cloudpages_maestro.user.js`](tampermonkey_cloudpages_maestro.user.js). It predates the cookie-only auth migration and is slightly behind on features. Use the Chrome or Firefox extension as the primary install path. The userscript is useful on machines where extension installation is restricted.

## Repository Structure

```
CloudPages_Maestro/
├── CloudPage_Maestro_Chrome/        # Chrome extension (production)
│   ├── manifest.json                # MV3, v1.0.0
│   ├── background.js                # Token capture + API proxy (CORS bypass)
│   ├── content.js                   # UI, state, all interactions (~6,400 lines)
│   ├── lib/
│   │   └── jszip.min.js             # ZIP archive builder (Download All)
│   └── icons/
│
├── CloudPage_Maestro_Firefox/       # Firefox extension (gecko manifest)
│
├── tampermonkey_cloudpages_maestro.user.js  # Legacy userscript variant
│
├── DOCUMENTATION.html               # Full documentation (open in browser)
├── DESIGN_SYSTEM.md                 # Documentation styling spec
├── README.md
├── LICENSE
├── CP_Maestro_Logo.png
└── archive/                         # Earlier iterations preserved for history
```

## Under the Hood

### Auth model — cookie-only `/cloud/fuelapi/` proxy

The extension does not capture or rotate CSRF tokens for read operations. Instead it routes every read through `https://mc.{stack}.exacttarget.com/cloud/fuelapi/...`, an internal SFMC proxy that accepts the user's session cookies. The migration from the older "ghost tab" CSRF pattern eliminated a 15-second startup wait and removed entire categories of failure (stale tokens, blocked redirects, popup flashes).

Writes (publish / unpublish / move) still use a captured CSRF token. If the token is stale, the extension auto-recaptures it via a hidden iframe and retries the write once. Users see a brief "Token expired — refreshing" toast and the operation succeeds.

### Architecture
- **manifest** — MV3 with `storage` + `webRequest` permissions; host permissions for `*.exacttarget.com`, `*.marketingcloudapps.com`, `*.sfmc-content.com`
- **background.js** — service worker. Listens for `x-csrf-token` headers on outbound SFMC requests and stores them in `chrome.storage.local`. Acts as a fetch proxy for the content script (with `credentials: 'include'` so cookies flow on cross-origin reads).
- **content.js** — single ~6,400-line content script. Injects a fixed-position panel into the SFMC page, owns all UI, state (via `window.CPM_STATE`), API calls, and rendering.

### Performance characteristics
- Initial panel load: under 2 seconds on a 700-asset dev account
- Refresh after publish: under 5 seconds (was 60+ seconds before the cookie-only migration)
- Concurrent reads capped at 10 in-flight; writes at 5
- Enrichment results cached for 5 minutes; the V2 bulk-endpoint response front-loads status / URL / siteId so per-item enrichment is rare

## Limitations

- Requires an active SFMC session — the extension piggybacks on browser cookies
- Subject to SFMC API rate limits (rare in practice; ~10 concurrent reads is comfortable)
- Works within the current Business Unit only — switch BUs in SFMC and refresh the panel
- Unofficial community tool — not affiliated with or supported by Salesforce

## License

See [LICENSE](LICENSE). Use at your own risk.

## Credits

**Author:** Aldorino Rrushi ([@MetalHacker01](https://github.com/MetalHacker01)) · [Portfolio](https://martech-maestro-folio-sroh.vercel.app/)

**Version:** 1.0.0 · **Updated:** May 2026

---

<p align="center">For the SFMC community.</p>
