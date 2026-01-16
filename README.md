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

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/target.svg" width="20" height="20" alt="target"> Overview

CloudPage Maestro is a powerful tool for managing Salesforce Marketing Cloud CloudPages with enhanced UI, real-time asset enrichment, batch operations, and complete download capabilities.

### Available Versions

- **<img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/settings.svg" width="16" height="16" alt="settings"> Tampermonkey Script** - Universal userscript for all browsers
- **<img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/rocket.svg" width="16" height="16" alt="rocket"> Chrome Extension** - Enhanced version with batch operations and folder management

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/star.svg" width="20" height="20" alt="star"> Features

### Core Features (Both Versions)
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/check-circle.svg" width="16" height="16" alt="check"> **Dual-Token System** - Automatic authentication token capture and management
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/check-circle.svg" width="16" height="16" alt="check"> **Asset Management** - View, search, and manage CloudPages and Code Resources
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/check-circle.svg" width="16" height="16" alt="check"> **Download System** - Download HTML from landing pages and content from code resources
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/check-circle.svg" width="16" height="16" alt="check"> **Real-time Enrichment** - Fetch asset details, status, and site information on-demand
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/check-circle.svg" width="16" height="16" alt="check"> **Unpublish Operations** - Safely unpublish landing pages with confirmation
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/check-circle.svg" width="16" height="16" alt="check"> **Smart Caching** - Local caching with time-based expiration (15 minutes)
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/check-circle.svg" width="16" height="16" alt="check"> **Advanced UI** - Icons, tooltips, and bouncing download animations

### Chrome Extension Exclusive Features
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/flash.svg" width="16" height="16" alt="flash"> **Batch Operations** - Select multiple assets for bulk publish/unpublish/move
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/folder.svg" width="16" height="16" alt="folder"> **Folder Management** - Visual folder tree picker with search (fetches ALL folders via pagination)
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/search.svg" width="16" height="16" alt="search"> **Enhanced Search** - Filter folders across entire SFMC instance
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/code.svg" width="16" height="16" alt="code"> **Debug Mode** - Production-ready logging with `DEBUG_MODE` flag
- <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/refresh-double.svg" width="16" height="16" alt="refresh"> **CORS Bypass** - Background script architecture for API calls

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/download-circle.svg" width="20" height="20" alt="download"> Installation

### Tampermonkey Script

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Open Tampermonkey dashboard
3. Click "Create a new script"
4. Copy contents from [`Final_Version/tampermonkey_cloudpages_optimized_v5.user.js`](Final_Version/tampermonkey_cloudpages_optimized_v5.user.js)
5. Save the script (Ctrl+S)
6. Navigate to SFMC CloudPages - script auto-activates

### Chrome Extension

> **<img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/warning-triangle.svg" width="16" height="16" alt="warning"> Developer Mode Required** - Chrome Web Store release coming soon

1. Download the [`Chrome_Extension/`](Chrome_Extension/) folder
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `Chrome_Extension/` folder
6. Navigate to SFMC CloudPages - extension auto-activates

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/book.svg" width="20" height="20" alt="book"> Documentation

Comprehensive documentation available with interactive version toggle:

<img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/arrow-right.svg" width="16" height="16" alt="arrow"> **[View Documentation](Final_Version/DOCUMENTATION_NEW.html)** (Download and open in browser)

The documentation includes:
- Installation guides for both versions
- API endpoint references
- Feature walkthroughs with code examples
- Troubleshooting guides
- Debug mode instructions
- Technical specifications

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/solid/folder.svg" width="20" height="20" alt="folder"> Repository Structure

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

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/rocket.svg" width="20" height="20" alt="rocket"> Quick Start

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

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/settings.svg" width="20" height="20" alt="settings"> Technical Details

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

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/tools.svg" width="20" height="20" alt="tools"> Development

### Debug Mode (Chrome Extension Only)

Enable detailed logging for troubleshooting:

1. Open `Chrome_Extension/content_full.js`
2. Change line ~10: `const DEBUG_MODE = false;` → `true`
3. Reload extension
4. Check browser console for detailed logs

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/warning-triangle.svg" width="20" height="20" alt="warning"> Limitations

- Requires active SFMC session (tokens expire with session)
- SFMC API rate limits apply
- Works within current Business Unit only
- Not an official Salesforce tool - use at your own risk

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/page.svg" width="20" height="20" alt="page"> License

This is an unofficial community tool, not supported by Salesforce.

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/user.svg" width="20" height="20" alt="user"> Credits

**Developer**: MetalHacker01  
**Version**: 5.0  
**Last Updated**: January 2026

---

## <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/regular/bug.svg" width="20" height="20" alt="bug"> Issues & Support

For bug reports or feature requests, please open an issue on GitHub.

---

<p align="center">Made with <img src="https://cdn.jsdelivr.net/gh/iconoir-icons/iconoir@main/icons/solid/heart.svg" width="16" height="16" alt="heart"> for the SFMC Community</p>
