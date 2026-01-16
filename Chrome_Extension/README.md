# CloudPage Maestro - Chrome Extension

## Quick Start - Testing Locally

### 1. Load Unpacked Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the `Chrome_Extension` folder
6. Extension will be loaded instantly! ✅

### 2. Test in SFMC

1. Navigate to your SFMC instance: `https://mc.*.exacttarget.com/`
2. Go to CloudPages section
3. Open Developer Tools (F12) → Console tab
4. You should see logs: `[CloudPage Maestro] Content script loaded`
5. Look for success notification: "CloudPage Maestro - Extension loaded successfully"

### 3. Debugging

- **Service Worker Console**: chrome://extensions → Click "service worker" link under extension
- **Content Script Console**: F12 on SFMC page → Console tab
- **Storage Inspector**: F12 → Application tab → Storage → Local Storage
- **Reload Extension**: Click reload icon (🔄) on chrome://extensions

### 4. Check Token Capture

Open service worker console and look for:
```
[CloudPage Maestro] Captured pageHook token from request headers
[CloudPage Maestro] Captured appcore token from DOM
```

## Current Status

This is a **minimal working version** that:
- ✅ Loads as Chrome extension (Manifest V3)
- ✅ Captures tokens from DOM and network requests
- ✅ Shows notifications on SFMC pages
- ✅ Uses service worker for background processing
- ⏳ Full UI implementation (next step)

## File Structure

```
Chrome_Extension/
├── manifest.json       # MV3 configuration
├── background.js       # Service worker (token capture)
├── content.js          # Content script (UI injection)
├── icons/              # Extension icons (SVG placeholders)
│   ├── icon-16.svg
│   ├── icon-48.svg
│   └── icon-128.svg
└── README.md          # This file
```

## What Works Now

1. **Token Capture**: Both pageHook and appcore tokens
2. **Network Interception**: `chrome.webRequest` captures headers
3. **DOM Parsing**: Extracts tokens from `APPCORE_BROWSER_CONFIG`
4. **Storage**: Persists tokens in `chrome.storage.local`
5. **Messaging**: Content script ↔ Service worker communication
6. **Notifications**: Visual feedback on SFMC pages

## Next Steps

To get full CloudPage Maestro functionality:

1. **Port Full UI** - Convert Tampermonkey UI code (4000+ lines)
2. **Add Icons** - Convert SVG to PNG (128x128, 48x48, 16x16)
3. **Test Thoroughly** - Verify all token capture scenarios
4. **Add Settings Page** - Chrome extension options page

## Advantages Over Tampermonkey

- ✅ **No Dependencies** - Pure Chrome extension
- ✅ **Better Security** - Sandboxed execution
- ✅ **Auto-Updates** - When published to Chrome Web Store
- ✅ **Native Integration** - Uses Chrome APIs directly
- ✅ **Better Performance** - Service worker instead of background page

## Known Limitations

- Icons are SVG (Chrome accepts them but PNG preferred)
- Full UI not yet ported (showing notifications only)
- Requires "Developer mode" until published to Web Store

## Testing Checklist

- [ ] Extension loads without errors
- [ ] Service worker starts successfully
- [ ] Content script runs on SFMC pages
- [ ] PageHook token captured
- [ ] Appcore token captured
- [ ] Tokens persist in storage
- [ ] Notifications appear
- [ ] Console logs show proper flow

---

**Author**: Aldorino Rrushi  
**Version**: 5.0.0  
**Manifest**: V3  
**License**: MIT
