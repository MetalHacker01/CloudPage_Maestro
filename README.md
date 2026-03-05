# CloudPage Maestro

<p align="center">
  <img src="CP_Maestro_Logo.png" alt="CloudPage Maestro Logo" width="200">
</p>

<h1 align="center">CloudPage Maestro</h1>

<p align="center">
  <strong>Advanced Salesforce Marketing Cloud (SFMC) CloudPages Management Tool</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#documentation">Documentation</a>
</p>

---

## Overview

CloudPage Maestro is a Chrome Extension for managing Salesforce Marketing Cloud CloudPages — batch publish/unpublish, search, filter, sort, enrich, and export assets directly from the SFMC interface.

### Available Versions

- **Chrome Extension** – Recommended: auto token capture, batch operations, resizable panel, enriched export, sortable columns
- **Tampermonkey Script** – Universal userscript for all browsers

---

## Features

### Core Features
- **Dual-Token System** – Automatic authentication token capture; background iframe auto-capture on load
- **Asset Management** – View, search, filter, and manage CloudPages and Code Resources
- **Download System** – Download HTML from landing pages and content from code resources
- **Real-time Enrichment** – Fetch asset details, status, and site info on-demand
- **Publish / Unpublish** – Safely publish or unpublish landing pages with batch support
- **Smart Caching** – Local caching with configurable TTL (5 minutes)
- **SLDS-Aligned UI** – Clean, modern, Salesforce Lightning–style design

### Chrome Extension Features
- **Auto Token Capture** – Hidden iframes automatically capture both tokens on page load
- **Batch Operations** – Select multiple assets for bulk publish/unpublish/move
- **Folder Management** – Visual folder tree picker with search
- **Enhanced Search** – Content Builder query API with pagination
- **Token Badges** – Live "Search Ready" / "Publish Ready" status indicators
- **Pagination** – 100 items per page with total count display
- **Enriched Export** – Export to CSV or JSON with status, URL, modified date, folder path, customerKey
- **Batch Progress Bar** – Real-time progress indicator during bulk operations
- **Sortable Columns** – Click any column header to sort ascending/descending
- **Resizable Panel** – Drag the left edge to adjust panel width (persisted in storage)
- **Keyboard Shortcuts** – `Escape` closes panel; `Ctrl+Shift+F` focuses search; `Ctrl+A` selects all
- **About** – Author info with LinkedIn, Portfolio, and GitHub links
- **CORS Bypass** – Background service worker architecture for API calls

---

## Installation

### Chrome Extension

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked**
5. Select the `Chrome_Extension_CPM/` folder
6. Navigate to SFMC (exacttarget.com or marketingcloudapps.com) — extension auto-activates

### Tampermonkey Script

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Open the Tampermonkey dashboard and create a new script
3. Paste the contents of `tampermonkey_cloudpages_optimized_v5.user.js`
4. Save and go to SFMC CloudPages — script auto-activates

---

## Documentation

**[DOCUMENTATION.html](DOCUMENTATION.html)** – Open in a browser for full documentation.

Includes:
- Installation guides for Chrome Extension and Tampermonkey
- API endpoint references
- Feature walkthroughs and code examples
- Troubleshooting and debug mode
- Technical specifications

---

## Repository Structure

```
Unpublish_LP_Script/
├── Chrome_Extension_CPM/       # Chrome Extension (production)
│   ├── background.js           # Service worker (token capture, API proxy)
│   ├── content.js              # Main content script (UI, search, batch actions)
│   ├── manifest.json           # Extension config (v1.0.0)
│   └── icons/                  # Extension icons
│
├── DOCUMENTATION.html          # Full documentation (open in browser)
├── tampermonkey_cloudpages_optimized_v5.user.js  # Tampermonkey script
├── CP_Maestro_Logo.png         # Logo
├── README.md                   # This file
└── LICENSE
```

---

## Quick Start

```bash
# 1. Clone repo
git clone https://github.com/MetalHacker01/CloudPage_Maestro.git

# 2. Load Chrome_Extension_CPM/ in chrome://extensions/ (Developer mode → Load unpacked)
# 3. Open SFMC CloudPages
```

---

## Technical Details

### Chrome Extension
- **Version**: 1.0.0
- **Manifest**: 3
- **Content script**: content.js (~4,580 lines)
- **Permissions**: storage, webRequest; host permissions for SFMC domains

### Tampermonkey
- **Version**: 5.0
- **APIs**: GM_xmlhttpRequest, GM_addStyle

---

## Limitations

- Requires an active SFMC session (tokens expire with session)
- SFMC API rate limits apply
- Works within the current Business Unit only
- Unofficial community tool — not supported by Salesforce

---

## License

See [LICENSE](LICENSE). Unofficial tool, use at your own risk.

---

## Credits

**Developer**: Aldorino Rrushi ([MetalHacker01](https://github.com/MetalHacker01))
**Portfolio**: [martech-maestro-folio-sroh.vercel.app](https://martech-maestro-folio-sroh.vercel.app/)
**Version**: 1.0.0
**Last Updated**: March 2026

---

<p align="center">Made with love for the SFMC Community</p>
