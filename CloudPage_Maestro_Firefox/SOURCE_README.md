# CloudPage Maestro — Source Code Notes for AMO Review

## Build steps

**None.** CloudPage Maestro has no build process. The files in this archive ARE the source code AND the runtime package. Nothing is transpiled, bundled, or generated.

To install for testing:
1. Unzip this archive into a folder
2. In Firefox, go to `about:debugging` -> "This Firefox" -> "Load Temporary Add-on"
3. Select `manifest.json` from the unzipped folder

## File-by-file inventory

| File | Description | Hand-written? |
|---|---|---|
| `manifest.json` | MV3 manifest with Firefox `browser_specific_settings.gecko` block | Yes |
| `background.js` | Service worker. Captures CSRF tokens via `chrome.webRequest`, proxies SFMC API calls | Yes, unminified |
| `content.js` | Content script. Injects the management panel into SFMC tabs and handles UI | Yes, unminified |
| `lib/jszip.min.js` | Third-party library (see below) | No - vendored |
| `icons/*.png` | Logo and toolbar icons | N/A (assets) |

## Third-party library: JSZip 3.10.1

The only minified file in this package is `lib/jszip.min.js`. It is the **unmodified upstream release** of JSZip 3.10.1.

- Upstream source: https://github.com/Stuk/jszip
- Exact release: https://github.com/Stuk/jszip/releases/tag/v3.10.1
- License: MIT or GPLv3 (dual-licensed)
- Used for: packaging multiple CloudPage HTML files into a single downloadable ZIP when the user clicks "Download All"

To verify the bundled file matches upstream:
1. Download `dist/jszip.min.js` from https://github.com/Stuk/jszip/tree/v3.10.1/dist
2. Compare with the `lib/jszip.min.js` in this archive — they will be byte-identical

The `new Function(...)` AMO validator warning originates from JSZip's internal deflate/inflate routines and is present in the upstream release.

## innerHTML usage

The extension's UI is built into a panel injected into SFMC tabs. All `innerHTML` assignments fall into these categories:

- Static template strings authored by me (panel skeleton, modals, toasts)
- Data fetched from SFMC's own internal `/cloud/fuelapi/` proxy using the user's existing session cookies — this data originates from the user's own SFMC org, not third-party or user-uploaded content
- Display values like asset names and folder paths, which are SFMC platform metadata

No content from third-party origins or user-supplied input is ever passed to `innerHTML`.

## Repository

Full repository, including documentation, screenshots, and Chrome build variant:
https://github.com/MetalHacker01/CloudPage_Maestro

The Firefox build corresponds exactly to the `CloudPage_Maestro_Firefox/` subdirectory at commit `7f75311` (or the latest commit on `master`).
