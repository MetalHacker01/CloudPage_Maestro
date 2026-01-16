// Background Service Worker for CloudPage Maestro (Chrome Extension)
// Handles token interception and storage

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
          // Determine which token based on URL
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
    // Content script found a token in DOM
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
  
  else if (message.type === 'GET_TOKENS') {
    // Content script requesting tokens
    console.log('[CloudPage Maestro] Sending tokens to content script');
    sendResponse({ 
      success: true,
      tokens: tokens 
    });
    return true;
  } 
  
  else if (message.type === 'MAKE_REQUEST') {
    // Content script requesting API call (to bypass CORS)
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
    return true; // Keep channel open for async response
  }
  
  return false;
});

// Save tokens to storage
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

// Make API request on behalf of content script
async function makeAPIRequest(config) {
  try {
    const options = {
      method: config.method || 'GET',
      headers: config.headers || {}
    };

    if (config.body) {
      // Body is already stringified from content script
      options.body = config.body;
      // Don't override Content-Type if already set
    }

    console.log('[CloudPage Maestro] Making fetch request to:', config.url);
    console.log('[CloudPage Maestro] Headers:', options.headers);
    
    const response = await fetch(config.url, options);

    if (!response.ok) {
      const text = await response.text();
      console.error('[CloudPage Maestro] Response error:', response.status, text);
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[CloudPage Maestro] API request error:', error);
    throw error;
  }
}
