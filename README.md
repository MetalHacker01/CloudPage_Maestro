# CloudPage Maestro v6.0

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
  <a href="#documentation">Documentation</a> •
  <a href="#versions">Versions</a>
</p>

---

## 📋 Overview

CloudPage Maestro is a powerful tool for managing Salesforce Marketing Cloud CloudPages with enhanced UI, real-time asset enrichment, batch operations, and complete download capabilities.

### Available Versions

- **Chrome Extension (v6)** – Recommended: batch operations, search, folder move, token badges, pagination, export
- **Tampermonkey Script** – Universal userscript for all browsers

---

## ✨ Features

### Core Features (Both Versions)
- **Dual-Token System** – Automatic authentication token capture and management
- **Asset Management** – View, search, and manage CloudPages and Code Resources
- **Download System** – Download HTML from landing pages and content from code resources
- **Real-time Enrichment** – Fetch asset details, status, and site information on-demand
- **Unpublish Operations** – Safely unpublish landing pages with confirmation
- **Smart Caching** – Local caching with configurable TTL (e.g. 5 minutes)
- **SLDS-Aligned UI** – Clean, modern, Salesforce Lightning–style design

### Chrome Extension (v6) Features
- **Batch Operations** – Select multiple assets for bulk publish/unpublish/move
- **Folder Management** – Visual folder tree picker with search
- **Enhanced Search** – Content Builder query API with pagination
- **Token Badges** – Live “Search Ready” / “Publish Ready” status
- **Pagination** – Load one page at a time for fast startup
- **Export** – Export current page to CSV (enriched status/URL)
- **CORS Bypass** – Background script architecture for API calls

---

## 📦 Installation

### Chrome Extension (v6)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked**
5. Select the `Chrome_Extension/` folder
6. Navigate to SFMC (exacttarget.com or marketingcloudapps.com) – extension auto-activates

### Tampermonkey Script

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Open the Tampermonkey dashboard and create a new script
3. Paste the contents of `tampermonkey_cloudpages_optimized_v5.user.js`
4. Save and go to SFMC CloudPages – script auto-activates

---

## 📖 Documentation

**[DOCUMENTATION_V6.html](DOCUMENTATION_V6.html)** – Download and open in a browser for full v6 documentation.

Includes:
- Installation guides for Chrome Extension and Tampermonkey
- API endpoint references
- Feature walkthroughs and code examples
- Troubleshooting and debug mode
- Technical specifications

**Changelog:** [cursor/CURSOR_V6_CHANGELOG.md](cursor/CURSOR_V6_CHANGELOG.md) – What’s new in v6.

---

## 🗂️ Repository Structure

```
Unpublish_LP_Script/
├── Chrome_Extension/           # Chrome extension v6
│   ├── background.js          # Service worker (token capture, API proxy)
│   ├── content_v6.js          # Main content script (UI, search, batch actions)
│   ├── manifest.json          # Extension config (v6.0.0)
│   ├── README.md              # Extension setup
│   └── icons/                 # Extension icons
│
├── cursor/                     # v6 development notes
│   ├── Chrome_Extension_v6/    # Mirror of Chrome_Extension (v6 source)
│   ├── CURSOR_V6_CHANGELOG.md # Changelog
│   └── CURSOR_V6_README.md     # v6 overview
│
├── DOCUMENTATION_V6.html       # Full documentation (open in browser)
├── DOCUMENTATION_NEW.html     # Legacy doc
├── tampermonkey_cloudpages_optimized_v5.user.js  # Tampermonkey script
├── CP_Maestro_Logo.png        # Logo
├── README.md                  # This file
└── LICENSE
```

---

## 🚀 Quick Start

### Chrome Extension
```bash
# 1. Clone repo
git clone https://github.com/MetalHacker01/CloudPage_Maestro.git
cd CloudPage_Maestro   # or your repo name

# 2. Load Chrome_Extension/ in chrome://extensions/ (Developer mode → Load unpacked)
# 3. Open SFMC CloudPages
```

### Tampermonkey
```bash
# 1. Install Tampermonkey, create new script, paste tampermonkey_cloudpages_optimized_v5.user.js
# 2. Save and open SFMC CloudPages
```

---

## 🔧 Technical Details

### Chrome Extension (v6)
- **Version**: 6.0.0
- **Manifest**: 3
- **Content script**: content_v6.js (~4,200+ lines)
- **Permissions**: storage, webRequest; host permissions for SFMC domains

### Tampermonkey
- **Version**: 5.0
- **APIs**: GM_xmlhttpRequest, GM_addStyle

---

## ⚠️ Limitations

- Requires an active SFMC session (tokens expire with session)
- SFMC API rate limits apply
- Works within the current Business Unit only
- Unofficial community tool – not supported by Salesforce

---

## 📄 License

See [LICENSE](LICENSE). Unofficial tool, use at your own risk.

---

## 👤 Credits

**Developer**: Aldorino Rrushi (MetalHacker01)  
**Version**: 6.0  
**Last Updated**: January 2026

---

<p align="center">Made with ❤️ for the SFMC Community</p>
