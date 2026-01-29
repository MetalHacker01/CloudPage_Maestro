# CloudPage Maestro v6 – Chrome Extension

Chrome extension for Salesforce Marketing Cloud CloudPages management (batch publish/unpublish, search, folder move, export).

## Setup

1. **Icons**: Ensure `Chrome_Extension/icons/` contains:
   - `icon-16.png`, `icon-48.png`, `icon-128.png`
   - Optional: `CP_Maestro_Logo.png`, `CP_Maestro_Logo_Colored.png`

2. Open Chrome → `chrome://extensions/` → Enable **Developer mode** → **Load unpacked** → select the `Chrome_Extension` folder.

3. Navigate to SFMC (exacttarget.com or marketingcloudapps.com) → extension auto-activates.

## Files

- **manifest.json** – v6.0.0; content script `content_v6.js`, background `background.js`.
- **background.js** – Token capture + API proxy; robust handling of non-JSON success responses.
- **content_v6.js** – Main UI: search, filters, batch actions, token badges, pagination, export.

## Documentation

- **Root**: [DOCUMENTATION_V6.html](../DOCUMENTATION_V6.html) – Full documentation (open in browser).
- **cursor/CURSOR_V6_CHANGELOG.md** – Changelog and technical details.
