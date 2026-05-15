// Background Service Worker for CloudPage Maestro v8 (Chrome Extension)
// Handles token interception (webRequest), API proxy (CORS bypass), token storage

console.log('[CloudPage Maestro] Service worker started');

// Token storage
let tokens = {
  pageHookToken: null,
  appcoreToken: null,
  pageHookSource: null,
  appcoreSource: null
};

// Load tokens from storage on startup
chrome.storage.local.get([
  'csrfToken_pagehook',
  'csrfToken_appcore',
  'csrfToken_pagehook_source',
  'csrfToken_appcore_source'
], (result) => {
  tokens.pageHookToken = result.csrfToken_pagehook || null;
  tokens.appcoreToken = result.csrfToken_appcore || null;
  tokens.pageHookSource = result.csrfToken_pagehook_source || null;
  tokens.appcoreSource = result.csrfToken_appcore_source || null;
  console.log('[CloudPage Maestro] Loaded tokens from storage', {
    hasPageHook: !!tokens.pageHookToken,
    hasAppcore: !!tokens.appcoreToken
  });
});

// Listen for web requests to capture tokens from headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.requestHeaders) {
      for (let header of details.requestHeaders) {
        if (header.name.toLowerCase() === 'x-csrf-token') {
          if (details.url.includes('content-builder')) {
            tokens.pageHookToken = header.value;
            tokens.pageHookSource = 'webRequest:' + details.url.substring(0, 100);
            saveTokens();
            console.log('[CloudPage Maestro] Captured pageHook token from request headers');
          } else if (details.url.includes('cloud-pages')) {
            tokens.appcoreToken = header.value;
            tokens.appcoreSource = 'webRequest:' + details.url.substring(0, 100);
            saveTokens();
            console.log('[CloudPage Maestro] Captured appcore token from request headers');
          }
        }
      }
    }
  },
  {
    urls: [
      "https://*.marketingcloudapps.com/*",
      "https://*.exacttarget.com/*"
    ]
  },
  ["requestHeaders"]
);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[CloudPage Maestro] Received message:', message.type);

  if (message.type === 'TOKEN_CAPTURED') {
    if (message.tokenType === 'pageHook') {
      tokens.pageHookToken = message.token;
      tokens.pageHookSource = message.source;
      console.log('[CloudPage Maestro] PageHook token captured from DOM');
    } else if (message.tokenType === 'appcore') {
      tokens.appcoreToken = message.token;
      tokens.appcoreSource = message.source;
      console.log('[CloudPage Maestro] Appcore token captured from DOM');
    }
    saveTokens();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_TOKENS') {
    console.log('[CloudPage Maestro] Sending tokens to content script');
    sendResponse({
      success: true,
      tokens: tokens
    });
    return true;
  }

  if (message.type === 'MAKE_REQUEST') {
    console.log('[CloudPage Maestro] Making API request:', message.config.url);
    makeAPIRequest(message.config)
      .then(response => {
        console.log('[CloudPage Maestro] API request successful');
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        console.error('[CloudPage Maestro] API request failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  return false;
});

function saveTokens() {
  chrome.storage.local.set({
    csrfToken_pagehook: tokens.pageHookToken,
    csrfToken_appcore: tokens.appcoreToken,
    csrfToken_pagehook_source: tokens.pageHookSource,
    csrfToken_appcore_source: tokens.appcoreSource
  }, () => {
    console.log('[CloudPage Maestro] Tokens saved to storage');
  });
}

/**
 * Make API request on behalf of content script.
 * v6: On success (2xx), try to parse JSON; if body is not JSON (e.g. HTML or empty),
 *     return { ok: true } so the content script does not show a false failure.
 */
async function makeAPIRequest(config) {
  try {
    const options = {
      method: config.method || 'GET',
      headers: config.headers || {},
      // Required for cookie-only auth on the /cloud/fuelapi/ proxy.
      // Session cookies on *.exacttarget.com flow with the request when this is set.
      credentials: 'include'
    };

    if (config.body) {
      options.body = config.body;
    }

    console.log('[CloudPage Maestro] Making fetch request to:', config.url);

    const response = await fetch(config.url, options);

    if (!response.ok) {
      const text = await response.text();
      console.error('[CloudPage Maestro] Response error:', response.status, text);
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    // Handle image responses — convert to base64 data URI so content script can display them
    if (contentType.startsWith('image/')) {
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach(b => binary += String.fromCharCode(b));
      const base64 = btoa(binary);
      const mimeType = contentType.split(';')[0].trim();
      return { ok: true, base64: `data:${mimeType};base64,${base64}` };
    }

    const text = await response.text();

    if (contentType.includes('application/json') && text.trim().length > 0) {
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn('[CloudPage Maestro] Response looked like JSON but parse failed, treating as success');
        return { ok: true };
      }
    }

    // Success response but not JSON (e.g. HTML or empty) - treat as success
    if (text.trim().length > 0) {
      console.warn('[CloudPage Maestro] Success response was not JSON (content-type:', contentType, '), treating as success');
    }
    return { ok: true };
  } catch (error) {
    console.error('[CloudPage Maestro] API request error:', error);
    throw error;
  }
}
