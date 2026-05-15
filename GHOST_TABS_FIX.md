# How We Killed the Ghost Tabs

A migration playbook from the SFMC Scout extension, written so this approach can be applied to **CloudPage Maestro** (or any SFMC browser extension that uses the `marketingcloudapps.com` app-domain endpoints with CSRF tokens).

If you've ever loaded a Chrome extension that helps with SFMC and noticed it briefly opens 3–5 minimised popup tabs cycling through Content Builder / Automation / Journey / CloudPages, that's the "ghost tab" pattern. It feels like a virus, it's slow, and it doesn't actually need to exist. This doc explains why we built it that way, what the alternative is, and how to migrate.

---

## TL;DR

| | Old (ghost-tab) | New (cookie-only) |
|---|---|---|
| **Auth** | `x-csrf-token` header per module (CB / Auto / Journey / Admin) | Session cookies only |
| **Token source** | Browser navigation → `onBeforeSendHeaders` capture | None needed |
| **Domain** | `https://mc.{stack}.marketingcloudapps.com/{module}/fuelapi/...` | `https://mc.{stack}.exacttarget.com/cloud/fuelapi/...` |
| **Setup UX** | Open minimised popup window → spawn 4 tabs → poll storage for 30s | Nothing — the moment the user is logged into SFMC anywhere in the browser, every API call just works |
| **First-call latency** | 5–30 s waiting for tokens to land | ~150 ms (single HTTP round trip) |
| **Module rotation** | Tokens go stale per-module; have to re-spawn ghost tabs | Session cookies refresh automatically with the user's browser session |
| **DevTools surface** | Loud — flashing tabs, console spam, network noise | Silent |

The whole pattern was a workaround for `x-csrf-token` and never needed to exist for **read** APIs. For **write** APIs (POST/PATCH/DELETE) some endpoints still require CSRF, but you only need to capture it passively from existing user navigation — no ghost tabs.

---

## Why the ghost-tab pattern existed in the first place

SFMC has multiple flavours of REST API:

1. **`mc.{stack}.marketingcloudapps.com/contactsmeta/fuelapi/...`**
   The Contact Builder / contactsmeta module's API.
   Required: `x-csrf-token` header. Tokens rotate per module.

2. **`mc.{stack}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/...`**
   The Automation Studio module's API.
   Required: `x-csrf-token` header. **Different token from contactsmeta** — they rotate independently.

3. **`content-builder.{stack}.marketingcloudapps.com/fuelapi/asset/v1/...`**
   The Content Builder asset API.
   Required: `x-csrf-token` header. **Yet another distinct token.**

4. **`mc.{stack}.exacttarget.com/cloud/fuelapi/...`** ← the well-kept secret
   A **session-cookie proxy** on the main `mc.{stack}.exacttarget.com` shell.
   Required: nothing other than the session cookies the user already has from being logged into SFMC.

Every browser extension that integrates with SFMC starts in category 1–3 because that's what the official docs and DevTools-network-tab tutorials show you. The docs do not mention category 4 — it's an undocumented internal proxy that SFMC's own SPA uses for cross-module requests.

When you're stuck in categories 1–3, you need a fresh CSRF token per module. The only way to capture those tokens is to make SFMC perform a request that includes them — which means you need a tab pointed at each module. Hence: ghost tabs.

When you switch to category 4, the entire token-capture subsystem becomes unnecessary.

---

## How we discovered the cookie-only proxy

Honestly: we didn't. Cameron England's [SFMC Companion extension](https://github.com/cameronengland/SFMC-Companion-Extension) (~2019) used this approach. A later extension on disk called "SFMC Inspector" — built on the Companion's approach — had this comment in its service worker:

```js
// SFMC exposes a /cloud/fuelapi/ proxy on the main domain
// (mc.s51.exacttarget.com) that accepts REST API calls using the browser's
// existing session cookies. No OAuth, no token exchange needed.
// Discovered via reverse engineering of SFMC Companion.
```

That single comment is several years of reverse engineering compressed. Without seeing it, neither I nor an LLM would have stumbled on this — every public StackExchange / Salesforce community answer sends you down the CSRF-token rabbit hole.

---

## The migration, in five passes

### Pass 1: Identify every API call

Grep your codebase for the three patterns:

```bash
grep -rn "marketingcloudapps.com/contactsmeta/fuelapi" .
grep -rn "marketingcloudapps.com/AutomationStudioFuel3/fuelapi" .
grep -rn "content-builder\.\$\{[^}]*\}\.marketingcloudapps.com/fuelapi" .
```

Categorise each hit:
- **Read** (GET requests, or POST queries like the asset-search `query?scope=ours`)
- **Write** (POST that creates resources, PATCH, DELETE)

The asset-search POST is a special case — it sends a body but it's semantically a read. It works on the cookie-only proxy. PATCH/POST that *creates* resources sometimes does not.

### Pass 2: Migrate read calls

For every read call, do two things:

**a) Swap the host:**

```diff
- const url = `https://${instance}.marketingcloudapps.com/contactsmeta/fuelapi/legacy/v1/beta/folder/${id}`;
+ const url = `https://${instance}.exacttarget.com/cloud/fuelapi/legacy/v1/beta/folder/${id}`;
```

```diff
- const base = `https://${instance}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi`;
+ const base = `https://${instance}.exacttarget.com/cloud/fuelapi`;
```

```diff
- const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query?scope=ours`;
+ const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/query?scope=ours`;
```

**b) Drop the CSRF header:**

```diff
  const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
-         'x-csrf-token': token,
          'content-type': 'application/json;datekind=local',
          'x-requested-with': 'XMLHttpRequest',
          'accept': 'application/json'
      },
      body: JSON.stringify(body)
  });
```

Keep `credentials: 'include'`. The whole pattern depends on it — that's what makes session cookies flow.

### Pass 3: Migrate write calls (carefully)

POST-creates and PATCH calls sometimes work on the cookie-only proxy, sometimes don't. The safe pattern is try-cookie-first-then-fallback:

```js
async function createResource(payload, instance) {
    const stack = instance.replace(/^mc\./, '');
    const primaryUrl  = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v1/...`;
    const fallbackUrl = `https://${instance}.marketingcloudapps.com/contactsmeta/fuelapi/internal/v1/...`;

    const post = async (url, withCsrf) => {
        const headers = { 'Content-Type': 'application/json' };
        if (withCsrf && csrfToken) headers['x-csrf-token'] = csrfToken;
        return fetch(url, { method: 'POST', headers, credentials: 'include', body: JSON.stringify(payload) });
    };

    // Try cookie-only first
    let response = await post(primaryUrl, false);

    // If the proxy rejects POST without CSRF, retry through contactsmeta with a token
    if ((response.status === 401 || response.status === 403) && csrfToken) {
        response = await post(fallbackUrl, true);
    }

    return response;
}
```

This gives you the best of both worlds: the cookie-only proxy handles most writes; for the few endpoints that strictly need CSRF, the fallback kicks in.

### Pass 4: Strip the ghost-tab machinery

After Pass 2 + 3, almost no code path actually needs the captured tokens. You can remove:

1. **Any `chrome.windows.create({ type: 'popup', state: 'minimized', focused: false })` calls** — these were spawning the off-screen ghost windows.
2. **Any `chrome.tabs.create` loops that target SFMC module URLs** with the purpose of triggering token-bearing requests.
3. **The "Capture All Tokens" UI buttons** and their associated polling loops.
4. **Per-section token-staleness alarms / re-capture timers.**

What to **keep**:
- `chrome.webRequest.onBeforeSendHeaders.addListener(...)` that observes outgoing `x-csrf-token` headers and stores them in `chrome.storage.local`. This is passive — it captures tokens for free as the user navigates SFMC normally. The write-fallback path uses whatever was captured most recently. **No ghost tabs needed to populate this.**
- The webRequest **observer** permission is still useful. Don't drop the `webRequest` permission from `manifest.json`.

### Pass 5: Replace the "Refresh Tokens" button with a session probe

The old "Refresh Tokens" button kicked off the ghost-tab dance. After migration it's useless. Replace it with a live session probe — a single cheap GET that verifies the user actually has a valid SFMC session:

```js
async function probeSfmcSession(stack) {
    const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/legacy/v1/beta/folder/0/children?$pageSize=1`;
    try {
        const r = await fetch(url, { method: 'GET', credentials: 'include', headers: { 'accept': 'application/json' } });
        if (r.ok) return { ok: true };
        if (r.status === 401 || r.status === 403) return { ok: false, hint: 'Not logged in to SFMC. Open SFMC in this browser and sign in.' };
        return { ok: false, hint: `Session probe returned HTTP ${r.status}.` };
    } catch (e) {
        return { ok: false, hint: `Session probe failed: ${e.message}` };
    }
}
```

Show a badge in the panel that displays the probe result (`Session` green / `No Session` red / `Checking…` yellow). Auto-probe once when the panel opens. Make the badge clickable to re-probe on demand.

---

## Edge cases and known limitations

### The `Authorization: Bearer {MID}` endpoints

A small subset of contactsmeta endpoints **need both `x-csrf-token` AND `Authorization: Bearer {MID}`**, where MID is the 10-digit account member ID. The notable ones:

- `POST /contactsmeta/fuelapi/contacts-internal/v1/addresses/search/` (filter contacts by email/key/criteria)
- `GET /contactsmeta/fuelapi/legacy/v1/beta/contact/{base64ContactRef}/address/` (full contact + address details)

For these you have to:
1. Capture the MID passively — `webRequest.onBeforeSendHeaders` extracts it from outgoing `Authorization: Bearer 00XXXXXXXX` headers SFMC's own UI sends.
2. Capture the CSRF token the same way.
3. Send both headers with the request. There is no cookie-only equivalent for these endpoints (we tried — they 401).

The base64 contact reference is `btoa(`${contactID}:61:0`)`. The `:61:0` suffix is a fixed platform constant for "primary contact record" — same for every contact, every BU.

### The OAuth REST domain (`www-mc-{stack}.marketingcloudapis.com`)

SFMC's UI sometimes hits `www-mc-{stack}.marketingcloudapis.com/v2/...` directly. This is the **public** OAuth REST API. It needs a real OAuth Bearer access token (not the MID-as-Bearer trick) and CORS-blocks `chrome-extension://` origins. **Avoid it.** Everything reachable through it is also reachable through `/cloud/fuelapi/`, which works without OAuth.

### `admin.html?hub=1` is a trap

Several older extensions fetch `https://mc.{stack}.marketingcloudapps.com/contactsmeta/admin.html?hub=1` to scrape the CSRF token out of the HTML. **Don't.** That endpoint 302-redirects to OAuth (`auth-mc-{stack}.marketingcloudapis.com/v2/authorize?...`), and the redirect target CORS-blocks extension origins. Worse: in some cases, the request body capture creates a self-triggering loop on `update-token.html` that pegs the service worker at tens of thousands of requests and crashes DevTools. We hit this and it took a while to find. Just don't.

If you need a CSRF token for a write call and don't have one captured, the right answer is to ask the user to "open Contact Builder once" — their navigation will trigger the passive capture.

### `members.*.exacttarget.com/*` is a malformed match pattern

Chrome match patterns only allow `*` as the leftmost subdomain wildcard. `https://members.*.exacttarget.com/*` causes a manifest warning on load. The catch-all `https://*.exacttarget.com/*` (which you probably already have) covers `members.{stack}.exacttarget.com` so the more-specific entry is redundant. Drop it.

---

## Applying this to CloudPage Maestro

Specifically for CPM, based on a quick scan of [background.js](./background.js) and [content.js](./content.js):

1. **[background.js](./background.js#L32) `onBeforeSendHeaders`** — keep as-is. It's passive CSRF capture, no ghost tabs. Useful for the remaining write paths.
2. **[content.js:536](./content.js#L536) `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/categories/${categoryId}`** — swap to `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/categories/${categoryId}` and drop any x-csrf-token header.
3. **[content.js:1855](./content.js#L1855) `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query?scope=ours`** — same migration. This is the asset-search POST query. It works cookie-only despite being a POST, because semantically it's a read.
4. **Publish / unpublish CloudPages** — these are writes. They probably need CSRF. Wrap them in the cookie-first-then-fallback pattern from Pass 3 above. The endpoint family is `/cloud/fuelapi/asset/v1/content/sites/...` for publishing.
5. **Drop the `content-builder.{stack}.marketingcloudapps.com` host permission** if nothing else uses it after the migration — fewer permissions == better Chrome Web Store review.

A reasonable test sequence:
- After Pass 2, load the extension fresh in a browser **without** opening Content Builder anywhere. The asset list should populate immediately. (Previously this would have failed or required ghost-tab capture.)
- Try publish on a CloudPage. If it 401s, you're in the "write needs CSRF" category — wire up the fallback.
- Check `chrome://extensions/` for the "Service Worker" status. It should say `active` and have no errors.

---

## Reference: the SFMC Scout migration commit summary

The Scout migration touched these files:

- `background.js` — removed `OPEN_GHOST_TAB`/`OPEN_GHOST_TABS` handlers (stubbed as no-ops), removed `ghostWindowId` state, removed the `update-token.html` re-fetch loop (the DevTools-crashing one), replaced `FETCH_CSRF` body with a session probe.
- `content.js` — removed `refreshAllTokensWithGhostTabs()` body, replaced the per-section `0/4 Tokens` badge with a single `Session` indicator.
- `handlers/search/*.js` — every search service host-swapped, CSRF headers dropped where applicable, pagination added to AutomationSearchService and AssetSearchService (without ghost tabs holding things up, single calls were silently truncating large search results).
- `handlers/de/DEUsageHandler.js` — already cookie-only. Added `?view=targetObjects` perf win + tightened match logic.
- `handlers/de/DEFolderService.js`, `handlers/de/FieldDefinitionsHandler.js`, `handlers/async/AsyncStatusHandler.js`, `handlers/automation/*.js` — host swap.
- `services/DEExportService.js` — bulk folder index + per-folder fallback (the cookie-only `/legacy/v1/beta/folder/{id}` works for own-BU folders; cross-BU shared folders fall back to the contactsmeta path with passive CSRF).
- `services/DECreationService.js` — try-cookie-first-then-fallback write pattern.
- `utils/InstanceService.getApiBaseUrl()` — flipped the default base URL from `marketingcloudapps.com/contactsmeta/fuelapi` to `exacttarget.com/cloud/fuelapi`. This single change cascaded through `DEExport / DEImport / DESearch / DEReport / APIService` because they all read from `getApiBaseUrl`.

---

## One last gotcha: `node --check` lies

Chrome MV3 service workers run as ES modules (per the manifest `"type": "module"`). `node --check file.js` parses files as **scripts**, which is more lenient than ESM mode. A file like:

```js
const buildBody = (pageNum) => ({
    page: { page: pageNum, pageSize: 500 },
    /* ... */
};   // ← missing close paren! Should be `});`
```

…passes `node --check` clean (the parser treats the curly-braces as an unreachable block statement after a no-op expression), but Chrome's SW loader rejects it with `Service worker registration failed. Status code: 15` and gives you no source location.

If you ever see Status 15, simulate the SW load with a stubbed `globalThis.chrome` and `node` in ESM mode:

```js
// sw_test.mjs
globalThis.chrome = { runtime: {}, webRequest: { onBeforeSendHeaders: { addListener: () => {} } }, storage: {}, tabs: {}, /* ... */ };
import('file:///' + process.argv[2].replace(/\\/g, '/'))
    .then(() => console.log('SW loaded OK'))
    .catch(e => console.error(e.stack || e.message));
```

Run with `node sw_test.mjs /full/path/to/background.js`. ESM mode will surface the real syntax error with file + line.

---

Written by Aldorino Rrushi while migrating SFMC Scout away from ghost tabs (May 2026). Same pattern works for any SFMC browser extension — same vendor, same proxy, same trick.
