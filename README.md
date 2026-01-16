# CloudPage Maestro v5.0

<p align="center">
  <img src="https://i.postimg.cc/TYgXhFJJ/output-onlinepngtools-(4).png" alt="CloudPage Maestro" width="300">
</p>

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

- **Tampermonkey Script** - Universal userscript for all browsers
- **Chrome Extension** - Enhanced version with batch operations and folder management

---

## ✨ Features

### Core Features (Both Versions)
- **Dual-Token System** - Automatic authentication token capture and management
- **Asset Management** - View, search, and manage CloudPages and Code Resources
- **Download System** - Download HTML from landing pages and content from code resources
- **Real-time Enrichment** - Fetch asset details, status, and site information on-demand
- **Unpublish Operations** - Safely unpublish landing pages with confirmation
- **Smart Caching** - Local caching with time-based expiration (15 minutes)
- **Advanced UI** - Icons, tooltips, and bouncing download animations

### Chrome Extension Exclusive Features
- **Batch Operations** - Select multiple assets for bulk publish/unpublish/move
- **Folder Management** - Visual folder tree picker with search (fetches ALL folders via pagination)
- **Enhanced Search** - Filter folders across entire SFMC instance
- **Debug Mode** - Production-ready logging with `DEBUG_MODE` flag
- **CORS Bypass** - Background script architecture for API calls

---

## 📦 Installation

### Tampermonkey Script

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Open Tampermonkey dashboard
3. Click "Create a new script"
4. Copy contents from [`Final_Version/tampermonkey_cloudpages_optimized_v5.user.js`](Final_Version/tampermonkey_cloudpages_optimized_v5.user.js)
5. Save the script (Ctrl+S)
6. Navigate to SFMC CloudPages - script auto-activates

### Chrome Extension

> **⚠️ Developer Mode Required** - Chrome Web Store release coming soon

1. Download the [`Chrome_Extension/`](Chrome_Extension/) folder
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `Chrome_Extension/` folder
6. Navigate to SFMC CloudPages - extension auto-activates

---

## 📖 Documentation

Comprehensive documentation available with interactive version toggle:

**[View Documentation](Final_Version/DOCUMENTATION_NEW.html)** (Download and open in browser)

The documentation includes:
- Installation guides for both versions
- API endpoint references
- Feature walkthroughs with code examples
- Troubleshooting guides
- Debug mode instructions
- Technical specifications

---

## 🗂️ Repository Structure

```
CloudPage_Maestro/
├── Chrome_Extension/          # Chrome extension files
│   ├── background.js         # Service worker for CORS bypass
│   ├── content_full.js       # Main content script (4077 lines)
│   ├── manifest.json         # Extension configuration
│   └── icons/                # Extension icons
│
├── Final_Version/             # Production-ready files
│   ├── tampermonkey_cloudpages_optimized_v5.user.js  # Tampermonkey script
│   └── DOCUMENTATION_NEW.html                         # Interactive documentation
│
└── README.md                  # This file
```

---

## 🚀 Quick Start

### Tampermonkey
```bash
# 1. Install Tampermonkey extension
# 2. Create new script and paste contents from:
Final_Version/tampermonkey_cloudpages_optimized_v5.user.js
```

### Chrome Extension
```bash
# 1. Clone this repository
git clone https://github.com/MetalHacker01/CloudPage_Maestro.git

# 2. Load Chrome_Extension/ folder in chrome://extensions/
# 3. Enable Developer Mode and click "Load unpacked"
```

---

## 🔧 Technical Details

### Tampermonkey Script
- **Version**: 5.0
- **Lines of Code**: ~4,020
- **Dependencies**: None (vanilla JavaScript)
- **APIs Used**: GM_xmlhttpRequest, GM_addStyle

### Chrome Extension
- **Manifest Version**: 3
- **Lines of Code**: 4,077 (content_full.js)
- **Permissions**: Host permissions for SFMC domains
- **Architecture**: Content script + Background service worker

---

## 🛠️ Development

### Debug Mode (Chrome Extension Only)

Enable detailed logging for troubleshooting:

1. Open `Chrome_Extension/content_full.js`
2. Change line ~10: `const DEBUG_MODE = false;` → `true`
3. Reload extension
4. Check browser console for detailed logs

---

## ⚠️ Limitations

- Requires active SFMC session (tokens expire with session)
- SFMC API rate limits apply
- Works within current Business Unit only
- Not an official Salesforce tool - use at your own risk

---

## 📄 License

This is an unofficial community tool, not supported by Salesforce.

---

## 👤 Credits

**Developer**: MetalHacker01  
**Version**: 5.0  
**Last Updated**: January 2026

---

## 🐛 Issues & Support

For bug reports or feature requests, please open an issue on GitHub.

---

<p align="center">Made with ❤️ for the SFMC Community</p>
