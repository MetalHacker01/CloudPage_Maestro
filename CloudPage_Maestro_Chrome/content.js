// Content script for CloudPage Maestro Chrome Extension v8
// Built on v6 stable base. Changes in v8:
//   - Auto token capture via hidden iframes (no manual navigation needed)
//   - Pagination page 2+ bug fix (correct total count per type)
//   - Clearer per-token error messages with Capture Tokens button
//   - Enriched CSV export (status, URL, folder, modifiedBy, customerKey)
//   - JSON export option
//   - Loading skeleton rows
//   - Batch operation progress bar
//   - Sortable table columns
//   - Resizable panel (drag handle, persisted width)
//   - Keyboard shortcut: Escape to close panel

// ============================================
// DEBUG MODE - Set to true to see detailed logs
// ============================================
const DEBUG_MODE = false;

// Debug logging wrapper - only logs when DEBUG_MODE is true
const debugLog = (...args) => {
    if (DEBUG_MODE) {
        console.log(...args);
    }
};

// ============================================
// v6 CONFIG - Centralized constants
// ============================================
const CPM_CONFIG = {
    CACHE_TTL_MS: 5 * 60 * 1000,       // 5 minutes enrichment cache
    INIT_POLL_INTERVAL_MS: 500,        // Poll every 500ms for page ready
    INIT_MAX_WAIT_MS: 10000,           // Max 10s wait before starting
    MAX_CONCURRENT_REQUESTS: 10,
    TOKEN_CAPTURE_POLL_MS: 500,        // Poll every 500ms during iframe token capture
    TOKEN_CAPTURE_TIMEOUT_MS: 15000    // Give up after 15s of iframe token capture
};

console.log('═══════════════════════════════════════════════════════════');
console.log('CloudPage Maestro - Chrome Extension v1.0.0');
console.log('   URL:', window.location.href);
console.log('   Debug Mode:', DEBUG_MODE ? 'ENABLED ✓' : 'DISABLED (production)');
console.log('═══════════════════════════════════════════════════════════');


// =============================================================
// PEER EXTENSION COORDINATION (CPM <-> SFMC Scout)
// =============================================================
// Set our presence marker immediately so a sibling extension can detect us
// even before our panel renders. The marker is just an attribute on <html>.
try { document.documentElement.setAttribute('data-cpm-loaded', '1'); } catch (_) {}

// Coordination state
const CPM_PEER = {
    detected: false,
    paused: false,
    cleanup: []
};

function cpmDetectPeer() {
    return document.documentElement.hasAttribute('data-scout-loaded');
}

function cpmApplyDualMode() {
    if (CPM_PEER.detected) return;
    CPM_PEER.detected = true;
    const toggle = document.getElementById('cpm-toggle-btn');
    if (toggle) toggle.classList.add('cpm-compact');
}

function cpmPauseForPeer() {
    if (CPM_PEER.paused) return;
    CPM_PEER.paused = true;
    if (window.CPM_STATE?._tokenProbeInterval) {
        clearInterval(window.CPM_STATE._tokenProbeInterval);
        window.CPM_STATE._tokenProbeInterval = null;
    }
    // Mutual exclusion: close our panel if it's open
    const mgr = document.getElementById('cloudpages-manager');
    if (mgr && !mgr.classList.contains('minimized')) {
        mgr.classList.add('minimized');
        if (window.CPM_STATE) window.CPM_STATE.isPanelOpen = false;
    }
    const toggle = document.getElementById('cpm-toggle-btn');
    if (toggle) {
        toggle.classList.remove('panel-open');
        toggle.classList.add('peer-active');
    }
    console.log('[CloudPage Maestro] Paused while SFMC Scout is active');
}

function cpmResumeFromPeer() {
    if (!CPM_PEER.paused) return;
    CPM_PEER.paused = false;
    if (window.CPM_STATE && !window.CPM_STATE._tokenProbeInterval) {
        window.CPM_STATE._tokenProbeInterval = setInterval(() => {
            if (typeof verifyTokenBadges === 'function') verifyTokenBadges();
        }, 4 * 60 * 1000);
    }
    const toggle = document.getElementById('cpm-toggle-btn');
    if (toggle) toggle.classList.remove('peer-active');
    console.log('[CloudPage Maestro] Resumed (Scout panel closed)');
}

function cpmAnnouncePanelState(isOpen) {
    try {
        document.dispatchEvent(new CustomEvent(
            isOpen ? 'sfmc-panel:open' : 'sfmc-panel:close',
            { detail: { extension: 'cpm' } }
        ));
    } catch (_) {}
}

function cpmSetupPeerCoordination() {
    // Run detection twice — once after a short delay (peer may load slightly
    // before or after us), once later in case the peer is slow to bootstrap.
    const check = () => {
        if (cpmDetectPeer()) cpmApplyDualMode();
    };
    setTimeout(check, 400);
    setTimeout(check, 1500);

    // Listen for the peer's panel open/close announcements
    const onOpen = (e) => {
        if (e?.detail?.extension === 'cpm') return;  // ignore our own
        cpmPauseForPeer();
    };
    const onClose = (e) => {
        if (e?.detail?.extension === 'cpm') return;
        cpmResumeFromPeer();
    };
    document.addEventListener('sfmc-panel:open', onOpen);
    document.addEventListener('sfmc-panel:close', onClose);
    CPM_PEER.cleanup.push(() => {
        document.removeEventListener('sfmc-panel:open', onOpen);
        document.removeEventListener('sfmc-panel:close', onClose);
    });
}

// Global function - inject hidden iframes to trigger background token capture
// Must be global because createMainUI (outside IIFE) calls it via button handler
function injectTokenCaptureIframes(stack, onComplete) {
    if (!stack) {
        console.warn('[CloudPage Maestro] Cannot inject token capture iframes: stack not detected');
        if (onComplete) onComplete(null, null);
        return;
    }
    document.querySelectorAll('.cpm-token-capture-iframe').forEach(function(f) { f.remove(); });
    var urls = [
        'https://mc.' + stack + '.exacttarget.com/cloud/#app/Content%20Builder',
        'https://mc.' + stack + '.exacttarget.com/cloud/#app/CloudPages/'
    ];
    var iframeStyle = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:none;top:-9999px;left:-9999px;';
    urls.forEach(function(url) {
        var iframe = document.createElement('iframe');
        iframe.className = 'cpm-token-capture-iframe';
        iframe.src = url;
        iframe.style.cssText = iframeStyle;
        // No sandbox: allows full SPA init so SFMC app makes authenticated API calls
        // that the background webRequest listener intercepts for token capture
        document.body.appendChild(iframe);
    });
    var elapsed = 0;
    var captureInterval = setInterval(function() {
        elapsed += CPM_CONFIG.TOKEN_CAPTURE_POLL_MS;
        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, function(response) {
            if (!response || !response.success) return;
            var ph = response.tokens.pageHookToken;
            var ac = response.tokens.appcoreToken;
            if ((ph && ac) || elapsed >= CPM_CONFIG.TOKEN_CAPTURE_TIMEOUT_MS) {
                clearInterval(captureInterval);
                document.querySelectorAll('.cpm-token-capture-iframe').forEach(function(f) { f.remove(); });
                if (ph && ac) console.log('[CloudPage Maestro] Both tokens captured via iframes');
                else console.warn('[CloudPage Maestro] Token iframe capture ended - ph:', !!ph, 'ac:', !!ac);
                if (onComplete) onComplete(ph, ac);
            }
        });
    }, CPM_CONFIG.TOKEN_CAPTURE_POLL_MS);
}

(async function() {
    'use strict';

    // Guard: when CPM injects hidden iframes for token capture, those iframes
    // load *.exacttarget.com URLs which match this content script's manifest.
    // Without this check, the bootstrap re-runs inside each iframe and tries to
    // inject MORE iframes — infinite recursion, plus a console error at line 376
    // when the iframe can't find a panel to attach the UI to.
    // Solution: only run the panel + bootstrap in the top-level frame.
    try {
        if (window.top !== window.self) {
            console.log('[CloudPage Maestro] In subframe — skipping panel bootstrap (token capture iframe or SFMC subframe).');
            return;
        }
    } catch (_) {
        // Cross-origin frame access can throw — that means we're definitely
        // in a subframe, so bail out.
        return;
    }

    // ============================================
    // STEP 1: CORE INFRASTRUCTURE SETUP
    // ============================================

    // Configuration - Extract stack from URL
    let stack = null;
    const stackMatch = window.location.hostname.match(/\.(s\d+)\.|mc\.([^.]+)\.exacttarget\.com/);
    if (stackMatch) {
        stack = stackMatch[1] || stackMatch[2];
        debugLog('[CloudPage Maestro] Stack detected:', stack);
    } else {
        console.warn('[CloudPage Maestro] Could not detect stack from URL');
    }

    // ============================================
    // PERFORMANCE OPTIMIZATION: Request Queue
    // Limits concurrent API calls to prevent flooding
    // ============================================
    const MAX_CONCURRENT_REQUESTS = CPM_CONFIG.MAX_CONCURRENT_REQUESTS;
    function createRequestQueue(limit) {
        const queue = [];
        let running = 0;
        
        return function enqueue(fn) {
            return new Promise((resolve, reject) => {
                queue.push({ fn, resolve, reject });
                processQueue();
            });
        };
        
        function processQueue() {
            if (running >= limit || queue.length === 0) return;
            
            const { fn, resolve, reject } = queue.shift();
            running++;
            
            fn()
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    running--;
                    processQueue();
                });
        }
    }
    const requestQueue = createRequestQueue(MAX_CONCURRENT_REQUESTS);
    debugLog('[CloudPage Maestro] Request queue initialized (max:', MAX_CONCURRENT_REQUESTS, 'concurrent)');

    // ============================================
    // PERFORMANCE OPTIMIZATION: Enrichment Cache
    // Avoids re-fetching same asset's site details
    // ============================================
    const enrichmentCache = new Map(); // assetId -> { status, url, pageId, timestamp }
    const CACHE_TTL = CPM_CONFIG.CACHE_TTL_MS;

    function getCachedEnrichment(assetId) {
        const cached = enrichmentCache.get(assetId);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached;
        }
        return null;
    }

    function setCachedEnrichment(assetId, data) {
        enrichmentCache.set(assetId, {
            ...data,
            timestamp: Date.now()
        });
    }
    debugLog('[CloudPage Maestro] Enrichment cache initialized (TTL:', CACHE_TTL / 1000, 'seconds)');

    // ============================================
    // State Management
    // ============================================
    let landingPages = [];
    let landingPagesMap = new Map(); // siteAssetId -> landing page for instant lookup
    let allAssets = [];
    let allAssetsForCategories = [];
    let categories = new Map();
    
    // UI State
    let isPanelOpen = false;
    let isLoading = false;
    let currentFilter = 'all';
    let selectedPages = new Set();
    let currentPage = 1;
    let itemsPerPage = 100;  // Normal mode: 100, Search mode: 20
    let totalFilteredItems = 0;
    
    // Pagination & Search Mode
    let isSearchMode = false;
    let allDataLoaded = false;
    let lpTotalCount = 0;
    let assetsTotalCount = 0;
    
    // Search state - track current search term for pagination
    let currentSearchTerm = '';
    let sortColumn = null;     // current sort column key
    let sortDirection = 'asc'; // sort direction
    let cachedTypeCounts = null; // persisted type counts from most recent full page load
    
    // Track enrichment sessions - allows cancelling stale enrichments
    let currentEnrichmentSession = 0;

    // ============================================
    // EXPOSE STATE TO GLOBAL SCOPE
    // So functions defined outside IIFE can access them
    // ============================================
    window.CPM_STATE = {
        stack,
        landingPages,
        landingPagesMap,
        allAssets,
        allAssetsForCategories,
        categories,
        isPanelOpen,
        isLoading,
        currentFilter,
        selectedPages,
        currentPage,
        itemsPerPage,
        totalFilteredItems,
        isSearchMode,
        allDataLoaded,
        lpTotalCount,
        assetsTotalCount,
        currentSearchTerm,
        sortColumn,
        sortDirection,
        cachedTypeCounts,
        currentEnrichmentSession,
        requestQueue,
        enrichmentCache,
        getCachedEnrichment,
        setCachedEnrichment,
        isDark: false
    };

    // ============================================
    // v6: DELAYED INITIALIZATION with polling (max wait, not fixed delay)
    // Poll for SFMC/page ready; proceed as soon as ready or after max wait
    // ============================================
    console.log('[CloudPage Maestro] Waiting for page to be ready...');
    
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    
    const deadline = Date.now() + CPM_CONFIG.INIT_MAX_WAIT_MS;
    while (Date.now() < deadline) {
        const sfmcReady = document.querySelector('[data-sfmc-app]') || 
                         document.querySelector('.slds-scope') ||
                         document.querySelector('.slds-spinner_container') ||
                         document.querySelector('[class*="sfmc"]');
        if (sfmcReady) {
            debugLog('[CloudPage Maestro] SFMC elements detected, proceeding');
            break;
        }
        await new Promise(r => setTimeout(r, CPM_CONFIG.INIT_POLL_INTERVAL_MS));
    }
    
    debugLog('[CloudPage Maestro] Starting initialization...');

    // ============================================
    // TOKEN CAPTURE FROM DOM
    // Enhanced token capture with both DOM and network interception
    // ============================================
    function captureTokensFromDOM() {
        debugLog('[CloudPage Maestro] Setting up token capture...');
        
        // Look for tokens in localStorage, sessionStorage, or global variables
        try {
            const possibleTokens = [
                localStorage.getItem('csrfToken'),
                sessionStorage.getItem('csrfToken'),
                window.csrfToken,
                document.querySelector('meta[name="csrf-token"]')?.content
            ].filter(Boolean);
            
            if (possibleTokens.length > 0) {
                debugLog('[CloudPage Maestro] Found', possibleTokens.length, 'potential tokens in storage');
            }
        } catch (error) {
            console.warn('[CloudPage Maestro] Could not access storage:', error);
        }
        
        // Intercept fetch calls for token capture
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            return originalFetch.apply(this, args).then(response => {
                const token = response.headers.get('x-csrf-token');
                if (token && token.length > 50) {
                    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                    const tokenType = url.includes('content-builder') ? 'pageHook' : 'appcore';
                    
                    chrome.runtime.sendMessage({
                        type: 'TOKEN_CAPTURED',
                        tokenType: tokenType,
                        token: token,
                        source: 'fetch-intercept:' + url.substring(0, 80)
                    }).catch(err => {
                        console.warn('[CloudPage Maestro] Failed to send token to background:', err);
                    });
                    
                    debugLog('[CloudPage Maestro] Token captured via fetch:', tokenType, '- URL:', url.substring(0, 100));
                }
                return response;
            });
        };
        
        // Intercept XHR calls for token capture
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        
        XMLHttpRequest.prototype.open = function(method, url) {
            this.__sfmc_url = url;
            return originalOpen.apply(this, arguments);
        };
        
        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (String(header).toLowerCase() === 'x-csrf-token' && value && String(value).length > 50) {
                const url = this.__sfmc_url || '';
                const tokenType = url.includes('content-builder') ? 'pageHook' : 'appcore';
                
                chrome.runtime.sendMessage({
                    type: 'TOKEN_CAPTURED',
                    tokenType: tokenType,
                    token: String(value),
                    source: 'xhr-intercept:' + url.substring(0, 80)
                }).catch(err => {
                    console.warn('[CloudPage Maestro] Failed to send token to background:', err);
                });
                
                debugLog('[CloudPage Maestro] Token captured via XHR:', tokenType, '- URL:', url.substring(0, 100));
            }
            return originalSetRequestHeader.apply(this, arguments);
        };
        
        debugLog('[CloudPage Maestro] Token capture hooks installed');
    }

    // Token capture from DOM and network requests
    captureTokensFromDOM();

    // Proactively inject token capture iframes 2s after load (silent background capture)
    // Tokens will be ready before the user opens the panel
    setTimeout(function() {
        if (!chrome.runtime || !chrome.runtime.sendMessage) return;
        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, function(response) {
            if (!response || !response.success) return;
            var ph = response.tokens.pageHookToken;
            var ac = response.tokens.appcoreToken;
            if (!ph || !ac) {
                debugLog('[CloudPage Maestro] Auto pre-load: injecting token capture iframes');
                injectTokenCaptureIframes(stack, null);
            }
        });
    }, 2000);


    // Main initialization function
    async function initializeCloudPageMaestro() {
        console.log('[CloudPage Maestro] Getting tokens from background...');

        // v6: When Chrome runtime is not available, do not use captureTokensFromDOM() return
        // (it does not return tokens). Show clear message and require extension context.
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            console.error('[CloudPage Maestro] Chrome runtime not available - extension context required. Load the extension from chrome://extensions/');
            return;
        }

        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
            if (!response || !response.success) {
                console.warn('[CloudPage Maestro] Failed to get tokens from background');
                return;
            }

            const { pageHookToken, appcoreToken } = response.tokens;

            console.log('[CloudPage Maestro] Tokens status:', {
                hasPageHook: !!pageHookToken,
                hasAppcore: !!appcoreToken
            });

            // Cookie-only proxy migration: pageHookToken is no longer required for reads.
            // Only block on missing appcoreToken (still needed for publish/unpublish + cloud-pages reads).
            // Use console.log (not warn) — Chrome shows stack traces for warns by default
            // and this is the expected bootstrap path, not an error.
            if (!appcoreToken) {
                console.log('[CloudPage Maestro] appcoreToken not in storage yet — running silent iframe capture');
                injectTokenCaptureIframes(stack, function(capturedPH, capturedAC) {
                    var finalPH = capturedPH || pageHookToken;
                    var finalAC = capturedAC || appcoreToken;
                    if (!finalAC) {
                        // Genuinely a problem now — silent iframe capture failed.
                        showNotification('Publish token capture failed. Navigate to CloudPages in SFMC, then click Refresh. (Listing still works via session.)', 'warning');
                    }
                    createMainUI(finalPH, finalAC);
                });
                return;
            }

            console.log('[CloudPage Maestro] Tokens loaded, creating UI...');
            // (notification removed: extension loaded)

            // Create the main UI panel
            createMainUI(pageHookToken, appcoreToken);
        });
    }

    // Initialize the main application
    await initializeCloudPageMaestro();

})();

// ==================================================================
// ICONOIR SVG ICONS - Modern stroke-based icons
// ==================================================================
const ICONS = {
    // Actions
    cloudUpload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13V22"/><path d="M9 16L12 13L15 16"/><path d="M20 17.607C21.262 16.534 22 14.938 22 13.173C22 9.826 19.379 7.102 16.098 7.102C15.756 7.102 15.419 7.13 15.09 7.185C14.097 4.712 11.739 3 9 3C5.134 3 2 6.177 2 10.098C2 12.002 2.756 13.735 4 14.985"/></svg>',
    refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.168 8A10.003 10.003 0 0012 2C6.477 2 2 6.477 2 12s4.477 10 10 10c4.478 0 8.268-2.943 9.542-7"/><path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20H18"/><path class="download-arrow" d="M12 4V16M12 16L15.5 12.5M12 16L8.5 12.5"/></svg>',
    eyeClosed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3L21 21"/><path d="M10.584 10.587C10.2087 10.962 9.99778 11.4708 9.99756 12.0013C9.99733 12.5318 10.2078 13.0408 10.5828 13.416C10.9578 13.7913 11.4666 14.0022 11.9971 14.0024C12.5276 14.0027 13.0366 13.7922 13.412 13.4172"/><path d="M17.357 17.349C15.726 18.449 13.942 19 12 19C8.278 19 4.889 16.002 3 13.011C4.055 11.282 5.511 9.592 7.373 8.349"/><path d="M19.8 14.2C20.5 13.38 21.034 12.543 21.367 11.782C21.4998 11.474 21.5 11.128 21.367 10.82C20.1 8.181 16.688 4 12 4C11.341 4 10.696 4.079 10.066 4.232"/></svg>',
    cancel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.758 17.243L12.001 12M17.244 6.757L12.001 12M12.001 12L6.758 6.757M12.001 12L17.244 17.243"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 20H9.6C9.26863 20 9 19.7314 9 19.4V9.6C9 9.26863 9.26863 9 9.6 9H19.4C19.7314 9 20 9.26863 20 9.6V19.4C20 19.7314 19.7314 20 19.4 20Z"/><path d="M15 9V4.6C15 4.26863 14.7314 4 14.4 4H4.6C4.26863 4 4 4.26863 4 4.6V14.4C4 14.7314 4.26863 15 4.6 15H9"/></svg>',
    externalLink: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L15 3M21 3L12 12M21 3V9"/><path d="M21 13V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H11"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21L16.65 16.65"/></svg>',
    
    // File types
    page: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21.4V2.6C4 2.26863 4.26863 2 4.6 2H16.252C16.4105 2 16.5627 2.06321 16.6752 2.17574L19.8232 5.32426C19.9368 5.43679 20 5.5895 20 5.74853V21.4C20 21.7314 19.7314 22 19.4 22H4.6C4.26863 22 4 21.7314 4 21.4Z"/><path d="M16 2V5.4C16 5.73137 16.2686 6 16.6 6H20"/><path d="M8 10H16"/><path d="M8 14H16"/><path d="M8 18H13"/></svg>',
    code: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6L10 18.5"/><path d="M6.5 8.5L3 12L6.5 15.5"/><path d="M17.5 8.5L21 12L17.5 15.5"/></svg>',
    curlyBrackets: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4H5.5C4.67157 4 4 4.67157 4 5.5V18.5C4 19.3284 4.67157 20 5.5 20H7"/><path d="M17 4H18.5C19.3284 4 20 4.67157 20 5.5V18.5C20 19.3284 19.3284 20 18.5 20H17"/></svg>',
    css3: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3L5.77778 20.0899L12 22L18.2222 20.0899L20 3H4Z"/><path d="M7 7H17L16 17L12 18L8 17L7.5 12H11.5"/></svg>',
    
    // Status
    checkCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5L10 15.5L17 8.5"/><circle cx="12" cy="12" r="10"/></svg>',
    warningCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7V13"/><path d="M12 17.01L12.01 16.9989"/><circle cx="12" cy="12" r="10"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6V12L16 14"/></svg>',
    calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2M15 4V6M15 4H10.5M3 10V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V10H3Z"/><path d="M3 10V6C3 4.89543 3.89543 4 5 4H7"/><path d="M7 2V6"/><path d="M21 10V6C21 4.89543 20.1046 4 19 4H18.5"/></svg>',
    infoCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16V12"/><path d="M12 8h.01"/></svg>',
    hashtag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L6 21"/><path d="M18 3L14 21"/><path d="M4 8H21"/><path d="M3 16H20"/></svg>',
    
    // Folder
    folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11V4.6C2 4.26863 2.26863 4 2.6 4H8.77805C8.92069 4 9.05679 4.05679 9.15751 4.15751L11.8425 6.84249C11.9432 6.94321 12.0793 7 12.2219 7H21.4C21.7314 7 22 7.26863 22 7.6V11M2 11V19.4C2 19.7314 2.26863 20 2.6 20H21.4C21.7314 20 22 19.7314 22 19.4V11M2 11H22"/></svg>',
    
    // Spinner
    spinner: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cpm-spinner"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>'
};

// Asset Type Configuration - Updated with Salesforce SLDS colors and SVG icons
const ASSET_TYPE_CONFIG = {
    'landingpage': { name: 'Landing Page', icon: ICONS.page, color: '#0176d3' },
    'jsoncoderesource': { name: 'JSON', icon: ICONS.curlyBrackets, color: '#04844b' },
    'codesnippetblock': { name: 'JavaScript', icon: ICONS.code, color: '#c23934' },
    'jscoderesource': { name: 'JavaScript', icon: ICONS.code, color: '#c23934' },
    'csscoderesource': { name: 'CSS', icon: ICONS.css3, color: '#ffb75d' }
};

function getAssetTypeInfo(assetType) {
    if (!assetType) return { name: 'Unknown', icon: ICONS.page, color: '#6b7280' };
    const key = assetType.name ? assetType.name.toLowerCase() : '';
    return ASSET_TYPE_CONFIG[key] || { name: assetType.displayName || 'Other', icon: ICONS.page, color: '#6b7280' };
}

// Get status info with color and icon
function getStatusInfo(status) {
    const map = {
        'Published': { color: '#04844b', icon: ICONS.checkCircle },
        'Unpublished': { color: '#c23934', icon: ICONS.warningCircle },
        'Draft': { color: '#ffb75d', icon: ICONS.clock },
        'Loading...': { color: '#9ca3af', icon: ICONS.clock }
    };
    return map[status] || map['Draft'];
}

// Build search OR tree with boost scoring
function buildSearchOrTree(keyword) {
    const value = String(keyword || '').trim();
    if (!value) return null;

    const leaves = [
        { property: 'name', simpleOperator: 'contains', boost: 50, value },
        { property: 'content', simpleOperator: 'contains', boost: 5, value },
        { property: 'description', simpleOperator: 'contains', boost: 3, value },
        { property: 'fileProperties.fileName', simpleOperator: 'contains', boost: 2, value },
        { property: 'views.subjectline.content', simpleOperator: 'contains', boost: 50, value },
        { property: 'customerKey', simpleOperator: 'contains', value }
    ];

    let tree = leaves[0];
    for (let i = 1; i < leaves.length; i++) {
        tree = { leftOperand: tree, logicalOperator: 'OR', rightOperand: leaves[i] };
    }
    return tree;
}

// Build category tree for folder path resolution
async function buildCategoryTree(pageHookToken) {
    debugLog(`[DEBUG] buildCategoryTree START - hasToken: ${!!pageHookToken}`);
    window.CPM_STATE.categories.clear();
    
    window.CPM_STATE.allAssetsForCategories.forEach(asset => {
        if (asset.category && asset.category.id) {
            const catId = asset.category.id;
            if (!window.CPM_STATE.categories.has(catId)) {
                window.CPM_STATE.categories.set(catId, {
                    id: catId,
                    name: asset.category.name || 'Unknown',
                    parentId: asset.category.parentId || null
                });
            }
        }
    });
    
    debugLog(`[DEBUG] Built category tree with ${window.CPM_STATE.categories.size} folders`);
    debugLog(`[DEBUG] First few categories:`, Array.from(window.CPM_STATE.categories.entries()).slice(0, 3));
    
    // Build full paths for all categories (fetch missing parents from API)
    const pathPromises = [];
    window.CPM_STATE.categories.forEach((cat, id) => {
        if (!cat.fullPath) {
            debugLog(`[DEBUG] Processing category ${id}: ${cat.name} (parentId: ${cat.parentId})`);
            pathPromises.push(
                buildFullPath(id, pageHookToken).then(fullPath => {
                    cat.fullPath = fullPath;
                    debugLog(`[DEBUG] Set fullPath for category ${id}: ${fullPath}`);
                })
            );
        }
    });
    
    await Promise.all(pathPromises);
    debugLog(`[DEBUG] buildCategoryTree DONE - Processed ${pathPromises.length} categories`);
}

// Fetch category details from API
// Cookie-only proxy: pageHookToken param retained for back-compat but not required.
async function fetchCategoryDetails(categoryId, pageHookToken) {
    if (!categoryId) {
        debugLog(`[DEBUG] fetchCategoryDetails - Missing categoryId`);
        return null;
    }

    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        debugLog(`[DEBUG] fetchCategoryDetails - No stack detected`);
        return null;
    }
    
    try {
        // Cookie-only proxy: /cloud/fuelapi/ accepts the user's session cookie, no CSRF needed.
        const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/categories/${categoryId}`;
        debugLog(`[DEBUG] Fetching category ${categoryId} from API (cookie-only)...`);

        // Use Chrome extension message passing to avoid CORS
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: url,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.error || 'Unknown error'));
                }
            });
        });
        
        debugLog(`[DEBUG] Fetched category ${categoryId}:`, response);
        
        return {
            id: response.id,
            name: response.name || 'Unknown',
            parentId: response.parentId || null
        };
    } catch (error) {
        console.error(`[DEBUG] Error fetching category ${categoryId}:`, error);
        return null;
    }
}

// Build full folder path by traversing parent chain (fetching missing parents from API)
async function buildFullPath(categoryId, pageHookToken) {
    debugLog(`[DEBUG] ========================================`);
    debugLog(`[DEBUG] buildFullPath START - categoryId: ${categoryId}`);
    
    const parts = [];
    let currentId = categoryId;
    let depth = 0;
    
    while (currentId && depth < 20) {
        debugLog(`[DEBUG] Depth ${depth}: Looking for category ${currentId}`);
        
        let cat = window.CPM_STATE.categories.get(currentId);
        
        if (cat) {
            debugLog(`[DEBUG] Found in cache: ${cat.name} (parentId: ${cat.parentId})`);
        } else {
            debugLog(`[DEBUG] Not in cache, fetching from API...`);
            cat = await fetchCategoryDetails(currentId, pageHookToken);
            if (cat) {
                debugLog(`[DEBUG] Fetched from API: ${cat.name} (parentId: ${cat.parentId})`);
                // Cache the fetched category
                window.CPM_STATE.categories.set(currentId, cat);
            } else {
                debugLog(`[DEBUG] Failed to fetch category ${currentId}, stopping traversal`);
                break;
            }
        }
        
        parts.unshift(cat.name);
        currentId = cat.parentId;
        depth++;
        
        debugLog(`[DEBUG] Current path so far: ${parts.join(' / ')}`);
    }
    
    // Remove 'CloudPages' root folder from display
    const filteredParts = parts.filter(p => p.toLowerCase() !== 'cloudpages');
    const finalPath = filteredParts.length > 0 ? filteredParts.join(' / ') : 'Cloud Pages';
    debugLog(`[DEBUG] buildFullPath DONE - Final path: ${finalPath}`);
    debugLog(`[DEBUG] ========================================`);
    
    return finalPath;
}

// Get folder path for a category
function getFolderPath(categoryId) {
    if (!categoryId) return 'Cloud Pages';
    const cat = window.CPM_STATE.categories.get(categoryId);
    if (!cat) return 'Cloud Pages';
    return cat.fullPath || cat.name || 'Cloud Pages';
}

// ==================================================================
// ALL FUNCTIONS BELOW - Using window.CPM_STATE for state access
// ==

// Create main UI panel - Matching Tampermonkey v5 Design
function createMainUI(pageHookToken, appcoreToken) {
    console.log('[CloudPage Maestro] Creating main UI panel...');
    
    // Remove any existing panel and toggle button
    const existingPanel = document.getElementById('cloudpages-manager');
    if (existingPanel) existingPanel.remove();
    const existingToggle = document.querySelector('.cpm-toggle-btn');
    if (existingToggle) existingToggle.remove();
    const existingToast = document.getElementById('cloudpages-toast');
    if (existingToast) existingToast.remove();
    
    // Create main panel container (slide-in from right)
    const panel = document.createElement('div');
    panel.id = 'cloudpages-manager';
    panel.className = 'minimized'; // Start closed
    
    panel.innerHTML = `
        <div id="cpm-resize-handle" title="Drag to resize panel" style="position:absolute;left:0;top:0;width:6px;height:100%;cursor:ew-resize;z-index:10;background:transparent;transition:background 0.2s;" onmouseover="this.style.background='rgba(1,118,211,0.2)'" onmouseout="this.style.background='transparent'"></div>
        <div class="cpm-header">
            <div class="cpm-header-left">
                <div class="cpm-logo">
                    <div class="cpm-logo-icon-wrap">
                        <img src="https://i.imgur.com/A6bV4BF.png" alt="" class="cpm-logo-img">
                    </div>
                    <div class="cpm-logo-text">
                        <span class="cpm-logo-title">CloudPage <strong>Maestro</strong></span>
                        <span class="cpm-logo-sub">CloudPages Control</span>
                    </div>
                </div>
            </div>
            <div class="cpm-header-actions">
                <button class="cpm-header-btn cpm-btn-neutral batch-unpublish" id="cpm-batch-unpublish" disabled title="Unpublish selected">
                    ${ICONS.eyeClosed} <span class="cpm-btn-label">Unpublish</span><span class="cpm-pill" id="cpm-unpublish-count" aria-hidden="true"></span>
                </button>
                <button class="cpm-header-btn cpm-btn-neutral batch-publish" id="cpm-batch-publish" disabled title="Publish selected">
                    ${ICONS.cloudUpload} <span class="cpm-btn-label">Publish</span><span class="cpm-pill" id="cpm-publish-count" aria-hidden="true"></span>
                </button>
                <button class="cpm-header-btn cpm-btn-neutral batch-move" id="cpm-batch-move" disabled title="Move selected">
                    ${ICONS.folder} <span class="cpm-btn-label">Move</span><span class="cpm-pill" id="cpm-move-count" aria-hidden="true"></span>
                </button>
                <span class="cpm-header-divider" aria-hidden="true"></span>
                <button class="cpm-header-btn cpm-btn-brand" id="cpm-refresh" title="Refresh">${ICONS.refresh} <span class="cpm-btn-label">Refresh</span></button>
                <button class="cpm-header-btn cpm-btn-brand" id="cpm-export-all-csv" title="Fetch &amp; export ALL assets (all pages, fully enriched)">${ICONS.download} <span class="cpm-btn-label">Export All</span></button>
                <div class="cpm-dropdown" id="cpm-download-all-wrap">
                    <button class="cpm-header-btn cpm-btn-brand cpm-dropdown-trigger" id="cpm-download-all-files" title="Download asset files in bulk" aria-haspopup="menu" aria-expanded="false">${ICONS.download} <span class="cpm-btn-label">Download All</span><span class="cpm-dropdown-caret" aria-hidden="true">▾</span></button>
                    <div class="cpm-dropdown-menu" id="cpm-download-all-menu" role="menu" aria-hidden="true">
                        <button class="cpm-dropdown-item" data-mode="all-tree" role="menuitem">
                            <strong>All files + folder tree</strong>
                            <span>HTML, JS, CSS, JSON — full SFMC category structure preserved</span>
                        </button>
                        <button class="cpm-dropdown-item" data-mode="html-flat" role="menuitem">
                            <strong>HTML only (flat)</strong>
                            <span>Landing page HTML files in a single folder, no nesting</span>
                        </button>
                    </div>
                </div>
                <button class="cpm-header-btn cpm-btn-ghost" id="cpm-about-btn" title="About CloudPage Maestro">${ICONS.infoCircle} <span class="cpm-btn-label">About</span></button>
                <button class="cpm-header-btn cpm-btn-ghost cpm-theme-toggle" id="cpm-theme-toggle" title="Toggle dark / light mode">
                    <svg class="cpm-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    <svg class="cpm-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                </button>
                <button class="cpm-header-btn cpm-btn-ghost" id="cpm-close-btn" title="Close panel">${ICONS.cancel} <span class="cpm-btn-label">Close</span></button>
            </div>
        </div>

        <!-- About Modal -->
        <div id="cpm-about-modal" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(3,45,96,0.6);backdrop-filter:blur(3px);z-index:10000;align-items:center;justify-content:center;">
            <div class="cpm-about-card">
                <!-- Hero band -->
                <div class="cpm-about-hero">
                    <div class="cpm-about-logo-ring">
                        <img src="https://i.imgur.com/A6bV4BF.png" alt="CloudPage Maestro logo" class="cpm-about-logo-img">
                    </div>
                    <div class="cpm-about-hero-text">
                        <div class="cpm-about-product-name">CloudPage <strong>Maestro</strong></div>
                        <div class="cpm-about-version">v1.0.0 &nbsp;·&nbsp; SFMC Asset Manager</div>
                    </div>
                    <button id="cpm-about-close" class="cpm-about-close-btn" title="Close">&times;</button>
                </div>
                <!-- Body -->
                <div class="cpm-about-body">
                    <div class="cpm-about-built-label">Built by</div>
                    <div class="cpm-about-author">Aldorino Rrushi</div>
                    <div class="cpm-about-copy">&copy; 2026 &mdash; Salesforce Marketing Cloud Tools</div>
                    <div class="cpm-about-divider"></div>
                    <div class="cpm-about-links">
                        <a href="https://www.linkedin.com/in/aldorino-rrushi/" target="_blank" rel="noopener" class="cpm-about-link cpm-about-link-li">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            LinkedIn
                        </a>
                        <a href="https://martech-maestro-folio-sroh.vercel.app/" target="_blank" rel="noopener" class="cpm-about-link cpm-about-link-web">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
                            Portfolio
                        </a>
                        <a href="https://github.com/MetalHacker01" target="_blank" rel="noopener" class="cpm-about-link cpm-about-link-gh">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                            GitHub
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <div class="cpm-content">
            <div class="cpm-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div class="cpm-section-title">Overview & Filters</div>
                    <div style="display: flex; gap: 8px;">
                        <div class="cpm-token-badge ${pageHookToken ? '' : 'error'}" id="pagehook-token-status">
                            <span class="cpm-token-dot"></span>
                            <span>${pageHookToken ? 'Search Ready' : 'Search Missing'}</span>
                        </div>
                        <div class="cpm-token-badge ${appcoreToken ? '' : 'error'}" id="appcore-token-status">
                            <span class="cpm-token-dot"></span>
                            <span>${appcoreToken ? 'Publish Ready' : 'Publish Missing'}</span>
                        </div>
                        <button id="cpm-recapture-tokens" title="Re-capture tokens via background iframes" style="background:none;border:1px solid #706e6b;color:#706e6b;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Capture Tokens</button>
                    </div>
                </div>
                <div class="cpm-stats-grid" id="cpm-stats-grid">
                    <div class="cpm-stat cpm-stat-overview active" data-filter="all" title="Total assets across the entire Business Unit">
                        <div class="cpm-stat-label">Overview</div>
                        <div class="cpm-stat-value" id="stat-total">0</div>
                        <div class="cpm-stat-scope">all assets</div>
                    </div>
                    <div class="cpm-stat" data-filter="landing" title="Landing pages on the current page only — paginate to see more">
                        <div class="cpm-stat-label">Landing Pages</div>
                        <div class="cpm-stat-value" id="stat-landing">0</div>
                        <div class="cpm-stat-scope">on this page</div>
                    </div>
                    <div class="cpm-stat" data-filter="json" title="JSON code resources on the current page only">
                        <div class="cpm-stat-label">JSON</div>
                        <div class="cpm-stat-value" id="stat-json">0</div>
                        <div class="cpm-stat-scope">on this page</div>
                    </div>
                    <div class="cpm-stat" data-filter="javascript" title="JS code resources on the current page only">
                        <div class="cpm-stat-label">JavaScript</div>
                        <div class="cpm-stat-value" id="stat-js">0</div>
                        <div class="cpm-stat-scope">on this page</div>
                    </div>
                    <div class="cpm-stat" data-filter="css" title="CSS code resources on the current page only">
                        <div class="cpm-stat-label">CSS</div>
                        <div class="cpm-stat-value" id="stat-css">0</div>
                        <div class="cpm-stat-scope">on this page</div>
                    </div>
                </div>
            </div>

            <div class="cpm-section">
                <div class="cpm-section-title">Search Assets</div>
                <div class="cpm-search-bar">
                    <input type="text" id="cpm-search-input" placeholder="Search by name, content, description, folder...">
                    <button class="cpm-btn" id="cpm-search-btn">Search</button>
                </div>
            </div>

            <div class="cpm-table-container" id="cpm-table-container">
                <div id="cpm-batch-progress" style="display:none;padding:8px 16px;background:#f0f7ff;border-bottom:1px solid #c9ddf0;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span id="cpm-batch-progress-text" style="font-size:13px;color:#0176d3;font-weight:500;min-width:160px;"></span>
                        <div style="flex:1;background:#d0e5f7;border-radius:4px;height:8px;overflow:hidden;">
                            <div id="cpm-batch-progress-bar" style="height:100%;background:#0176d3;width:0%;transition:width 0.2s ease;border-radius:4px;"></div>
                        </div>
                    </div>
                </div>
                <table class="cpm-table" id="cpm-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">
                                <input type="checkbox" id="cpm-select-all" title="Select all">
                            </th>
                            <th>${ICONS.hashtag} ID</th>
                            <th data-sort-col="name" style="cursor:pointer;" title="Click to sort by name">Name <span class="cpm-sort-icon" data-col="name"></span></th>
                            <th>Folder</th>
                            <th data-sort-col="type" style="cursor:pointer;" title="Click to sort by type">Type <span class="cpm-sort-icon" data-col="type"></span></th>
                            <th data-sort-col="status" style="cursor:pointer;" title="Click to sort by status">Status <span class="cpm-sort-icon" data-col="status"></span></th>
                            <th>${ICONS.externalLink} URL</th>
                            <th data-sort-col="modifiedDate" style="cursor:pointer;" title="Click to sort by date">Modified <span class="cpm-sort-icon" data-col="modifiedDate"></span></th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="cpm-table-body">
                    </tbody>
                </table>
                <div id="cpm-pagination"></div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Add toggle button (CP Maestro - on right side)
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'cpm-toggle-btn';
    toggleBtn.className = 'cpm-toggle-btn';
    toggleBtn.setAttribute('title', 'Open CloudPage Maestro');
    toggleBtn.innerHTML = `<svg class="cpm-toggle-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6L9 12L15 18"/></svg><span class="cpm-toggle-wordmark">Maestro</span>`;
    toggleBtn.addEventListener('click', () => {
        const mgr = document.getElementById('cloudpages-manager');
        if (mgr) {
            mgr.classList.toggle('minimized');
            const isOpen = !mgr.classList.contains('minimized');
            window.CPM_STATE.isPanelOpen = isOpen;
            toggleBtn.classList.toggle('panel-open', isOpen);

            // Notify the peer extension (Scout) so it can close its own panel
            // and pause background work while we are active.
            cpmAnnouncePanelState(isOpen);
            if (isOpen && CPM_PEER.paused) {
                // We opened despite being paused by a peer — peer must have closed already
                cpmResumeFromPeer();
            }

            // Auto-refresh on open when landing pages are not yet V2-enriched
            if (isOpen) {
                const hasUnenrichedLP = window.CPM_STATE.allAssets.some(
                    a => a.assetType?.name?.toLowerCase() === 'landingpage' && !a.isV2Enriched
                );
                if (hasUnenrichedLP || window.CPM_STATE.allAssets.length === 0) {
                    chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (resp) => {
                        if (resp?.success) {
                            loadAllData(resp.tokens.pageHookToken, resp.tokens.appcoreToken);
                        }
                    });
                }
            }
        }
    });
    document.body.appendChild(toggleBtn);

    // Kick off peer-extension coordination (detect Scout if installed, wire events)
    cpmSetupPeerCoordination();
    
    // Add toast
    const toast = document.createElement('div');
    toast.id = 'cloudpages-toast';
    document.body.appendChild(toast);

    // Add URL preview popup
    const urlPreview = document.createElement('div');
    urlPreview.id = 'cpm-url-preview';
    urlPreview.innerHTML = `
        <div class="cpm-preview-header">
            <span class="cpm-preview-dot"></span>
            <span id="cpm-preview-url-label">Loading preview...</span>
        </div>
        <div class="cpm-preview-viewport">
            <div class="cpm-preview-overlay-msg" id="cpm-preview-msg">Hover over a URL to preview</div>
            <iframe class="cpm-preview-iframe" id="cpm-preview-iframe" src="" title="Page preview" sandbox="allow-scripts allow-forms" loading="lazy"></iframe>
        </div>`;
    document.body.appendChild(urlPreview);
    
    // Add styles
    addStyles();
    
    // Setup event listeners
    setupEventListeners(pageHookToken, appcoreToken);

    // Wire click-to-reprobe on each token badge. Re-probe shows the real state
    // (verified by hitting the server) instead of the cached "Ready" length check.
    document.getElementById('pagehook-token-status')?.addEventListener('click', () => verifyTokenBadges());
    document.getElementById('appcore-token-status')?.addEventListener('click', () => verifyTokenBadges());

    // Keep panel closed on initialization but load data in background
    panel.classList.add('minimized');
    window.CPM_STATE.isPanelOpen = false;
    showLoading(true);  // Show skeleton rows while loading
    loadAllData(pageHookToken, appcoreToken);

    // Start the periodic probe — every 4 minutes the badge re-checks for staleness.
    // Also probe immediately so the initial "Ready" gets ground-truthed.
    setTimeout(() => verifyTokenBadges(), 1500);
    if (!window.CPM_STATE._tokenProbeInterval) {
        window.CPM_STATE._tokenProbeInterval = setInterval(() => verifyTokenBadges(), 4 * 60 * 1000);
    }

    console.log('[CloudPage Maestro] UI panel created successfully');
}

// Add CSS styles - Matching Tampermonkey v5 Design
function addStyles() {
    if (document.getElementById('cpm-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'cpm-styles';
    style.textContent = `
        /* Main Panel Container - SLDS-aligned */
        #cloudpages-manager {
            position: fixed;
            top: 0;
            right: 0;
            width: 85%;
            height: 100vh;
            background: #ffffff;
            box-shadow: -4px 0 24px rgba(0,0,0,0.12);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-left: 1px solid #e5e5e5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Salesforce Sans', sans-serif;
        }

        #cloudpages-manager.minimized {
            transform: translateX(100%);
        }

        /* Toggle Button - C3 Typeset */
        .cpm-toggle-btn {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            width: 40px;
            padding: 24px 0;
            background: #ffffff;
            border-top: 1px solid #dde1ea;
            border-bottom: 1px solid #dde1ea;
            border-left: 1px solid #dde1ea;
            border-right: none;
            border-radius: 8px 0 0 8px;
            cursor: pointer;
            z-index: 1000000;
            box-shadow: -4px 2px 18px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            position: fixed;
        }

        .cpm-toggle-btn::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 3px;
            background: linear-gradient(90deg, #0176d3, #0d9dda);
            flex-shrink: 0;
        }

        .cpm-toggle-btn:hover {
            width: 50px;
            box-shadow: -6px 3px 26px rgba(1,118,211,0.18);
            background: #f8fbff;
        }

        .cpm-toggle-wordmark {
            writing-mode: vertical-rl;
            text-orientation: mixed;
            font-family: Georgia, 'Times New Roman', 'DM Serif Display', serif;
            font-style: italic;
            font-size: 15px;
            font-weight: normal;
            color: #1c2b4a;
            transform: rotate(180deg);
            letter-spacing: 1px;
            transition: color 0.25s ease, letter-spacing 0.25s ease;
            flex-shrink: 0;
        }

        .cpm-toggle-btn:hover .cpm-toggle-wordmark {
            color: #0176d3;
            letter-spacing: 1.5px;
        }

        .cpm-toggle-chev {
            color: #9ba8bc;
            flex-shrink: 0;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.25s ease;
        }

        .cpm-toggle-btn.panel-open .cpm-toggle-chev {
            transform: rotate(180deg);
        }

        /* Compact mode — activates when SFMC Scout is also installed.
           Shrinks the vertical wordmark tab into a small icon pill so both
           extensions can sit on the right edge without fighting for space.
           Position offset (below center) leaves room for Scout above center. */
        .cpm-toggle-btn.cpm-compact {
            width: 40px;
            padding: 0;
            height: 40px;
            top: calc(50% + 26px);
            border-radius: 10px 0 0 10px;
            gap: 0;
            justify-content: center;
            transition: transform 160ms cubic-bezier(0.16,1,0.3,1),
                        opacity 200ms ease,
                        box-shadow 200ms ease,
                        background 160ms ease;
        }
        .cpm-toggle-btn.cpm-compact::before {
            display: none;
        }
        .cpm-toggle-btn.cpm-compact .cpm-toggle-chev {
            display: none;
        }
        .cpm-toggle-btn.cpm-compact .cpm-toggle-wordmark {
            writing-mode: horizontal-tb;
            transform: none;
            font-family: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
            font-style: normal;
            font-size: 11px;
            font-weight: 700;
            color: #0176d3;
            letter-spacing: -0.02em;
            line-height: 1;
        }
        .cpm-toggle-btn.cpm-compact .cpm-toggle-wordmark::before {
            content: 'CP';
        }
        .cpm-toggle-btn.cpm-compact .cpm-toggle-wordmark {
            font-size: 0;
        }
        .cpm-toggle-btn.cpm-compact .cpm-toggle-wordmark::before {
            font-size: 12px;
        }
        .cpm-toggle-btn.cpm-compact:hover {
            width: 40px;
            transform: translateY(-50%) translateX(-2px);
            box-shadow: -6px 3px 22px rgba(1,118,211,0.22);
            background: #f8fbff;
        }
        .cpm-toggle-btn.cpm-compact.panel-open {
            box-shadow: -4px 2px 18px rgba(0,0,0,0.1), 0 0 0 2px #0176d3;
        }

        /* Paused state — Scout's panel is open, so we step aside visually
           and stop our background intervals. Toggle still clickable. */
        .cpm-toggle-btn.peer-active {
            opacity: 0.45;
            box-shadow: -2px 1px 10px rgba(0,0,0,0.06);
        }
        .cpm-toggle-btn.peer-active:hover {
            opacity: 0.85;
        }

        .cpm-toggle-btn:hover .cpm-toggle-chev {
            color: #0176d3;
        }

        /* Toggle button — dark mode */
        .cpm-toggle-btn.cpm-dark {
            background: #161b22;
            border-color: #30363d;
            box-shadow: -4px 2px 18px rgba(0,0,0,0.4);
        }
        .cpm-toggle-btn.cpm-dark:hover {
            background: #1c2128;
            box-shadow: -6px 3px 26px rgba(56,139,253,0.2);
        }
        .cpm-toggle-btn.cpm-dark .cpm-toggle-wordmark {
            color: #8b949e;
        }
        .cpm-toggle-btn.cpm-dark:hover .cpm-toggle-wordmark {
            color: #58a6ff;
        }
        .cpm-toggle-btn.cpm-dark .cpm-toggle-chev {
            color: #484f58;
        }
        .cpm-toggle-btn.cpm-dark:hover .cpm-toggle-chev {
            color: #58a6ff;
        }
        /* Preview popup — dark mode */
        #cpm-url-preview.cpm-dark {
            background: #161b22;
            border-color: #30363d;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        #cpm-url-preview.cpm-dark .cpm-preview-header {
            background: #1c2128;
            border-color: #30363d;
            color: #8b949e;
        }
        #cpm-url-preview.cpm-dark .cpm-preview-viewport {
            background: #0d1117;
        }
        #cpm-url-preview.cpm-dark .cpm-preview-overlay-msg {
            background: #0d1117;
            color: #484f58;
        }

        /* Header — light theme: refined brand gradient with subtle hairline.
           Avoids the flat single-color "extension header" look. */
        .cpm-header {
            background: linear-gradient(180deg, #0a83df 0%, #0176d3 55%, #0167b9 100%);
            color: #ffffff;
            padding: 12px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            box-shadow: 0 1px 0 rgba(2, 36, 75, 0.18), 0 4px 12px -8px rgba(2, 36, 75, 0.35);
            position: relative;
        }
        .cpm-header::after {
            /* Hairline edge that reads as "premium" rather than "flat fill". */
            content: '';
            position: absolute;
            inset: auto 0 0 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.18) 70%, transparent);
            pointer-events: none;
        }

        .cpm-header-left {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .cpm-logo {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        /* Logo plate — layered inset borders provide "refraction" so the white
           detailed line-work has a real frame to read against, with NO outer glow
           (which the design system explicitly bans as an AI-aesthetic tell). */
        .cpm-logo-icon-wrap {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background:
                radial-gradient(circle at 30% 25%, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 60%),
                rgba(255,255,255,0.06);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            box-shadow:
                inset 0 0 0 1px rgba(255,255,255,0.22),
                inset 0 1px 0 rgba(255,255,255,0.32),
                inset 0 -6px 12px rgba(2, 36, 75, 0.18),
                0 2px 6px rgba(2, 36, 75, 0.22);
            transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
                        background 200ms ease,
                        box-shadow 200ms ease;
        }
        .cpm-logo-icon-wrap:hover {
            background:
                radial-gradient(circle at 30% 25%, rgba(255,255,255,0.28), rgba(255,255,255,0.06) 60%),
                rgba(255,255,255,0.10);
            transform: translateY(-1px);
        }
        .cpm-logo-icon-wrap:active {
            transform: translateY(0);
        }
        .cpm-logo-img {
            width: 32px;
            height: 32px;
            object-fit: contain;
            display: block;
            filter: brightness(0) invert(1) drop-shadow(0 1px 1px rgba(2, 36, 75, 0.35));
        }
        .cpm-logo-text {
            display: flex;
            flex-direction: column;
            line-height: 1;
        }
        .cpm-logo-title {
            font-size: 15px;
            font-weight: 400;
            color: rgba(255,255,255,0.92);
            letter-spacing: -0.005em;
        }
        .cpm-logo-title strong {
            font-weight: 700;
            color: #ffffff;
            letter-spacing: -0.012em;
        }
        .cpm-logo-sub {
            font-size: 10px;
            color: rgba(255,255,255,0.62);
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-top: 5px;
            font-variant-caps: all-small-caps;
        }

        .cpm-header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .cpm-header-divider {
            width: 1px;
            height: 20px;
            background: rgba(255,255,255,0.3);
            margin: 0 4px;
        }

        /* Dropdown wrapper — used by the Download All split button */
        .cpm-dropdown {
            position: relative;
            display: inline-flex;
        }
        .cpm-dropdown-caret {
            font-size: 10px;
            line-height: 1;
            margin-left: 4px;
            opacity: 0.7;
            transition: transform 160ms ease;
        }
        .cpm-dropdown-trigger[aria-expanded="true"] .cpm-dropdown-caret {
            transform: rotate(180deg);
        }
        .cpm-dropdown-menu {
            position: absolute;
            top: calc(100% + 6px);
            right: 0;
            min-width: 280px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(15, 17, 21, 0.16), 0 2px 6px rgba(15, 17, 21, 0.06);
            padding: 6px;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-4px) scale(0.98);
            transition: opacity 140ms ease, transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 1000;
        }
        .cpm-dropdown-menu.open {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0) scale(1);
        }
        .cpm-dropdown-item {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
            width: 100%;
            text-align: left;
            background: transparent;
            border: 0;
            border-radius: 5px;
            padding: 10px 12px;
            cursor: pointer;
            font: inherit;
            color: #1e3a5f;
            transition: background 120ms ease;
        }
        .cpm-dropdown-item:hover { background: #f1f5f9; }
        .cpm-dropdown-item:active { background: #e2e8f0; }
        .cpm-dropdown-item strong {
            font-size: 13px;
            font-weight: 600;
            letter-spacing: -0.005em;
        }
        .cpm-dropdown-item span {
            font-size: 11px;
            color: #64748b;
            font-weight: 400;
            line-height: 1.4;
        }
        #cloudpages-manager.cpm-dark .cpm-dropdown-menu {
            background: #161b22;
            border-color: #2c333d;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        }
        #cloudpages-manager.cpm-dark .cpm-dropdown-item { color: #e6edf3; }
        #cloudpages-manager.cpm-dark .cpm-dropdown-item:hover { background: #1f242c; }
        #cloudpages-manager.cpm-dark .cpm-dropdown-item:active { background: #2c333d; }
        #cloudpages-manager.cpm-dark .cpm-dropdown-item span { color: #8b949e; }

        .cpm-header-btn {
            border: 1px solid transparent;
            padding: 8px 14px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            letter-spacing: -0.005em;
            transition:
                background 160ms ease,
                border-color 160ms ease,
                color 160ms ease,
                transform 120ms cubic-bezier(0.16, 1, 0.3, 1),
                box-shadow 160ms ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: #ffffff;
        }
        .cpm-header-btn:active:not(:disabled) {
            /* Tactile press — micro-translate gives a physical "push" affordance.
               Hardware-accelerated transform only, per perf guardrails. */
            transform: translateY(1px);
        }
        .cpm-header-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .cpm-header-btn svg {
            flex-shrink: 0;
            width: 16px;
            height: 16px;
        }

        .cpm-header-btn.cpm-btn-neutral {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.35);
        }
        .cpm-header-btn.cpm-btn-neutral:hover:not(:disabled) {
            background: rgba(255,255,255,0.25);
            border-color: rgba(255,255,255,0.5);
        }

        .cpm-header-btn.cpm-btn-brand {
            background: rgba(255,255,255,0.95);
            color: #0176d3;
            border-color: rgba(255,255,255,0.9);
        }
        .cpm-header-btn.cpm-btn-brand:hover:not(:disabled) {
            background: #ffffff;
            color: #014a8a;
        }

        .cpm-header-btn.cpm-btn-ghost {
            background: transparent;
            color: rgba(255,255,255,0.9);
        }
        .cpm-header-btn.cpm-btn-ghost:hover:not(:disabled) {
            background: rgba(255,255,255,0.12);
        }

        .cpm-header-btn.batch-unpublish { color: #ffffff; }
        .cpm-header-btn.batch-unpublish:hover:not(:disabled) {
            background: rgba(194, 57, 52, 0.2);
            border-color: rgba(255,255,255,0.4);
        }
        .cpm-header-btn.batch-publish:hover:not(:disabled) {
            background: rgba(46, 132, 74, 0.25);
            border-color: rgba(255,255,255,0.4);
        }

        .cpm-pill {
            display: none;
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            border-radius: 10px;
            background: rgba(255,255,255,0.35);
            color: #0176d3;
            font-size: 11px;
            font-weight: 600;
            align-items: center;
            justify-content: center;
            margin-left: 4px;
        }
        .cpm-pill.cpm-pill-visible {
            display: inline-flex;
        }
        .cpm-header-btn.batch-unpublish .cpm-pill.cpm-pill-visible { background: rgba(255,255,255,0.9); color: #c23934; }
        .cpm-header-btn.batch-publish .cpm-pill.cpm-pill-visible { background: rgba(255,255,255,0.9); color: #2e844a; }

        .cpm-header-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Content Area */
        .cpm-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        /* Section module — card surface that lifts off the panel.
           Uses layered shadows + hairline border (no flat fill) so each module
           reads as a discrete unit with clear hierarchy in both themes. */
        .cpm-section {
            background: #ffffff;
            border-radius: 10px;
            padding: 18px 20px 16px;
            margin-bottom: 14px;
            border: 1px solid #e7e8eb;
            box-shadow: 0 1px 2px rgba(15, 17, 21, 0.04);
            transition: box-shadow 220ms ease, border-color 220ms ease, transform 160ms ease;
        }
        .cpm-section:hover {
            border-color: #d4d5d9;
            box-shadow: 0 4px 16px rgba(15, 17, 21, 0.06), 0 1px 2px rgba(15, 17, 21, 0.04);
        }

        .cpm-section-title {
            display: flex;
            align-items: center;
            gap: 9px;
            font-size: 11px;
            font-weight: 600;
            color: #4b5260;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 1px solid #f0f1f3;
        }
        .cpm-section-title::before {
            content: '';
            width: 3px;
            height: 12px;
            border-radius: 2px;
            background: linear-gradient(180deg, #0a83df 0%, #0167b9 100%);
            flex-shrink: 0;
        }

        /* Token Badges — actively probed; states: verifying / ok / stale / error / unknown.
           Click any badge to re-probe. */
        .cpm-token-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 10px;
            background: #e8f4ea;
            border: 1px solid #b8d4be;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            color: #2e844a;
            flex-shrink: 0;
            cursor: pointer;
            user-select: none;
            transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 120ms;
        }
        .cpm-token-badge:hover { transform: translateY(-1px); }
        .cpm-token-badge:active { transform: translateY(0); }

        .cpm-token-badge.ok {
            background: #e8f4ea;
            border-color: #8ec79a;
            color: #2e844a;
        }
        .cpm-token-badge.stale {
            background: #fdf6e3;
            border-color: #e3c977;
            color: #95710a;
        }
        .cpm-token-badge.error {
            background: #fef5f5;
            border-color: #e0b4b4;
            color: #c23934;
        }
        .cpm-token-badge.verifying {
            background: #eef4ff;
            border-color: #b6cdf3;
            color: #4a6fa5;
        }
        .cpm-token-badge.unknown {
            background: #f4f4f5;
            border-color: #d4d4d8;
            color: #52525b;
        }

        .cpm-token-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
        }
        .cpm-token-badge.verifying .cpm-token-dot {
            animation: cpm-token-pulse 1s ease-in-out infinite;
        }
        @keyframes cpm-token-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.75); }
        }

        /* Stats Grid - Clickable Filter Cards */
        .cpm-stats-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
        }

        .cpm-stat {
            background: #ffffff;
            padding: 10px 12px;
            border-radius: 4px;
            text-align: center;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s;
            border: 1px solid #e5e5e5;
        }

        .cpm-stat:hover {
            border-color: #0176d3;
            background: #f3f9ff;
        }

        .cpm-stat.active {
            background: #0176d3;
            border-color: #0176d3;
        }

        .cpm-stat.active .cpm-stat-label {
            color: rgba(255,255,255,0.9);
        }

        .cpm-stat.active .cpm-stat-value {
            color: #ffffff;
        }

        .cpm-stat-label {
            font-size: 10px;
            color: #706e6b;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .cpm-stat-value {
            font-size: 18px;
            font-weight: 700;
            color: #080707;
            line-height: 1.1;
        }

        /* Tiny scope caption beneath each stat — clarifies that non-Overview
           counts are page-scoped, not account-wide. */
        .cpm-stat-scope {
            margin-top: 4px;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #9ca3af;
            font-style: normal;
        }
        .cpm-stat-overview .cpm-stat-scope {
            color: #0176d3;
        }
        .cpm-stat.active .cpm-stat-scope {
            color: rgba(255, 255, 255, 0.85);
        }

        /* Search Bar */
        .cpm-search-bar {
            display: flex;
            gap: 8px;
        }

        #cpm-search-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #c9c9c9;
            border-radius: 4px;
            font-size: 13px;
            color: #080707;
        }

        #cpm-search-input:focus {
            outline: none;
            border-color: #0176d3;
            box-shadow: 0 0 0 2px rgba(1, 118, 211, 0.2);
        }

        .cpm-btn {
            padding: 8px 16px;
            border: 1px solid #0176d3;
            background: #0176d3;
            color: #ffffff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 400;
        }

        .cpm-btn:hover {
            background: #014a8a;
            border-color: #014a8a;
        }

        /* Table Container - SLDS */
        .cpm-table-container {
            background: #ffffff;
            border-radius: 4px;
            overflow-x: auto;
            border: 1px solid #e5e5e5;
        }

        .cpm-table {
            width: 100%;
            min-width: 900px;
            border-collapse: collapse;
            font-size: 13px;
            table-layout: auto;
        }

        .cpm-table thead th {
            background: #f3f3f3;
            padding: 12px 14px;
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            color: #706e6b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #c9c9c9;
        }
        
        /* Column Width Optimization */
        .cpm-table th:nth-child(1) { width: 40px; } /* Checkbox */
        .cpm-table th:nth-child(2) { width: 80px; } /* ID */
        .cpm-table th:nth-child(3) { width: auto; min-width: 150px; } /* Name */
        .cpm-table th:nth-child(4) { width: 180px; } /* Folder */
        .cpm-table th:nth-child(5) { width: 100px; } /* Type */
        .cpm-table th:nth-child(6) { width: 100px; } /* Status */
        .cpm-table th:nth-child(7) { width: 120px; } /* URL */
        .cpm-table th:nth-child(8) { width: 100px; } /* Modified */
        .cpm-table th:nth-child(9) { width: 120px; } /* Actions */

        .cpm-table tbody td {
            padding: 12px 14px;
            border-bottom: 1px solid #e5e5e5;
            color: #080707;
        }

        .cpm-table tbody tr {
            background: #ffffff;
            transition: background 0.1s;
        }

        .cpm-table tbody tr:hover {
            background: #f3f3f3;
        }

        /* ID Column - SLDS link */
        .cpm-id {
            font-family: monospace;
            font-weight: 600;
            color: #0176d3;
            cursor: pointer;
            font-size: 12px;
        }

        .cpm-id:hover {
            text-decoration: underline;
            color: #014a8a;
        }

        /* Breadcrumb / Folder - SLDS secondary text */
        .cpm-breadcrumb {
            font-size: 12px;
            color: #706e6b;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        /* Type and Status Badges */
        .cpm-status, .cpm-type {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
        }

        .cpm-status.published {
            background: #e8f4ea;
            color: #2e844a;
            border: 1px solid #b8d4be;
        }

        .cpm-status.unpublished {
            background: #fef5f5;
            color: #c23934;
            border: 1px solid #e0b4b4;
        }

        .cpm-status.draft {
            background: #fff8f0;
            color: #b65c00;
            border: 1px solid #f0d6a8;
        }

        /* URL Column - SLDS */
        .cpm-url {
            color: #0176d3;
            text-decoration: none;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .cpm-url:hover {
            text-decoration: underline;
            color: #014a8a;
        }

        /* URL Thumbnail Preview Popup */
        #cpm-url-preview {
            position: fixed;
            z-index: 2000001;
            background: #fff;
            border: 1px solid #dde1ea;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.18);
            width: 480px;
            overflow: hidden;
            pointer-events: none;
            opacity: 0;
            transform: translateY(6px);
            transition: opacity 0.18s ease, transform 0.18s ease;
            display: none;
        }

        #cpm-url-preview.visible {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }

        .cpm-preview-header {
            background: #f3f3f3;
            padding: 6px 10px;
            font-size: 11px;
            color: #706e6b;
            border-bottom: 1px solid #e5e5e5;
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .cpm-preview-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #0176d3;
            flex-shrink: 0;
        }

        .cpm-preview-viewport {
            width: 480px;
            height: 280px;
            overflow: hidden;
            position: relative;
            background: #f9f9f9;
        }

        .cpm-preview-iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
            background: #fff;
        }

        .cpm-preview-overlay-msg {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #9ca3af;
            background: #f9f9f9;
        }

        /* About Modal */
        .cpm-about-card {
            background: #ffffff;
            border-radius: 10px;
            width: 380px;
            max-width: 94%;
            box-shadow: 0 20px 60px rgba(3,45,96,0.28), 0 4px 16px rgba(3,45,96,0.12);
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Salesforce Sans', sans-serif;
        }
        .cpm-about-hero {
            background: linear-gradient(135deg, #0176d3 0%, #014a8a 100%);
            padding: 20px 20px 18px;
            display: flex;
            align-items: center;
            gap: 14px;
            position: relative;
        }
        .cpm-about-logo-ring {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: rgba(255,255,255,0.18);
            border: 2px solid rgba(255,255,255,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            box-shadow: 0 0 20px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .cpm-about-logo-img {
            width: 36px;
            height: 36px;
            object-fit: contain;
            filter: brightness(0) invert(1);
        }
        .cpm-about-hero-text {
            flex: 1;
            min-width: 0;
        }
        .cpm-about-product-name {
            font-size: 16px;
            font-weight: 400;
            color: rgba(255,255,255,0.92);
            line-height: 1.2;
        }
        .cpm-about-product-name strong {
            font-weight: 700;
            color: #ffffff;
        }
        .cpm-about-version {
            font-size: 10.5px;
            color: rgba(255,255,255,0.6);
            margin-top: 3px;
            letter-spacing: 0.04em;
        }
        .cpm-about-close-btn {
            background: rgba(255,255,255,0.15);
            border: 1px solid rgba(255,255,255,0.25);
            border-radius: 50%;
            color: rgba(255,255,255,0.85);
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: background 0.15s;
        }
        .cpm-about-close-btn:hover { background: rgba(255,255,255,0.28); color: #fff; }
        .cpm-about-body {
            padding: 24px 28px 22px;
            text-align: center;
        }
        .cpm-about-built-label {
            font-size: 10px;
            font-weight: 700;
            color: #706e6b;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 5px;
        }
        .cpm-about-author {
            font-size: 22px;
            font-weight: 700;
            color: #032d60;
            margin-bottom: 3px;
        }
        .cpm-about-copy {
            font-size: 11.5px;
            color: #9ba8bc;
            margin-bottom: 18px;
        }
        .cpm-about-divider {
            height: 1px;
            background: #eef0f3;
            margin: 0 0 18px;
        }
        .cpm-about-links {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .cpm-about-link {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 13px;
            font-weight: 500;
            border: 1px solid transparent;
            transition: background 0.15s, border-color 0.15s, transform 0.1s;
        }
        .cpm-about-link:hover { transform: translateY(-1px); }
        .cpm-about-link-li { background:#0a66c2; color:#fff; }
        .cpm-about-link-li:hover { background:#004182; }
        .cpm-about-link-web { background:#f3f6fb; border-color:#d0dae8; color:#0176d3; }
        .cpm-about-link-web:hover { background:#e8f0fa; border-color:#0176d3; }
        .cpm-about-link-gh { background:#f6f8fa; border-color:#d0d7de; color:#24292f; }
        .cpm-about-link-gh:hover { background:#eaeef2; border-color:#9ba3ab; }

        /* Action Buttons - SLDS-style */
        .cpm-actions {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .cpm-action-btn {
            padding: 5px 10px;
            border: 1px solid #c9c9c9;
            background: #ffffff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 400;
            color: #080707;
            white-space: nowrap;
            transition: border-color 0.15s, background 0.15s, color 0.15s;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .cpm-action-btn svg { flex-shrink: 0; width: 14px; height: 14px; }

        .cpm-action-btn:hover {
            border-color: #0176d3;
            color: #0176d3;
            background: #f3f9ff;
        }

        .cpm-action-btn.unpublish-btn {
            color: #c23934;
            border-color: #e0b4b4;
            background: #fef5f5;
        }
        .cpm-action-btn.unpublish-btn:hover {
            border-color: #c23934;
            background: #fdeaea;
            color: #a61b15;
        }

        .cpm-action-btn.publish-btn {
            color: #2e844a;
            border-color: #b8d4be;
            background: #f3faf4;
        }
        .cpm-action-btn.publish-btn:hover {
            border-color: #2e844a;
            background: #e8f4ea;
            color: #1e5c32;
        }

        /* Download Icon */
        .cpm-download-icon {
            transition: all 0.2s ease;
        }

        .cpm-download-icon:hover {
            transform: scale(1.15);
            opacity: 0.7;
        }

        /* Checkbox - fully custom (appearance:none bypasses browser white) */
        .page-select-checkbox, #cpm-select-all {
            -webkit-appearance: none;
            appearance: none;
            cursor: pointer;
            width: 15px;
            height: 15px;
            border: 1.5px solid #b8c0cc;
            border-radius: 3px;
            background: #ffffff;
            position: relative;
            flex-shrink: 0;
            transition: background 0.12s, border-color 0.12s;
            vertical-align: middle;
        }
        .page-select-checkbox:checked, #cpm-select-all:checked {
            background: #0176d3;
            border-color: #0176d3;
        }
        .page-select-checkbox:checked::after, #cpm-select-all:checked::after {
            content: '';
            position: absolute;
            left: 4px;
            top: 1px;
            width: 4px;
            height: 8px;
            border: 2px solid #fff;
            border-top: none;
            border-left: none;
            transform: rotate(45deg);
        }
        .page-select-checkbox:indeterminate, #cpm-select-all:indeterminate {
            background: #0176d3;
            border-color: #0176d3;
        }
        .page-select-checkbox:indeterminate::after, #cpm-select-all:indeterminate::after {
            content: '';
            position: absolute;
            left: 2px;
            top: 5px;
            width: 8px;
            height: 2px;
            background: #fff;
        }
        /* Dark mode checkboxes */
        #cloudpages-manager.cpm-dark .page-select-checkbox,
        #cloudpages-manager.cpm-dark #cpm-select-all {
            background: #161b22;
            border-color: #30363d;
        }
        #cloudpages-manager.cpm-dark .page-select-checkbox:checked,
        #cloudpages-manager.cpm-dark #cpm-select-all:checked {
            background: #388bfd;
            border-color: #388bfd;
        }
        #cloudpages-manager.cpm-dark .page-select-checkbox:indeterminate,
        #cloudpages-manager.cpm-dark #cpm-select-all:indeterminate {
            background: #388bfd;
            border-color: #388bfd;
        }

        /* Pagination - SLDS */
        #cpm-pagination {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #f3f3f3;
            border-top: 1px solid #e5e5e5;
            border-radius: 0 0 4px 4px;
        }

        .cpm-pagination-info {
            font-size: 13px;
            color: #706e6b;
            font-weight: 400;
        }

        .cpm-pagination-buttons {
            display: flex;
            gap: 4px;
            align-items: center;
        }

        .cpm-page-btn {
            padding: 6px 12px;
            border: 1px solid #c9c9c9;
            background: #ffffff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 400;
            color: #080707;
            transition: border-color 0.15s, background 0.15s;
            min-width: 36px;
        }

        .cpm-page-btn:hover:not(:disabled) {
            border-color: #0176d3;
            color: #0176d3;
            background: #f3f9ff;
        }

        .cpm-page-btn.active {
            background: #0176d3;
            border-color: #0176d3;
            color: #ffffff;
            font-weight: 400;
        }

        .cpm-page-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .cpm-page-ellipsis {
            padding: 0 4px;
            color: #9ca3af;
        }

        /* Skeleton Loading Rows */
        .cpm-skeleton-row td {
            padding: 12px !important;
        }

        /* Skeleton rows — animated via a translating alpha overlay (::after).
           This works regardless of the base color, so light + dark both shimmer
           with the same physics. The old background-position animation was hard
           to see in dark mode no matter what stops we picked. */
        .cpm-skeleton {
            background: #e5e7eb;
            border-radius: 4px;
            height: 14px;
            display: inline-block;
            position: relative;
            overflow: hidden;
        }
        .cpm-skeleton::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg,
                rgba(255, 255, 255, 0) 0%,
                rgba(255, 255, 255, 0.6) 50%,
                rgba(255, 255, 255, 0) 100%);
            transform: translateX(-100%);
            animation: cpm-shimmer-slide 1.4s ease-in-out infinite;
        }

        .cpm-skeleton.id { width: 50px; }
        .cpm-skeleton.name { width: 180px; }
        .cpm-skeleton.folder { width: 120px; }
        .cpm-skeleton.type { width: 80px; height: 24px; border-radius: 12px; }
        .cpm-skeleton.status { width: 90px; height: 24px; border-radius: 12px; }
        .cpm-skeleton.url { width: 200px; }
        .cpm-skeleton.date { width: 80px; }
        .cpm-skeleton.actions { width: 140px; height: 28px; border-radius: 4px; }
        .cpm-skeleton.checkbox { width: 16px; height: 16px; border-radius: 3px; }
        .cpm-skeleton.icon { width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; }

        @keyframes cpm-shimmer-slide {
            0%   { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        /* Keep legacy keyframe alias for anything else that might use it */
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }

        /* Toast Notification */
        #cloudpages-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #111827;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            opacity: 0;
            transform: translateY(100px);
            transition: all 0.3s;
            z-index: 10000001;
            font-size: 13px;
        }

        #cloudpages-toast.show {
            opacity: 1;
            transform: translateY(0);
        }
        
        /* Modified Date Tooltip */
        .cpm-tooltip {
            position: absolute;
            z-index: 9999999;
            background: #1e293b;
            color: #f8fafc;
            padding: 12px 14px;
            border-radius: 8px;
            font-size: 12px;
            line-height: 1.6;
            max-width: 280px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.15s, transform 0.15s;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .cpm-tooltip.show {
            opacity: 1;
            transform: translateY(0);
        }
        
        .cpm-tooltip-arrow {
            position: absolute;
            bottom: -5px;
            left: 50%;
            width: 10px;
            height: 10px;
            background: #1e293b;
            border-right: 1px solid rgba(255, 255, 255, 0.1);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transform: translateX(-50%) rotate(45deg);
        }
        
        .cpm-tooltip-section {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        }
        
        .cpm-tooltip-section:last-child {
            margin-bottom: 0;
        }
        
        .cpm-tooltip-icon {
            color: #94a3b8;
            flex-shrink: 0;
            margin-top: 2px;
        }
        
        .cpm-tooltip-icon svg {
            width: 14px;
            height: 14px;
        }
        
        .cpm-tooltip-content {
            flex: 1;
        }
        
        .cpm-tooltip-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #94a3b8;
            font-weight: 600;
            margin-bottom: 2px;
        }
        
        .cpm-tooltip-value {
            color: #f8fafc;
            font-weight: 500;
        }
        
        .cpm-tooltip-subvalue {
            font-size: 11px;
            color: #cbd5e1;
            margin-top: 2px;
        }

        /* ── Dark Mode ─────────────────────────────────────── */
        #cloudpages-manager.cpm-dark {
            background: #0d1117;
            border-color: #21262d;
        }
        #cloudpages-manager.cpm-dark .cpm-header {
            background: linear-gradient(135deg, #0a2540 0%, #01111f 100%);
            border-bottom: 1px solid #21262d;
        }
        #cloudpages-manager.cpm-dark .cpm-content {
            background: #0d1117;
        }
        #cloudpages-manager.cpm-dark .cpm-section {
            background: #161b22;
            border-color: #21262d;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
        }
        #cloudpages-manager.cpm-dark .cpm-section:hover {
            border-color: #2c333d;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4);
        }
        #cloudpages-manager.cpm-dark .cpm-section-title {
            color: #8b949e;
            border-bottom-color: #21262d;
        }
        #cloudpages-manager.cpm-dark .cpm-section-title::before {
            background: linear-gradient(180deg, #4d8eff 0%, #58a6ff 100%);
        }
        #cloudpages-manager.cpm-dark .cpm-stats-grid {
            border-color: #21262d;
        }
        #cloudpages-manager.cpm-dark .cpm-stat {
            background: #161b22;
            border-color: #21262d;
        }
        #cloudpages-manager.cpm-dark .cpm-stat:hover {
            background: #1c2128;
            border-color: #388bfd;
        }
        #cloudpages-manager.cpm-dark .cpm-stat.active {
            background: #0d1b2e;
            border-color: #388bfd;
        }
        #cloudpages-manager.cpm-dark .cpm-stat-label { color: #8b949e; }
        #cloudpages-manager.cpm-dark .cpm-stat-value { color: #e6edf3; }
        #cloudpages-manager.cpm-dark .cpm-stat-scope { color: #6e7681; }
        #cloudpages-manager.cpm-dark .cpm-stat-overview .cpm-stat-scope { color: #4d8eff; }
        #cloudpages-manager.cpm-dark .cpm-stat.active .cpm-stat-scope { color: rgba(255, 255, 255, 0.85); }
        #cloudpages-manager.cpm-dark .cpm-token-badge {
            background: #161b22;
            border-color: #21262d;
            color: #7ee787;
        }
        #cloudpages-manager.cpm-dark .cpm-token-badge.ok {
            color: #3fb950;
            border-color: #1f3a25;
            background: #0e1a13;
        }
        #cloudpages-manager.cpm-dark .cpm-token-badge.stale {
            color: #d29922;
            border-color: #3a2e0e;
            background: #1c1709;
        }
        #cloudpages-manager.cpm-dark .cpm-token-badge.error {
            color: #f85149;
            border-color: #3d1a1a;
            background: #1a1010;
        }
        #cloudpages-manager.cpm-dark .cpm-token-badge.verifying {
            color: #58a6ff;
            border-color: #1a2c4f;
            background: #0d1623;
        }
        #cloudpages-manager.cpm-dark .cpm-token-badge.unknown {
            color: #8b949e;
            border-color: #21262d;
            background: #0d1117;
        }
        #cloudpages-manager.cpm-dark .cpm-token-dot { background: currentColor; }
        #cloudpages-manager.cpm-dark #cpm-recapture-tokens {
            background: none;
            border-color: #30363d;
            color: #8b949e;
        }
        #cloudpages-manager.cpm-dark .cpm-search-bar {
            background: #0d1117;
            border-color: #21262d;
        }
        #cloudpages-manager.cpm-dark #cpm-search-input {
            background: #161b22;
            border-color: #30363d;
            color: #e6edf3;
        }
        #cloudpages-manager.cpm-dark #cpm-search-input::placeholder { color: #484f58; }
        #cloudpages-manager.cpm-dark .cpm-btn {
            background: #0176d3;
            border-color: #0176d3;
            color: #fff;
        }
        #cloudpages-manager.cpm-dark .cpm-btn:hover { background: #0158a4; border-color: #0158a4; }
        /* Brand buttons (Refresh, Export) — muted in dark mode */
        #cloudpages-manager.cpm-dark .cpm-header-btn.cpm-btn-brand {
            background: rgba(255,255,255,0.12);
            color: rgba(255,255,255,0.9);
            border-color: rgba(255,255,255,0.25);
        }
        #cloudpages-manager.cpm-dark .cpm-header-btn.cpm-btn-brand:hover:not(:disabled) {
            background: rgba(255,255,255,0.2);
            color: #ffffff;
            border-color: rgba(255,255,255,0.4);
        }
        /* Table */
        #cloudpages-manager.cpm-dark .cpm-table-container {
            background: #161b22;
            border-color: #21262d;
        }
        #cloudpages-manager.cpm-dark .cpm-table thead th {
            background: #1c2128 !important;
            color: #8b949e !important;
            border-color: #21262d !important;
        }
        #cloudpages-manager.cpm-dark .cpm-table tbody tr {
            background: #0d1117 !important;
        }
        #cloudpages-manager.cpm-dark .cpm-table tbody tr:nth-child(even) {
            background: #111820 !important;
        }
        #cloudpages-manager.cpm-dark .cpm-table tbody tr:hover {
            background: #1c2128 !important;
        }
        #cloudpages-manager.cpm-dark .cpm-table tbody td {
            border-color: #21262d !important;
            color: #c9d1d9 !important;
            background: inherit;
        }
        /* Text elements in table */
        #cloudpages-manager.cpm-dark .cpm-id { color: #58a6ff !important; }
        #cloudpages-manager.cpm-dark .cpm-url { color: #58a6ff !important; }
        #cloudpages-manager.cpm-dark .cpm-url:hover { color: #79b8ff !important; }
        #cloudpages-manager.cpm-dark .cpm-breadcrumb { color: #8b949e !important; }
        #cloudpages-manager.cpm-dark .cpm-modified-date { color: #8b949e; }
        #cloudpages-manager.cpm-dark .cpm-download-icon { color: #8b949e !important; }
        /* Status & type badges — use !important to beat inline styles */
        #cloudpages-manager.cpm-dark .cpm-status.published {
            background: #1a3a2a !important;
            color: #7ee787 !important;
            border-color: #238636 !important;
        }
        #cloudpages-manager.cpm-dark .cpm-status.unpublished {
            background: #2d1515 !important;
            color: #f85149 !important;
            border-color: #da3633 !important;
        }
        #cloudpages-manager.cpm-dark .cpm-status.draft {
            background: #1e1a0e !important;
            color: #e3b341 !important;
            border-color: #9e6a03 !important;
        }
        #cloudpages-manager.cpm-dark .cpm-type {
            background: #1c2128 !important;
            color: #8b949e !important;
            border: 1px solid #30363d !important;
        }
        /* Action buttons */
        #cloudpages-manager.cpm-dark .cpm-action-btn {
            background: #1c2128;
            border-color: #30363d;
            color: #8b949e;
        }
        #cloudpages-manager.cpm-dark .cpm-action-btn:hover {
            background: #21262d;
            color: #e6edf3;
            border-color: #58a6ff;
        }
        /* Pagination container — buttons are themed via inline styles from renderPagination */
        #cloudpages-manager.cpm-dark #cpm-pagination {
            background: #161b22 !important;
            border-color: #21262d !important;
        }
        #cloudpages-manager.cpm-dark .cpm-pagination-info { color: #8b949e; }
        /* Skeleton — dark variant. The base is a deep gray; the shimmer overlay
           below carries the highlight so we get a visible band regardless of theme. */
        #cloudpages-manager.cpm-dark .cpm-skeleton {
            background: #21262d !important;
        }
        #cloudpages-manager.cpm-dark .cpm-skeleton::after {
            background: linear-gradient(90deg,
                rgba(255, 255, 255, 0) 0%,
                rgba(255, 255, 255, 0.12) 50%,
                rgba(255, 255, 255, 0) 100%) !important;
        }
        /* About card */
        #cloudpages-manager.cpm-dark .cpm-about-card {
            background: #161b22;
            border: 1px solid #30363d;
        }
        #cloudpages-manager.cpm-dark .cpm-about-hero {
            background: linear-gradient(135deg, #0a2540 0%, #01111f 100%);
        }
        #cloudpages-manager.cpm-dark .cpm-about-body { background: #161b22; }
        #cloudpages-manager.cpm-dark .cpm-about-built-label { color: #484f58; }
        #cloudpages-manager.cpm-dark .cpm-about-author { color: #e6edf3; }
        #cloudpages-manager.cpm-dark .cpm-about-copy { color: #484f58; }
        #cloudpages-manager.cpm-dark .cpm-about-divider { background: #21262d; }
        #cloudpages-manager.cpm-dark .cpm-about-link-web { background: #1c2128 !important; border-color: #30363d !important; color: #58a6ff !important; }
        #cloudpages-manager.cpm-dark .cpm-about-link-web:hover { background: #21262d !important; border-color: #58a6ff !important; }
        #cloudpages-manager.cpm-dark .cpm-about-link-gh { background: #1c2128 !important; border-color: #30363d !important; color: #c9d1d9 !important; }
        #cloudpages-manager.cpm-dark .cpm-about-link-gh:hover { background: #21262d !important; border-color: #8b949e !important; }
        /* Toggle icons */
        #cloudpages-manager.cpm-dark #cpm-theme-toggle .cpm-icon-sun { display: none; }
        #cloudpages-manager.cpm-dark #cpm-theme-toggle .cpm-icon-moon { display: block !important; }
    `;
    document.head.appendChild(style);
}

// Setup event listeners
function setupEventListeners(pageHookToken, appcoreToken) {
    // Close button - slides panel closed
    document.getElementById('cpm-close-btn')?.addEventListener('click', () => {
        const panel = document.getElementById('cloudpages-manager');
        if (panel) {
            panel.classList.add('minimized');
            window.CPM_STATE.isPanelOpen = false;
        }
    });

    // Dark / Light mode toggle
    const panel = document.getElementById('cloudpages-manager');
    const toggleBtn = document.querySelector('.cpm-toggle-btn');
    const previewPopup = document.getElementById('cpm-url-preview');
    function applyDarkMode(dark) {
        // Update state flag FIRST so isDarkMode() returns correct value during re-renders
        window.CPM_STATE.isDark = dark;
        panel?.classList.toggle('cpm-dark', dark);
        toggleBtn?.classList.toggle('cpm-dark', dark);
        previewPopup?.classList.toggle('cpm-dark', dark);
        // Re-render pagination so inline button styles pick up the new theme
        const s = window.CPM_STATE;
        if (s._paginationPages !== undefined) {
            renderPagination(s._paginationPages, s._paginationTotal);
        }
    }
    chrome.storage.local.get('cpm_dark_mode', (result) => {
        if (result.cpm_dark_mode) applyDarkMode(true);
        else window.CPM_STATE.isDark = false;
    });
    document.getElementById('cpm-theme-toggle')?.addEventListener('click', () => {
        const isDark = !panel?.classList.contains('cpm-dark');
        applyDarkMode(isDark);
        chrome.storage.local.set({ cpm_dark_mode: isDark });
    });
    
    // Clickable stat card filters
    const statsGrid = document.getElementById('cpm-stats-grid');
    if (statsGrid) {
        statsGrid.addEventListener('click', (e) => {
            const statCard = e.target.closest('.cpm-stat[data-filter]');
            if (!statCard) return;
            
            // Update active state visually
            document.querySelectorAll('.cpm-stat').forEach(card => {
                card.classList.remove('active');
            });
            statCard.classList.add('active');
            
            window.CPM_STATE.currentFilter = statCard.dataset.filter;
            window.CPM_STATE.currentPage = 1;
            renderTable();
            // Enrich visible items after filter change
            enrichVisibleItems(appcoreToken);
        });
    }
    
    // Refresh button - re-fetch tokens so badges reflect current state, then load data
    document.getElementById('cpm-refresh')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
            if (response && response.success && response.tokens) {
                const ph = response.tokens.pageHookToken;
                const ac = response.tokens.appcoreToken;
                updateTokenBadges(ph, ac);
                loadAllData(ph, ac);
            } else {
                loadAllData(pageHookToken, appcoreToken);
            }
        });
    });
    
    // Export buttons
    document.getElementById('cpm-export-all-csv')?.addEventListener('click', () => {
        exportAllToCSV();
    });
    // Download All dropdown: toggle menu on trigger click, route on item click.
    const dlTrigger = document.getElementById('cpm-download-all-files');
    const dlMenu = document.getElementById('cpm-download-all-menu');
    if (dlTrigger && dlMenu) {
        dlTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = dlMenu.classList.toggle('open');
            dlTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            dlMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
        });
        dlMenu.querySelectorAll('.cpm-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = item.dataset.mode || 'all-tree';
                dlMenu.classList.remove('open');
                dlTrigger.setAttribute('aria-expanded', 'false');
                dlMenu.setAttribute('aria-hidden', 'true');
                downloadAllFiles(mode);
            });
        });
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (dlMenu.classList.contains('open') && !dlMenu.contains(e.target) && e.target !== dlTrigger) {
                dlMenu.classList.remove('open');
                dlTrigger.setAttribute('aria-expanded', 'false');
                dlMenu.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // About button handlers
    document.getElementById('cpm-about-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('cpm-about-modal');
        if (modal) { modal.style.display = 'flex'; }
    });
    document.getElementById('cpm-about-close')?.addEventListener('click', () => {
        const modal = document.getElementById('cpm-about-modal');
        if (modal) { modal.style.display = 'none'; }
    });
    document.getElementById('cpm-about-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('cpm-about-modal')) {
            e.target.style.display = 'none';
        }
    });
    
    // Select all checkbox
    document.getElementById('cpm-select-all')?.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.page-select-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const id = cb.dataset.id;
            if (e.target.checked) {
                window.CPM_STATE.selectedPages.add(id);
            } else {
                window.CPM_STATE.selectedPages.delete(id);
            }
        });
        updateBulkActions();
    });
    
    // Bulk unpublish
    document.getElementById('cpm-batch-unpublish')?.addEventListener('click', () => {
        bulkUnpublish(appcoreToken);
    });
    
    // Bulk publish
    document.getElementById('cpm-batch-publish')?.addEventListener('click', () => {
        bulkPublish(appcoreToken);
    });
    
    // Batch move (DEBUG VERSION)
    // ---- v8: Column sorting ----
    document.getElementById('cpm-table')?.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort-col]');
        if (!th) return;
        const col = th.dataset.sortCol;
        if (window.CPM_STATE.sortColumn === col) {
            window.CPM_STATE.sortDirection = window.CPM_STATE.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            window.CPM_STATE.sortColumn = col;
            window.CPM_STATE.sortDirection = 'asc';
        }
        // Update sort icons
        document.querySelectorAll('.cpm-sort-icon').forEach(ic => {
            ic.textContent = ic.dataset.col === col
                ? (window.CPM_STATE.sortDirection === 'asc' ? ' ↑' : ' ↓')
                : '';
        });
        renderTable();
    });

    // ---- v8: Resizable panel ----
    const resizeHandle = document.getElementById('cpm-resize-handle');
    if (resizeHandle) {
        // Load saved width
        chrome.storage.local.get(['cpm_panel_width'], (result) => {
            if (result.cpm_panel_width) {
                document.getElementById('cloudpages-manager').style.width = result.cpm_panel_width;
            }
        });
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const panel = document.getElementById('cloudpages-manager');
            const startWidth = panel.offsetWidth;
            // Prevent text selection and iframe event interference during drag
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
            const panelInner = panel.querySelector('.cpm-content');
            if (panelInner) panelInner.style.pointerEvents = 'none';
            function onMove(ev) {
                const newWidth = Math.max(400, Math.min(window.innerWidth - 100, startWidth - (ev.clientX - startX)));
                panel.style.width = newWidth + 'px';
            }
            function onUp() {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                document.body.style.userSelect = '';
                document.body.style.webkitUserSelect = '';
                if (panelInner) panelInner.style.pointerEvents = '';
                const w = document.getElementById('cloudpages-manager').style.width;
                chrome.storage.local.set({ cpm_panel_width: w });
            }
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    // ---- v8: Keyboard shortcut - Escape closes panel ----
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const panel = document.getElementById('cloudpages-manager');
        if (!panel || panel.classList.contains('minimized')) return;
        panel.classList.add('minimized');
        window.CPM_STATE.isPanelOpen = false;
    });

    document.getElementById('cpm-recapture-tokens')?.addEventListener('click', () => {
        const currentStack = window.CPM_STATE.stack;
        // (notification removed: re-capturing info)
        injectTokenCaptureIframes(currentStack, function(ph, ac) {
            if (ph && ac) {
                updateTokenBadges(ph, ac);
                showNotification('Tokens captured successfully', 'success');
                // Reload data with fresh tokens
                loadAllData(ph, ac, 0);
            } else {
                showNotification('Token capture failed. Please navigate to Content Builder and CloudPages manually.', 'error');
            }
        });
    });

    document.getElementById('cpm-batch-move')?.addEventListener('click', () => {
        batchMoveDebug(pageHookToken);
    });
    
    // Pagination (delegated)
    document.getElementById('cpm-pagination')?.addEventListener('click', (e) => {
        const pageBtn = e.target.closest('.cpm-page-btn');
        if (pageBtn && !pageBtn.disabled) {
            const page = parseInt(pageBtn.dataset.page);
            if (!isNaN(page) && page > 0) {
                if (window.CPM_STATE.isSearchMode && window.CPM_STATE.currentSearchTerm) {
                    window.CPM_STATE.currentPage = page;
                    performEnhancedSearch(window.CPM_STATE.currentSearchTerm);
                } else {
                    // Normal mode: fetch this page from API (only current page is in memory)
                    loadPage(page);
                }
                document.querySelector('.cpm-table-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
    
    // Search input with Enter key
    document.getElementById('cpm-search-input')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            const searchTerm = e.target.value.trim();
            performEnhancedSearch(searchTerm);
        }
    });
    
    // Search button click
    document.getElementById('cpm-search-btn')?.addEventListener('click', () => {
        const searchTerm = document.getElementById('cpm-search-input')?.value.trim();
        performEnhancedSearch(searchTerm);
    });

    // URL preview popup (iframe — loads live published page)
    let previewTimeout = null;
    const previewEl = document.getElementById('cpm-url-preview');
    const previewIframe = document.getElementById('cpm-preview-iframe');
    const previewLabel = document.getElementById('cpm-preview-url-label');
    const previewMsg = document.getElementById('cpm-preview-msg');

    function showPreviewPopup(link) {
        const href = link.getAttribute('href');
        if (!href) return;

        // Only show preview for landing pages (not code resources)
        const row = link.closest('tr');
        if (row?.dataset.itemType !== 'landing') return;

        // Position popup above the link, avoid screen edge clipping
        const rect = link.getBoundingClientRect();
        const popupW = 480, popupH = 316;
        let left = rect.left;
        let top = rect.top - popupH - 8;
        if (left + popupW > window.innerWidth - 10) left = window.innerWidth - popupW - 10;
        if (left < 8) left = 8;
        if (top < 8) top = rect.bottom + 8;

        previewEl.style.left = left + 'px';
        previewEl.style.top = top + 'px';
        previewEl.style.display = 'block';
        requestAnimationFrame(() => previewEl.classList.add('visible'));

        const shortUrl = href.length > 55 ? href.substring(0, 55) + '…' : href;
        previewLabel.textContent = shortUrl;

        // Load URL in iframe — show loading msg until loaded
        previewMsg.style.display = 'flex';
        previewMsg.textContent = 'Loading preview…';
        previewIframe.src = href;
        previewIframe.addEventListener('load', function onLoad() {
            previewMsg.style.display = 'none';
            previewIframe.removeEventListener('load', onLoad);
        }, { once: true });
    }

    document.getElementById('cpm-table-body')?.addEventListener('mouseover', (e) => {
        const link = e.target.closest('.cpm-url');
        if (!link) return;
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(() => showPreviewPopup(link), 350);
    });

    document.getElementById('cpm-table-body')?.addEventListener('mouseout', (e) => {
        const link = e.target.closest('.cpm-url');
        if (!link) return;
        clearTimeout(previewTimeout);
        previewEl.classList.remove('visible');
        setTimeout(() => {
            if (!previewEl.classList.contains('visible')) {
                previewEl.style.display = 'none';
                previewIframe.src = '';
            }
        }, 200);
    });
}

// Enhanced search with proper query endpoint - LOAD ONE PAGE AT A TIME
async function performEnhancedSearch(searchTerm) {
    if (!searchTerm.trim()) {
        // Reset to normal 100-items-per-page mode
        window.CPM_STATE.isSearchMode = false;
        window.CPM_STATE.currentSearchTerm = '';
        window.CPM_STATE.itemsPerPage = 100;
        window.CPM_STATE.currentPage = 1;
        window.CPM_STATE.currentFilter = 'all';

        // Clear search input visually
        const searchInput = document.getElementById('cpm-search-input');
        if (searchInput) searchInput.value = '';

        // Reset active filter pill
        document.querySelectorAll('.cpm-stat').forEach(c => c.classList.remove('active'));
        document.querySelector('.cpm-stat[data-filter="all"]')?.classList.add('active');

        showLoading(true);
        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
            if (response && response.success) {
                loadAllData(response.tokens.pageHookToken, response.tokens.appcoreToken);
            }
        });
        return;
    }

    // Store search term for pagination
    window.CPM_STATE.currentSearchTerm = searchTerm;
    
    // Use 20 items per page in search mode (like platform)
    window.CPM_STATE.itemsPerPage = 20;

    showLoading(true);
    try {
        console.log(`[CloudPage Maestro] Enhanced search: "${searchTerm}"`);

        // Build search query with boost scoring
        const searchQuery = buildSearchOrTree(searchTerm);
        const assetTypeIds = [240, 241, 242, 243, 244, 245, 247, 248, 249];
        
        const query = {
            leftOperand: searchQuery,
            logicalOperator: 'AND',
            rightOperand: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds }
        };

        const payload = {
            page: { pageSize: window.CPM_STATE.itemsPerPage, page: window.CPM_STATE.currentPage },
            // No sort in search mode - preserve API boost scoring order
            query,
            fields: ['assetType', 'category', 'createdDate', 'createdBy', 'customerKey', 'id', 'modifiedDate', 'modifiedBy', 'name', 'meta', 'status']
        };

        const stack = window.CPM_STATE.stack || getStack();
        // Cookie-only proxy: /cloud/fuelapi/ accepts the user's session cookie, no CSRF needed.
        const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/query?scope=ours`;

        // Fetch tokens only for badge display — the cookie-only proxy doesn't need them.
        const tokenResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve);
        });
        const ph = tokenResponse?.tokens?.pageHookToken ?? null;
        const ac = tokenResponse?.tokens?.appcoreToken ?? null;
        updateTokenBadges(ph, ac);

        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: url,
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json;datekind=local'
                    },
                    body: JSON.stringify(payload)
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : 'Search request failed'));
                }
            });
        });

        const allSearchResults = response.items || [];
        window.CPM_STATE.assetsTotalCount = Number(response.count || response.totalCount || 0);

        console.log(`[CloudPage Maestro] Search page ${window.CPM_STATE.currentPage}: ${allSearchResults.length} items of ${window.CPM_STATE.assetsTotalCount} total`);

        // Build category tree for folder path resolution
        window.CPM_STATE.allAssetsForCategories = allSearchResults;
        await buildCategoryTree(tokenResponse.tokens.pageHookToken);

        // Separate landing pages from code resources
        window.CPM_STATE.landingPages = [];
        window.CPM_STATE.allAssets = [];
        
        allSearchResults.forEach(asset => {
            const isLandingPage = asset.assetType?.id === 247 || asset.assetType?.name?.toLowerCase() === 'landingpage';
            
            window.CPM_STATE.allAssets.push(asset);
            
            if (isLandingPage) {
                window.CPM_STATE.landingPages.push({
                    landingPageId: asset.id,
                    name: asset.name,
                    status: asset.status,
                    siteAssetId: asset.id,
                    url: asset.status?.url || null,
                    pageId: null,
                    modifiedDate: asset.modifiedDate,
                    createdDate: asset.createdDate,
                    categoryId: asset.category?.id
                });
            }
        });

        window.CPM_STATE.isSearchMode = true;
        window.CPM_STATE.totalFilteredItems = window.CPM_STATE.assetsTotalCount;

        console.log(`[CloudPage Maestro] Search results: ${window.CPM_STATE.landingPages.length} landing pages + ${window.CPM_STATE.allAssets.length - window.CPM_STATE.landingPages.length} code resources`);

        // Show results immediately
        renderTable();
        updateStats();
        showLoading(false);
        // (notification removed: search enriching info)

        // Start enrichment for search results
        console.log('[CloudPage Maestro] Starting enrichment for search results...');
        enrichVisibleItems(tokenResponse.tokens.appcoreToken);

    } catch (error) {
        console.error('[CloudPage Maestro] Search error:', error);
        showNotification('Search failed: ' + error.message, 'error');
        showLoading(false);
    }
}

// Load all data
async function loadAllData(pageHookToken, appcoreToken, retryCount = 0) {
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        showNotification('Error: Could not determine SFMC stack', 'error');
        return;
    }
    
    // Cookie-only proxy: pageHookToken is no longer required for Content Builder reads.
    // Proceed immediately — if session cookies are invalid, the API call itself will surface 401.

    showLoading(true);
    updateTokenBadges(pageHookToken, appcoreToken);

    // Clear enrichment cache on refresh to get fresh status
    window.CPM_STATE.enrichmentCache.clear();
    console.log('[CloudPage Maestro] Cleared enrichment cache for fresh data');
    
    try {
        console.log('[CloudPage Maestro] Parallel-fetching Content Builder page 1 + V2 landing-pages API...');

        // Parallel fetch: Content Builder API (page 1, 100 items) + V2 all-landing-pages
        const [cbResult, v2Entities] = await Promise.all([
            fetchCloudPagesAPI(stack, pageHookToken, 1, 100),
            fetchLandingPagesV2(stack, appcoreToken)
        ]);

        const allContentBuilderAssets = cbResult.items || [];
        const totalCount = cbResult.totalCount || allContentBuilderAssets.length || 0;
        window.CPM_STATE.assetsTotalCount = totalCount > 0 ? totalCount : allContentBuilderAssets.length;
        console.log('[CloudPage Maestro] CB:', allContentBuilderAssets.length, 'items (total', totalCount, ') | V2:', v2Entities.length, 'landing pages');

        // Build V2 lookup map: siteAssetId → V2 entity
        const v2Map = new Map();
        v2Entities.forEach(e => v2Map.set(e.siteAssetId, e));

        // Build landing page items with V2 enrichment applied immediately
        const cbLandingPages = allContentBuilderAssets.filter(asset =>
            asset.assetType?.name?.toLowerCase() === 'landingpage'
        );
        const landingPageItems = cbLandingPages.map(cbAsset => {
            const v2 = v2Map.get(cbAsset.id);
            return {
                id: cbAsset.id,
                pageId: v2?.pageId || null,
                name: cbAsset.name,
                assetType: cbAsset.assetType,
                // V2 provides status/url/siteId directly — no per-item enrichment needed
                status: v2?.status || 'Loading...',
                url: v2?.url || null,
                siteId: v2?.landingPageId || null,   // landingPageId = ID used in publish/unpublish URL
                modifiedDate: cbAsset.modifiedDate,
                createdDate: cbAsset.createdDate,
                modifiedBy: cbAsset.modifiedBy,
                createdBy: cbAsset.createdBy,
                category: cbAsset.category,
                customerKey: cbAsset.customerKey,
                meta: cbAsset.meta,
                thumbnailAssetId: v2?.thumbnailAssetId || null,
                isV2Enriched: !!v2   // flag: skip per-item enrichment for this item
            };
        });

        const codeResourceItems = allContentBuilderAssets.filter(asset => {
            const typeName = asset.assetType?.name?.toLowerCase() || '';
            return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource'].includes(typeName);
        }).map(asset => ({
            ...asset,
            status: asset.status?.status || 'Draft',
            url: null,
            pageId: null,
            isV2Enriched: false
        }));

        window.CPM_STATE.allAssets = [...landingPageItems, ...codeResourceItems];
        window.CPM_STATE.landingPages = landingPageItems;
        window.CPM_STATE.allAssetsForCategories = allContentBuilderAssets;
        window.CPM_STATE.currentPage = 1;

        console.log('[CloudPage Maestro] Showing', window.CPM_STATE.allAssets.length, 'items (1-' + window.CPM_STATE.allAssets.length + ' of ' + totalCount + ')');

        // Build category tree
        await buildCategoryTree(pageHookToken);

        // Update stats and render
        updateStats();
        renderTable();

        // Progressive reveal — V2 returns everything at once but it's nicer UX
        // to see rows light up in waves rather than all 100 punching in instantly.
        progressiveReveal();

        // Enrich code resources + any landing pages that didn't match V2 (graceful fallback)
        const needsEnrichment = window.CPM_STATE.allAssets.some(item => !item.isV2Enriched);
        if (needsEnrichment) {
            console.log('[CloudPage Maestro] Starting enrichment for code resources / unmatched landing pages...');
            enrichVisibleItems(appcoreToken);
        }

        // Hide loading
        showLoading(false);
        
    } catch (error) {
        console.error('[CloudPage Maestro] Error loading data:', error);
        
        // If we get EBADCSRFTOKEN and haven't retried too many times, try refreshing the token
        if (error.message.includes('EBADCSRFTOKEN') && retryCount < 3) {
            console.warn('[CloudPage Maestro] Invalid token, attempting to refresh... (attempt', retryCount + 1, 'of 3)');
            showNotification('Authentication expired, refreshing token...', 'warning');
            
            // Wait a bit longer and try to get a fresh token
            setTimeout(() => {
                chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
                    if (response && response.success && response.tokens.pageHookToken) {
                        console.log('[CloudPage Maestro] Got refreshed token, retrying...');
                        loadAllData(response.tokens.pageHookToken, response.tokens.appcoreToken, retryCount + 1);
                    } else {
                        showNotification('Token refresh failed. Please navigate to Content Builder and try again.', 'error');
                        showLoading(false);
                    }
                });
            }, 3000);
        } else {
            showNotification('Error loading data: ' + error.message + '. Try refreshing the page.', 'error');
            showLoading(false);
        }
    }
}

// Load a single page from the API (used when user clicks page 2, 3, etc.) - keeps memory small
async function loadPage(page) {
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        showNotification('Error: Could not determine SFMC stack', 'error');
        return;
    }
    // Cookie-only proxy: tokens fetched only for badge display, not required for reads.
    const tokenResponse = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve));
    const ph = tokenResponse?.tokens?.pageHookToken ?? null;
    const ac = tokenResponse?.tokens?.appcoreToken ?? null;
    updateTokenBadges(ph, ac);
    const pageHookToken = ph;
    const appcoreToken = ac;

    showLoading(true);
    try {
        const result = await fetchCloudPagesAPI(stack, pageHookToken, page, 100);
        const allContentBuilderAssets = result.items || [];
        if (result.totalCount != null) window.CPM_STATE.assetsTotalCount = result.totalCount;

        const cbLandingPages = allContentBuilderAssets.filter(asset =>
            asset.assetType?.name?.toLowerCase() === 'landingpage'
        );
        const landingPageItems = cbLandingPages.map(cbAsset => ({
            id: cbAsset.id,
            pageId: null,
            name: cbAsset.name,
            assetType: cbAsset.assetType,
            status: cbAsset.status?.status || 'Draft',
            url: null,
            modifiedDate: cbAsset.modifiedDate,
            createdDate: cbAsset.createdDate,
            modifiedBy: cbAsset.modifiedBy,
            createdBy: cbAsset.createdBy,
            category: cbAsset.category,
            customerKey: cbAsset.customerKey,
            meta: cbAsset.meta
        }));
        const codeResourceItems = allContentBuilderAssets.filter(asset => {
            const typeName = asset.assetType?.name?.toLowerCase() || '';
            return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource'].includes(typeName);
        }).map(asset => ({
            ...asset,
            status: asset.status?.status || 'Draft',
            url: null,
            pageId: null
        }));

        window.CPM_STATE.allAssets = [...landingPageItems, ...codeResourceItems];
        window.CPM_STATE.landingPages = landingPageItems;
        window.CPM_STATE.allAssetsForCategories = allContentBuilderAssets;
        window.CPM_STATE.currentPage = page;

        await buildCategoryTree(pageHookToken);
        updateStats();
        renderTable();
        enrichVisibleItems(appcoreToken);
    } catch (error) {
        console.error('[CloudPage Maestro] loadPage error:', error);
        showNotification('Failed to load page: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Extract stack from URL
function getStack() {
    const match = window.location.href.match(/mc\.([^.]+)\.exacttarget\.com/);
    return match ? match[1] : null;
}

// Fetch landing pages from CloudPages API (gives correct status and URL)
// Cookie-only proxy: appcoreToken no longer required; param kept for back-compat.
async function fetchLandingPagesAPI(stack, appcoreToken, page = 1, pageSize = 100) {
    if (!stack) {
        return { items: [], totalCount: 0, hasMore: false };
    }

    const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/landing-pages?$page=${page}&$pageSize=${pageSize}&$orderBy=modifiedDate desc`;

    console.log('[CloudPage Maestro] Fetching CloudPages API page', page, '(cookie-only)');

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[CloudPage Maestro] CloudPages API error:', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                const data = response.data;
                const items = data.items || [];
                console.log('[CloudPage Maestro] CloudPages API page', page, 'returned', items.length, 'items');
                resolve({
                    items: items,
                    totalCount: Number(data.count || items.length),
                    hasMore: items.length === pageSize
                });
            } else {
                console.error('[CloudPage Maestro] CloudPages API failed:', response ? response.error : 'Request failed');
                // Don't reject, return empty to allow Content Builder data to load
                resolve({ items: [], totalCount: 0, hasMore: false });
            }
        });
    });
}

// Enrich landing pages with data from sites endpoint
async function enrichLandingPagesFromSites(landingPageItems, appcoreToken, stack) {
    if (!appcoreToken || landingPageItems.length === 0) return;
    
    console.log('[CloudPage Maestro] Enriching', landingPageItems.length, 'landing pages from sites endpoint...');
    
    // Fetch sites data in batches (small batch size to avoid rate limits)
    const batchSize = 10;
    let enriched = 0;
    let failed = 0;
    
    for (let i = 0; i < landingPageItems.length; i += batchSize) {
        const batch = landingPageItems.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (item) => {
            try {
                const siteData = await fetchSiteDetails(item.id, appcoreToken, stack);
                if (siteData) {
                    item.pageId = siteData.id;
                    item.status = siteData.status || item.status;
                    item.url = siteData.url || item.url;
                    enriched++;
                    console.log('[CloudPage Maestro] ✓ Enriched', item.name, '- Status:', item.status, 'PageID:', item.pageId, 'URL:', siteData.url);
                } else {
                    failed++;
                    console.warn('[CloudPage Maestro] ✗ No site data for', item.name, '(assetId:', item.id, ')');
                }
            } catch (error) {
                console.warn('[CloudPage Maestro] Failed to enrich asset', item.id, ':', error.message);
                failed++;
            }
        }));
        
        console.log('[CloudPage Maestro] Batch', Math.floor(i / batchSize) + 1, 'complete:', enriched, 'enriched,', failed, 'failed');
    }
    
    console.log('[CloudPage Maestro] Enrichment complete:', enriched, 'enriched,', failed, 'failed, out of', landingPageItems.length, 'landing pages');
}

// Fetch individual site details using siteAssetId parameter
// Cookie-only proxy: appcoreToken param kept for back-compat, not required.
async function fetchSiteDetails(assetId, appcoreToken, stack) {
    const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[CloudPage Maestro] fetchSiteDetails chrome error:', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                const data = response.data;
                // CloudPages API returns 'entities' not 'items'
                const entities = data.entities || [];
                if (entities.length > 0) {
                    const site = entities[0];
                    resolve({
                        id: site.defaultPageId || site.siteId,
                        status: site.status || 'Draft',
                        url: site.url || null,
                        siteId: site.siteId,
                        defaultPageId: site.defaultPageId
                    });
                } else {
                    // No site entity found for this asset
                    resolve(null);
                }
            } else {
                console.warn('[CloudPage Maestro] fetchSiteDetails failed for asset', assetId, response?.error);
                resolve(null);
            }
        });
    });
}

/**
 * Surgically update only the Status, URL, and Actions cells of a row that was
 * just enriched — WITHOUT touching or rebuilding any other cells.
 * This keeps the iframe preview stable and prevents hover interruption.
 */
function patchEnrichedRow(item) {
    const row = document.querySelector(`#cpm-table-body tr[data-item-id="${item.id}"]`);
    if (!row) return;

    const cells = row.querySelectorAll('td');
    if (cells.length < 9) return;

    const status = typeof item.status === 'object'
        ? (item.status?.status || 'Draft')
        : (item.status || 'Draft');
    const itemUrl = item.url || null;
    const itemType = item.assetType?.name?.toLowerCase() || 'landingpage';
    const hasSiteId = item.siteId !== null && item.siteId !== undefined;
    const canPublish = hasSiteId && status !== 'Published';
    const canUnpublish = hasSiteId && status === 'Published';
    const statusInfo = getStatusInfo(status);

    // Cell 5 (index 5): Status
    cells[5].innerHTML = `<span class="cpm-status ${status.toLowerCase() === 'published' ? 'published' : (status.toLowerCase() === 'unpublished' ? 'unpublished' : 'draft')}">${statusInfo.icon}${status}</span>`;

    // Cell 6 (index 6): URL
    cells[6].innerHTML = itemUrl
        ? `<a href="${itemUrl}" target="_blank" class="cpm-url">${itemUrl.length > 35 ? itemUrl.substring(0, 35) + '...' : itemUrl}</a>`
        : '<span style="color: #9ca3af;">N/A</span>';

    // Cell 8 (index 8): Actions
    cells[8].innerHTML = `<div class="cpm-actions">
        ${canUnpublish ? `<button class="cpm-action-btn unpublish-btn" data-action="unpublish" data-id="${item.id}" data-assetid="${item.id}" data-pageid="${item.pageId || ''}" data-siteid="${item.siteId || ''}" data-type="${itemType}" title="Unpublish">${ICONS.eyeClosed} Unpublish</button>` : ''}
        ${canPublish ? `<button class="cpm-action-btn publish-btn" data-action="publish" data-id="${item.id}" data-assetid="${item.id}" data-pageid="${item.pageId || ''}" data-siteid="${item.siteId || ''}" data-type="${itemType}" title="Publish">${ICONS.cloudUpload} Publish</button>` : ''}
    </div>`;

    // Keep checkbox data attributes in sync
    const cb = row.querySelector('.page-select-checkbox');
    if (cb) {
        cb.dataset.siteid = item.siteId || '';
        cb.dataset.pageid = item.pageId || '';
        cb.dataset.status = status;
    }
}

// Enrich visible items with status and URL automatically
async function enrichVisibleItems(appcoreToken) {
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        console.warn('[CloudPage Maestro] Cannot enrich: missing stack');
        return;
    }
    if (!appcoreToken) {
        console.warn('[CloudPage Maestro] Cannot enrich: missing appcoreToken');
        showNotification('Missing publish token. Please refresh.', 'warning');
        return;
    }
    
    // Get currently visible items from the table
    const visibleRows = document.querySelectorAll('#cpm-table-body tr[data-item-id]');
    console.log('[CloudPage Maestro] Found', visibleRows.length, 'visible rows in table');
    
    const itemsToEnrich = [];
    
    let cachedCount = 0;

    visibleRows.forEach(row => {
        const itemId = row.dataset.itemId;
        const item = window.CPM_STATE.allAssets.find(a => String(a.id) === String(itemId));
        if (!item) return;

        // Skip landing pages already enriched from the V2 API (loadAllData inline path).
        if (item.isV2Enriched) return;

        const cached = window.CPM_STATE.getCachedEnrichment(parseInt(itemId));
        if (!cached) {
            itemsToEnrich.push(item);
            return;
        }

        // Apply cached data to the item AND patch the DOM row immediately.
        // Previously the patch only ran in the "all items cached" early-return,
        // so partially-cached searches (some items cached, some new) left the
        // cached rows un-enriched in the DOM until the user clicked Refresh.
        // Repro: search "abc" -> all enrich. Search "abcd" -> overlapping items
        // are cache hits and stayed un-enriched until cache was cleared.
        item.siteId = cached.siteId;
        item.pageId = cached.pageId;
        item.status = cached.status;
        item.url = cached.url;
        patchEnrichedRow(item);
        cachedCount++;
    });

    console.log('[CloudPage Maestro] Enriching', itemsToEnrich.length, 'visible items (', cachedCount, 'from cache, already patched)');

    if (itemsToEnrich.length === 0) {
        console.log('[CloudPage Maestro] All visible items already enriched');
        return;
    }
    
    // Increment enrichment session to cancel any stale requests
    window.CPM_STATE.currentEnrichmentSession++;
    const currentSession = window.CPM_STATE.currentEnrichmentSession;
    
    // Process items in concurrent batches — was sequential (one fetch at a time),
    // now 10 in-flight simultaneously which collapses ~50s of waiting into ~5s for a full page.
    let enrichedCount = 0;
    const CONCURRENCY = 10;

    const enrichOne = async (item) => {
        try {
            const siteData = await fetchSiteDetails(item.id, appcoreToken, stack);
            if (siteData) {
                item.siteId = siteData.siteId;
                item.pageId = siteData.id;
                item.status = siteData.status;
                item.url = siteData.url;
                window.CPM_STATE.setCachedEnrichment(item.id, {
                    siteId: siteData.siteId,
                    pageId: siteData.id,
                    status: siteData.status,
                    url: siteData.url
                });
            } else {
                item.status = 'Draft';
                item.siteId = null;
            }
            enrichedCount++;
            patchEnrichedRow(item);
        } catch (error) {
            console.error('[CloudPage Maestro] Error enriching item:', item.name, error);
        }
    };

    for (let i = 0; i < itemsToEnrich.length; i += CONCURRENCY) {
        if (currentSession !== window.CPM_STATE.currentEnrichmentSession) {
            console.log('[CloudPage Maestro] Enrichment session cancelled');
            return;
        }
        const slice = itemsToEnrich.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(enrichOne));
    }

    if (enrichedCount > 0) {
        console.log('[CloudPage Maestro] Enrichment complete:', enrichedCount, 'items enriched (concurrency:', CONCURRENCY, ')');
    }
}

// Fetch CloudPages via Content Builder API (landing pages + code resources only)
// v8 fix: query only the 5 types we actually display so totalCount is accurate for pagination
async function fetchCloudPagesAPI(stack, token, page = 1, pageSize = 100) {
    // Cookie-only proxy: /cloud/fuelapi/ accepts the user's session cookie, no CSRF needed.
    // `token` param kept for back-compat with callers; intentionally unused.
    const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/query?scope=ours`;

    // Query all CloudPages asset types by ID (known-working filter).
    // Post-filter in loadAllData/loadPage keeps only landing pages + code resources for display.
    const assetTypeIds = [240, 241, 242, 243, 244, 245, 247, 248, 249];

    const payload = {
        page: { pageSize, page },
        sort: [{ direction: 'desc', property: 'modifiedDate' }],
        query: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds },
        fields: ['assetType', 'category', 'createdDate', 'createdBy', 'customerKey', 'id', 'modifiedDate', 'modifiedBy', 'name', 'meta', 'status']
    };

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json;datekind=local'
                },
                body: JSON.stringify(payload)
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                const data = response.data;
                resolve({
                    items: data.items || [],
                    totalCount: Number(data.count || data.totalCount || 0),
                    hasMore: Number(data.count || data.totalCount || 0) > page * pageSize
                });
            } else {
                reject(new Error(response ? response.error : 'Request failed'));
            }
        });
    });
}

/**
 * Fetch ALL landing pages from the internal V2 CloudPages API in one call.
 * Returns status, URL, siteId (landingPageId), pageId, and thumbnailAssetId
 * for every landing page — eliminating the need for per-item enrichment.
 */
async function fetchLandingPagesV2(stack, appcoreToken) {
    if (!stack) return [];
    // Cookie-only proxy: bulk V2 endpoint, no CSRF needed.
    const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/landing-pages?$page=1&$pageSize=500&$orderBy=modifiedDate%20DESC`;
    try {
        const data = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url,
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                }
            }, (response) => {
                if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                if (response && response.success) resolve(response.data);
                else reject(new Error(response?.error || 'V2 API failed'));
            });
        });
        console.log('[CloudPage Maestro] V2 API: loaded', data?.entities?.length || 0, 'landing pages (total:', data?.totalCount, ')');
        return data?.entities || [];
    } catch (error) {
        console.warn('[CloudPage Maestro] V2 API fetch failed, falling back to enrichment:', error.message);
        return [];
    }
}

/**
 * Fetch the SFMC-generated thumbnail for a landing page and return it as a
 * base64 data URI. Result is cached on item.thumbnailBase64 by the caller.
 */
async function fetchThumbnail(thumbnailAssetId) {
    // Cookie-only proxy: no token gating, session cookie carries auth.
    return new Promise((resolve) => {
        const stack = window.CPM_STATE.stack;
        if (!stack) { resolve(null); return; }
        const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/${thumbnailAssetId}/file`;
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: { url, method: 'GET', headers: {} }
        }, (response) => {
            if (chrome.runtime.lastError || !response?.success) { resolve(null); return; }
            resolve(response.data?.base64 || null);
        });
    });
}

// Progressive row reveal — staggers rows fading in after a render so the page
// feels "alive" instead of punching 100 items in at once. Triggered after the
// initial loadAllData renderTable(); a no-op if the table is empty.
function progressiveReveal() {
    const tbody = document.getElementById('cpm-table-body');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr[data-item-id]'));
    if (rows.length === 0) return;

    // Stage the visible "data" cells (status, url, modified, actions) so they fade
    // in as a unit per row. Cells 0-4 (checkbox, id, name, folder, type) stay
    // visible immediately so users can see structure.
    const ENRICHED_CELL_INDICES = [5, 6, 7, 8];
    rows.forEach(row => {
        ENRICHED_CELL_INDICES.forEach(idx => {
            const cell = row.cells[idx];
            if (!cell) return;
            cell.style.opacity = '0';
            cell.style.transform = 'translateY(2px)';
            cell.style.transition = 'opacity 220ms ease, transform 220ms ease';
        });
    });

    const WAVE_SIZE = 10;
    const WAVE_GAP_MS = 55;
    rows.forEach((row, i) => {
        const delay = Math.floor(i / WAVE_SIZE) * WAVE_GAP_MS;
        setTimeout(() => {
            ENRICHED_CELL_INDICES.forEach(idx => {
                const cell = row.cells[idx];
                if (!cell) return;
                cell.style.opacity = '1';
                cell.style.transform = 'translateY(0)';
            });
        }, delay);
    });
}

// Update token badges with a fast presence-check (synchronous, used inline by callers).
// The real validity check is verifyTokenBadges() which actually hits the server.
//
// Important: we only DOWNGRADE here (mark as error when a token is now missing).
// We never reset a verified 'ok' badge to 'unknown' — that would happen on every
// loadAllData / Refresh and the user would always see gray. Verify owns the
// positive states; this owns the negative ones plus initial seeding.
function updateTokenBadges(pageHookToken, appcoreToken) {
    const pagehookEl = document.getElementById('pagehook-token-status');
    const appcoreEl = document.getElementById('appcore-token-status');
    if (!pagehookEl || !appcoreEl) return;
    const hasPageHook = !!(pageHookToken && pageHookToken.length >= 50);
    const hasAppcore = !!(appcoreToken && appcoreToken.length >= 20);

    // Downgrade on absence
    if (!hasPageHook) setBadgeState(pagehookEl, 'error', 'Session Lost');
    if (!hasAppcore) setBadgeState(appcoreEl, 'error', 'Publish Missing');

    // Seed the badge with 'unknown' only if it currently has no state yet
    // (initial render). Once verifyTokenBadges has run, leave its result alone.
    if (hasPageHook && !pagehookEl.classList.contains('ok') &&
        !pagehookEl.classList.contains('stale') &&
        !pagehookEl.classList.contains('verifying') &&
        !pagehookEl.classList.contains('unknown')) {
        setBadgeState(pagehookEl, 'unknown', 'Session');
    }
    if (hasAppcore && !appcoreEl.classList.contains('ok') &&
        !appcoreEl.classList.contains('stale') &&
        !appcoreEl.classList.contains('verifying') &&
        !appcoreEl.classList.contains('unknown')) {
        setBadgeState(appcoreEl, 'unknown', 'Publish');
    }

    // Coalesce a verify call so the badges drift toward ground truth.
    if ((hasPageHook || hasAppcore) && !window.CPM_STATE._verifyScheduled) {
        window.CPM_STATE._verifyScheduled = true;
        setTimeout(() => {
            window.CPM_STATE._verifyScheduled = false;
            verifyTokenBadges();
        }, 600);
    }
}

// One central place to mutate badge appearance + label
function setBadgeState(el, state, label) {
    el.classList.remove('error', 'ok', 'stale', 'verifying', 'unknown');
    el.classList.add(state);
    const span = el.querySelector('span:last-child');
    if (span) span.textContent = label;
}

// Probe the SFMC session via a cheap cookie-only GET. 200 => session valid.
async function probeSession() {
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) return false;
    const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/categories?categoryType=cloudpages&$page=1&$pagesize=1`;
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: { url, method: 'GET', headers: { 'Accept': 'application/json' } }
        }, (response) => {
            if (chrome.runtime.lastError) { resolve(false); return; }
            resolve(!!(response && response.success));
        });
    });
}

// Probe the appcoreToken with a cheap V2 GET that exercises CSRF auth.
async function probeAppcoreToken(token) {
    if (!token || token.length < 20) return false;
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) return false;
    const url = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages?$page=1&$pageSize=1`;
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: { url, method: 'GET', headers: { 'Accept': 'application/json', 'X-CSRF-Token': token } }
        }, (response) => {
            if (chrome.runtime.lastError) { resolve(false); return; }
            resolve(!!(response && response.success));
        });
    });
}

// Active probe — actually hits the server, updates badges to reflect ground truth.
async function verifyTokenBadges() {
    const pagehookEl = document.getElementById('pagehook-token-status');
    const appcoreEl = document.getElementById('appcore-token-status');
    if (!pagehookEl || !appcoreEl) return;

    setBadgeState(pagehookEl, 'verifying', 'Checking…');
    setBadgeState(appcoreEl, 'verifying', 'Checking…');

    const tokenResp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, r));
    const appcoreToken = tokenResp?.tokens?.appcoreToken || null;

    const [sessionOk, appcoreOk] = await Promise.all([
        probeSession(),
        probeAppcoreToken(appcoreToken)
    ]);

    setBadgeState(pagehookEl, sessionOk ? 'ok' : 'error', sessionOk ? 'Session OK' : 'Session Lost');
    if (appcoreOk) {
        setBadgeState(appcoreEl, 'ok', 'Publish OK');
    } else if (appcoreToken) {
        setBadgeState(appcoreEl, 'stale', 'Publish Stale');
    } else {
        setBadgeState(appcoreEl, 'error', 'Publish Missing');
    }

    return { sessionOk, appcoreOk };
}

// Auth-error detection — anything that looks like the server rejecting our token.
function looksLikeAuthError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return msg.includes('401') || msg.includes('403') || msg.includes('csrf') ||
           msg.includes('forbidden') || msg.includes('unauthorized') || msg.includes('ebadcsrftoken');
}

// Wrap a write operation: on auth failure, re-capture tokens via iframe inject
// and retry once. The operation closure is responsible for fetching the latest
// token on each call (so the retry actually uses the fresh token).
async function withTokenRefreshRetry(operation, opLabel = 'operation') {
    try {
        return await operation();
    } catch (err) {
        if (!looksLikeAuthError(err)) throw err;
        console.warn('[CloudPage Maestro]', opLabel, '→ auth error, refreshing tokens:', err.message);
        showNotification('Publish token expired — refreshing and retrying…', 'warning');
        const stack = window.CPM_STATE.stack || getStack();
        await new Promise((resolve) => {
            injectTokenCaptureIframes(stack, (ph, ac) => {
                if (ph || ac) updateTokenBadges(ph, ac);
                resolve();
            });
        });
        verifyTokenBadges();
        return await operation();
    }
}

// Update stats dashboard
function updateStats(displayedItems = null) {
    const itemsForCount = displayedItems || window.CPM_STATE.allAssets;

    // Compute type counts from current items
    const freshCounts = {
        total: window.CPM_STATE.assetsTotalCount || itemsForCount.length,
        landing: itemsForCount.filter(a => a.assetType?.name?.toLowerCase() === 'landingpage').length,
        json: itemsForCount.filter(a => a.assetType?.name?.toLowerCase() === 'jsoncoderesource').length,
        js: itemsForCount.filter(a => {
            const type = a.assetType?.name?.toLowerCase();
            return type === 'jscoderesource' || type === 'codesnippetblock';
        }).length,
        css: itemsForCount.filter(a => a.assetType?.name?.toLowerCase() === 'csscoderesource').length
    };

    // Persist non-zero type counts so page 2+ stats don't drop to 0
    if (!window.CPM_STATE.cachedTypeCounts) {
        window.CPM_STATE.cachedTypeCounts = freshCounts;
    } else {
        if (freshCounts.landing > 0) window.CPM_STATE.cachedTypeCounts.landing = freshCounts.landing;
        if (freshCounts.json > 0) window.CPM_STATE.cachedTypeCounts.json = freshCounts.json;
        if (freshCounts.js > 0) window.CPM_STATE.cachedTypeCounts.js = freshCounts.js;
        if (freshCounts.css > 0) window.CPM_STATE.cachedTypeCounts.css = freshCounts.css;
        window.CPM_STATE.cachedTypeCounts.total = freshCounts.total;
    }
    const stats = window.CPM_STATE.cachedTypeCounts;
    
    const statTotal = document.getElementById('stat-total');
    const statLanding = document.getElementById('stat-landing');
    const statJson = document.getElementById('stat-json');
    const statJs = document.getElementById('stat-js');
    const statCss = document.getElementById('stat-css');
    
    if (statTotal) statTotal.textContent = stats.total;
    if (statLanding) statLanding.textContent = stats.landing;
    if (statJson) statJson.textContent = stats.json;
    if (statJs) statJs.textContent = stats.js;
    if (statCss) statCss.textContent = stats.css;
}

// Render table
function renderTable() {
    console.log('[CloudPage Maestro] renderTable() called');
    const tbody = document.getElementById('cpm-table-body');
    if (!tbody) {
        console.error('[CloudPage Maestro] Table body not found!');
        return;
    }
    
    console.log('[CloudPage Maestro] Rendering table with', window.CPM_STATE.allAssets.length, 'assets');
    
    // Preserve checkbox state before clearing table
    const previouslyCheckedIds = new Set();
    tbody.querySelectorAll('.page-select-checkbox:checked').forEach(cb => {
        previouslyCheckedIds.add(cb.dataset.id);
    });
    
    tbody.innerHTML = '';
    
    // Get all items (unfiltered) for calculating stats per page
    let allItems = [...window.CPM_STATE.allAssets];
    
    // Calculate unfiltered page items for stats
    let unfilteredPageItems;
    if (window.CPM_STATE.isSearchMode) {
        unfilteredPageItems = allItems;
    } else {
        const startIndex = (window.CPM_STATE.currentPage - 1) * window.CPM_STATE.itemsPerPage;
        unfilteredPageItems = allItems.slice(startIndex, startIndex + window.CPM_STATE.itemsPerPage);
    }
    
    // Filter items based on clickable stat cards
    let items = [...window.CPM_STATE.allAssets];
    
    if (window.CPM_STATE.currentFilter === 'landing') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'landingpage');
    } else if (window.CPM_STATE.currentFilter === 'json') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'jsoncoderesource');
    } else if (window.CPM_STATE.currentFilter === 'javascript') {
        items = items.filter(item => {
            const type = item.assetType?.name?.toLowerCase();
            return type === 'jscoderesource' || type === 'codesnippetblock';
        });
    } else if (window.CPM_STATE.currentFilter === 'css') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'csscoderesource');
    }
    // 'all' filter shows everything (no filtering needed)
    
    // Apply column sort if active
    if (window.CPM_STATE.sortColumn) {
        const col = window.CPM_STATE.sortColumn;
        const dir = window.CPM_STATE.sortDirection === 'asc' ? 1 : -1;
        items.sort((a, b) => {
            let av, bv;
            if (col === 'name') { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); }
            else if (col === 'type') { av = a.assetType?.name || ''; bv = b.assetType?.name || ''; }
            else if (col === 'status') {
                av = typeof a.status === 'string' ? a.status : (a.status?.status || '');
                bv = typeof b.status === 'string' ? b.status : (b.status?.status || '');
            }
            else if (col === 'modifiedDate') { av = a.modifiedDate || ''; bv = b.modifiedDate || ''; }
            else { return 0; }
            return av < bv ? -dir : av > bv ? dir : 0;
        });
    }

    // Pagination - In search mode items are already one page; in normal mode we may have only current page loaded (server-side)
    let paginatedItems;
    let totalPages;
    
    if (window.CPM_STATE.isSearchMode) {
        paginatedItems = items;
        totalPages = Math.ceil(window.CPM_STATE.assetsTotalCount / window.CPM_STATE.itemsPerPage);
    } else {
        const serverSide = window.CPM_STATE.currentFilter === 'all' && window.CPM_STATE.assetsTotalCount > 0 && window.CPM_STATE.allAssets.length <= window.CPM_STATE.itemsPerPage;
        if (serverSide) {
            totalPages = Math.ceil(window.CPM_STATE.assetsTotalCount / window.CPM_STATE.itemsPerPage);
            paginatedItems = items;
        } else {
            totalPages = Math.ceil(items.length / window.CPM_STATE.itemsPerPage);
            const startIndex = (window.CPM_STATE.currentPage - 1) * window.CPM_STATE.itemsPerPage;
            paginatedItems = items.slice(startIndex, startIndex + window.CPM_STATE.itemsPerPage);
        }
    }
    
    // Render rows
    paginatedItems.forEach(item => {
        const row = document.createElement('tr');
        row.setAttribute('data-item-id', item.id);
        
        const isLanding = item.assetType?.name?.toLowerCase() === 'landingpage';
        const itemType = isLanding ? 'landing' : 'asset';
        row.setAttribute('data-item-type', itemType);
        
        // Normalize status - could be:
        // - Direct string like 'Published', 'Unpublished', 'Draft' (from enrichment)
        // - Object like {status: 'Published'} (from CloudPages API)
        // - Object like {name: 'active', id: 2} (from Content Builder API - means not enriched yet)
        let status;
        if (typeof item.status === 'string') {
            status = item.status;
        } else if (item.status?.status) {
            status = item.status.status;
        } else if (item.status?.name) {
            // Content Builder API format - item not enriched yet
            status = 'Loading...';
        } else {
            status = 'Loading...';
        }
        const isEnriched = status !== 'Loading...';
        
        // Get asset type info with icon and color
        const typeInfo = getAssetTypeInfo(item.assetType);
        const folderName = getFolderPath(item.category?.id) || item.category?.name || 'Cloud Pages';
        const modifiedDate = new Date(item.modifiedDate).toLocaleDateString();
        const fullModifiedDate = new Date(item.modifiedDate).toLocaleString();
        
        // Determine which buttons to show based on status and type
        // Show publish/unpublish if we have a valid siteId from CloudPages API (works for all asset types)
        const hasSiteId = item.siteId !== null && item.siteId !== undefined;
        const canPublish = isEnriched && hasSiteId && status !== 'Published';
        const canUnpublish = isEnriched && hasSiteId && status === 'Published';
        
        // Get URL for display
        const itemUrl = item.url || null;
        const pageId = item.pageId || item.id;
        
        // Get status info
        const statusInfo = getStatusInfo(status);
        
        row.innerHTML = `
            <td>
                <input type="checkbox" class="page-select-checkbox" data-id="${item.id}" data-assetid="${item.id}" data-siteid="${item.siteId || ''}" data-pageid="${item.pageId || ''}" data-status="${status}" data-type="${itemType}">
            </td>
            <td>
                <span class="cpm-id" data-action="copy" data-id="${pageId}" title="Click to copy">
                    ${pageId}
                </span>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="cpm-download-icon" data-action="download" data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-assetid="${item.id}" data-type="${itemType}" title="Download ${isLanding ? 'HTML' : 'file'}" style="background: none; border: none; padding: 0; cursor: pointer; color: ${typeInfo.color}; display: flex; align-items: center;">
                        ${ICONS.download}
                    </button>
                    <span>${escapeHtml(item.name)}</span>
                </div>
            </td>
            <td>
                <span class="cpm-breadcrumb" title="${escapeHtml(folderName)}">${escapeHtml(folderName)}</span>
            </td>
            <td>
                <span class="cpm-type" style="background: ${typeInfo.color}22; color: ${typeInfo.color};">
                    ${typeInfo.icon} ${typeInfo.name}
                </span>
            </td>
            <td>
                <span class="cpm-status ${status.toLowerCase() === 'published' ? 'published' : (status.toLowerCase() === 'unpublished' ? 'unpublished' : 'draft')}">
                    ${statusInfo.icon}
                    ${status}
                </span>
            </td>
            <td>
                ${itemUrl ? `<a href="${itemUrl}" target="_blank" class="cpm-url">${itemUrl.length > 35 ? itemUrl.substring(0, 35) + '...' : itemUrl}</a>` : '<span style="color: #9ca3af;">N/A</span>'}
            </td>
            <td>
                <span class="cpm-modified-date" title="${fullModifiedDate}">${modifiedDate}</span>
            </td>
            <td>
                <div class="cpm-actions">
                    ${canUnpublish ? `
                        <button class="cpm-action-btn unpublish-btn" data-action="unpublish" data-id="${item.id}" data-assetid="${item.id}" data-pageid="${item.pageId || ''}" data-siteid="${item.siteId || ''}" data-type="${itemType}" title="Unpublish">
                            ${ICONS.eyeClosed} Unpublish
                        </button>
                    ` : ''}
                    ${canPublish ? `
                        <button class="cpm-action-btn publish-btn" data-action="publish" data-id="${item.id}" data-assetid="${item.id}" data-pageid="${item.pageId || ''}" data-siteid="${item.siteId || ''}" data-type="${itemType}" title="Publish">
                            ${ICONS.cloudUpload} Publish
                        </button>
                    ` : ''}
                    ${!isEnriched ? `
                        <span style="color: #9ca3af; font-size: 11px; font-style: italic;">Enriching...</span>
                    ` : ''}
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    if (paginatedItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;">No items found</td></tr>';
    }
    
    // Restore checkbox selections after rendering
    tbody.querySelectorAll('.page-select-checkbox').forEach(cb => {
        if (previouslyCheckedIds.has(cb.dataset.id)) {
            cb.checked = true;
        }
    });
    
    // Render pagination (use assetsTotalCount only when filter is "all" and we have one page loaded)
    const totalForDisplay = (window.CPM_STATE.currentFilter === 'all' && window.CPM_STATE.assetsTotalCount > 0 && items.length <= window.CPM_STATE.itemsPerPage)
        ? window.CPM_STATE.assetsTotalCount
        : items.length;
    renderPagination(totalPages, totalForDisplay);
    
    // Setup row event listeners - checkboxes
    tbody.querySelectorAll('.page-select-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            if (e.target.checked) {
                window.CPM_STATE.selectedPages.add(id);
            } else {
                window.CPM_STATE.selectedPages.delete(id);
            }
            updateBulkActions();
        });
    });
    
    // ID click to copy
    tbody.querySelectorAll('.cpm-id[data-action="copy"]').forEach(el => {
        el.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            copyToClipboard(id);
            showNotification(`ID ${id} copied to clipboard`, 'success');
        });
    });
    
    // Download icons
    tbody.querySelectorAll('.cpm-download-icon').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const assetId = e.currentTarget.dataset.assetid;
            const name = e.currentTarget.dataset.name;
            const type = e.currentTarget.dataset.type;
            
            if (type === 'landing') {
                downloadLandingPageHTML(assetId, name);
            } else {
                downloadCodeResource(assetId, name, type);
            }
        });
    });
    
    // Action buttons (publish, unpublish) — delegated once on tbody so the handler
    // survives patchEnrichedRow rewriting cells[8].innerHTML after async enrichment.
    // Without this, enriched rows get bare HTML buttons with no click handler.
    if (!tbody.dataset.cpmActionDelegated) {
        tbody.dataset.cpmActionDelegated = '1';
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.cpm-action-btn');
            if (!btn || !tbody.contains(btn)) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const assetId = btn.dataset.assetid;
            const siteId = btn.dataset.siteid;
            const type = btn.dataset.type;
            if (action === 'unpublish') {
                console.log('[CloudPage Maestro] Unpublish clicked - type:', type, 'id:', id, 'assetId:', assetId, 'siteId:', siteId);
                unpublishItem(id, type, assetId, siteId);
            } else if (action === 'publish') {
                console.log('[CloudPage Maestro] Publish clicked - type:', type, 'id:', id, 'assetId:', assetId, 'siteId:', siteId);
                publishItem(id, type, assetId, siteId);
            }
        });
    }
    
    // Setup modified date tooltips
    setupModifiedDateTooltips(paginatedItems);
    
    // Update stats with UNFILTERED page items (so filter counts don't go to 0)
    updateStats(unfilteredPageItems);
}

// Setup modified date tooltips with rich content
function setupModifiedDateTooltips(items) {
    const tbody = document.getElementById('cpm-table-body');
    if (!tbody) return;
    
    // Remove any existing tooltips
    document.querySelectorAll('.cpm-tooltip').forEach(t => t.remove());
    
    items.forEach(item => {
        const row = tbody.querySelector(`tr[data-item-id="${item.id}"]`);
        if (!row) return;
        
        // Find the modified date cell (column 8, index 7)
        const modifiedCell = row.cells[7];
        if (!modifiedCell) return;
        
        // Get time data
        const modifiedDate = item.modifiedDate ? new Date(item.modifiedDate) : null;
        const createdDate = item.createdDate ? new Date(item.createdDate) : null;
        
        if (!modifiedDate) return;
        
        const relativeTime = getRelativeTime(modifiedDate);
        const fullModifiedDate = modifiedDate.toLocaleString();
        const fullCreatedDate = createdDate ? createdDate.toLocaleString() : 'Unknown';
        
        // Extract usernames - handle if it's an email or object
        const modifiedByRaw = item.modifiedBy || item.modifiedByName || 'Unknown';
        const createdByRaw = item.createdBy || item.createdByName || 'Unknown';
        
        const modifiedByName = typeof modifiedByRaw === 'string' && modifiedByRaw.includes('@')
            ? modifiedByRaw.split('@')[0]
            : (typeof modifiedByRaw === 'object' ? (modifiedByRaw.name || modifiedByRaw.id || 'Unknown') : modifiedByRaw);
        
        const createdByName = typeof createdByRaw === 'string' && createdByRaw.includes('@')
            ? createdByRaw.split('@')[0]
            : (typeof createdByRaw === 'object' ? (createdByRaw.name || createdByRaw.id || 'Unknown') : createdByRaw);
        
        // Get CloudPages status info if available
        const cloudPagesStatus = item.cloudPagesStatus || item.meta?.cloudPages?.status || null;
        const cloudPagesModifiedDate = item.cloudPagesModifiedDate || item.meta?.cloudPages?.modifiedDate || null;
        
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'cpm-tooltip';
        tooltip.innerHTML = `
            <div class="cpm-tooltip-section">
                <div class="cpm-tooltip-icon">${ICONS.refresh}</div>
                <div class="cpm-tooltip-content">
                    <div class="cpm-tooltip-label">Modified</div>
                    <div class="cpm-tooltip-value">${relativeTime}</div>
                    <div class="cpm-tooltip-subvalue">${fullModifiedDate}</div>
                    <div class="cpm-tooltip-subvalue">by ${modifiedByName}</div>
                </div>
            </div>
            
            <div class="cpm-tooltip-section">
                <div class="cpm-tooltip-icon">${ICONS.calendar}</div>
                <div class="cpm-tooltip-content">
                    <div class="cpm-tooltip-label">Created</div>
                    <div class="cpm-tooltip-value">${createdDate ? createdDate.toLocaleDateString() : 'Unknown'}</div>
                    <div class="cpm-tooltip-subvalue">${fullCreatedDate}</div>
                    <div class="cpm-tooltip-subvalue">by ${createdByName}</div>
                </div>
            </div>
            
            ${cloudPagesStatus ? `
                <div class="cpm-tooltip-section">
                    <div class="cpm-tooltip-icon">${ICONS.cloudUpload}</div>
                    <div class="cpm-tooltip-content">
                        <div class="cpm-tooltip-label">CloudPages Status</div>
                        <div class="cpm-tooltip-value">${cloudPagesStatus}</div>
                        ${cloudPagesModifiedDate ? `<div class="cpm-tooltip-subvalue">Last published: ${new Date(cloudPagesModifiedDate).toLocaleString()}</div>` : ''}
                    </div>
                </div>
            ` : ''}
            
            <div class="cpm-tooltip-arrow"></div>
        `;
        
        document.body.appendChild(tooltip);
        
        // Position and show tooltip on hover
        modifiedCell.style.cursor = 'help';
        
        modifiedCell.addEventListener('mouseenter', () => {
            const cellRect = modifiedCell.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            
            // Position above the cell, centered
            tooltip.style.left = `${cellRect.left + (cellRect.width / 2) - (tooltipRect.width / 2)}px`;
            tooltip.style.top = `${cellRect.top - tooltipRect.height - 10 + window.scrollY}px`;
            
            // Show tooltip with animation
            requestAnimationFrame(() => {
                tooltip.classList.add('show');
            });
        });
        
        modifiedCell.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}

// Get relative time string (e.g., "2 hours ago", "3 days ago")
function getRelativeTime(date) {
    if (!date || isNaN(date.getTime())) return 'Unknown';
    
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);
    
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    if (diffWeek < 4) return `${diffWeek} week${diffWeek > 1 ? 's' : ''} ago`;
    if (diffMonth < 12) return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
    return `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
}

// Render pagination
function isDarkMode() {
    return window.CPM_STATE?.isDark === true;
}

function renderPagination(totalPages, totalItems) {
    const container = document.getElementById('cpm-pagination');
    if (!container) return;
    // Persist args so applyDarkMode can re-render pagination on theme switch
    window.CPM_STATE._paginationPages = totalPages;
    window.CPM_STATE._paginationTotal = totalItems;

    // Calculate display text - always show range format
    let displayText;
    if (totalItems === 0) {
        displayText = 'Showing 0 of 0 items';
    } else if (window.CPM_STATE.isSearchMode) {
        // Search mode: Show current page range and total from API
        const start = (window.CPM_STATE.currentPage - 1) * window.CPM_STATE.itemsPerPage + 1;
        const end = Math.min(window.CPM_STATE.currentPage * window.CPM_STATE.itemsPerPage, window.CPM_STATE.assetsTotalCount);
        displayText = `Showing ${start}-${end} of ${window.CPM_STATE.assetsTotalCount} items`;
    } else {
        // Normal mode: Show current page range
        const start = (window.CPM_STATE.currentPage - 1) * window.CPM_STATE.itemsPerPage + 1;
        const end = Math.min(window.CPM_STATE.currentPage * window.CPM_STATE.itemsPerPage, totalItems);
        displayText = `Showing ${start}-${end} of ${totalItems} items`;
    }
    
    const dk = isDarkMode();
    const pgBg        = dk ? '#1c2128' : 'white';
    const pgBgDis     = dk ? '#161b22' : '#f3f4f6';
    const pgBorder    = dk ? '#30363d' : '#0176d3';
    const pgBorderDis = dk ? '#21262d' : '#e5e7eb';
    const pgColor     = dk ? '#58a6ff' : '#0176d3';
    const pgColorDis  = dk ? '#484f58' : '#9ca3af';
    const pgColorText = dk ? '#c9d1d9' : '#374151';
    const pgBgActive  = dk ? '#0d2137' : '#0176d3';
    const pgBorderAct = dk ? '#388bfd' : '#0176d3';
    const infoColor   = dk ? '#8b949e' : '#1e3a5f';

    let html = `<div style="color: ${infoColor}; font-size: 0.875rem; font-weight: 500;">${displayText}</div>`;

    if (totalPages > 1) {
        html += '<div style="display: flex; gap: 0.375rem;">';

        // First Page
        const firstDisabled = window.CPM_STATE.currentPage === 1;
        html += `<button class="cpm-page-btn" data-page="1" ${firstDisabled ? 'disabled' : ''} style="
            padding: 8px 14px;
            border: 1px solid ${firstDisabled ? pgBorderDis : pgBorder};
            background: ${firstDisabled ? pgBgDis : pgBg};
            color: ${firstDisabled ? pgColorDis : pgColor};
            border-radius: 6px;
            cursor: ${firstDisabled ? 'not-allowed' : 'pointer'};
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        ">First</button>`;

        // Previous
        const prevDisabled = window.CPM_STATE.currentPage === 1;
        html += `<button class="cpm-page-btn" data-page="${window.CPM_STATE.currentPage - 1}" ${prevDisabled ? 'disabled' : ''} style="
            padding: 8px 14px;
            border: 1px solid ${prevDisabled ? pgBorderDis : pgBorder};
            background: ${prevDisabled ? pgBgDis : pgBg};
            color: ${prevDisabled ? pgColorDis : pgColor};
            border-radius: 6px;
            cursor: ${prevDisabled ? 'not-allowed' : 'pointer'};
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        ">← Prev</button>`;

        // Page numbers (show max 7)
        const maxPages = 7;
        let startPage = Math.max(1, window.CPM_STATE.currentPage - 3);
        let endPage = Math.min(totalPages, startPage + maxPages - 1);

        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === window.CPM_STATE.currentPage;
            html += `<button class="cpm-page-btn" data-page="${i}" style="
                padding: 8px 14px;
                border: 1px solid ${isActive ? pgBorderAct : pgBorderDis};
                background: ${isActive ? pgBgActive : pgBg};
                color: ${isActive ? 'white' : pgColorText};
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: ${isActive ? '600' : '400'};
                transition: all 0.2s;
                ${isActive ? 'box-shadow: 0 2px 8px rgba(1,118,211,0.3);' : ''}
            ">${i}</button>`;
        }

        // Next
        const nextDisabled = window.CPM_STATE.currentPage === totalPages;
        html += `<button class="cpm-page-btn" data-page="${window.CPM_STATE.currentPage + 1}" ${nextDisabled ? 'disabled' : ''} style="
            padding: 8px 14px;
            border: 1px solid ${nextDisabled ? pgBorderDis : pgBorder};
            background: ${nextDisabled ? pgBgDis : pgBg};
            color: ${nextDisabled ? pgColorDis : pgColor};
            border-radius: 6px;
            cursor: ${nextDisabled ? 'not-allowed' : 'pointer'};
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        ">Next →</button>`;

        // Last Page
        const lastDisabled = window.CPM_STATE.currentPage === totalPages;
        html += `<button class="cpm-page-btn" data-page="${totalPages}" ${lastDisabled ? 'disabled' : ''} style="
            padding: 8px 14px;
            border: 1px solid ${lastDisabled ? pgBorderDis : pgBorder};
            background: ${lastDisabled ? pgBgDis : pgBg};
            color: ${lastDisabled ? pgColorDis : pgColor};
            border-radius: 6px;
            cursor: ${lastDisabled ? 'not-allowed' : 'pointer'};
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        ">Last</button>`;
        
        html += '</div>';
    }
    
    container.innerHTML = html;
}

// Update bulk actions bar
function updateBulkActions() {
    const bulkBar = document.getElementById('cpm-bulk-actions');
    const batchUnpublishBtn = document.getElementById('cpm-batch-unpublish');
    const batchPublishBtn = document.getElementById('cpm-batch-publish');
    const batchMoveBtn = document.getElementById('cpm-batch-move');
    const unpublishCountEl = document.getElementById('cpm-unpublish-count');
    const publishCountEl = document.getElementById('cpm-publish-count');
    const moveCountEl = document.getElementById('cpm-move-count');
    
    // Count published vs unpublished items in selection
    let unpublishCount = 0;
    let publishCount = 0;
    
    document.querySelectorAll('.page-select-checkbox:checked').forEach(cb => {
        if (cb.dataset.status === 'Published') {
            unpublishCount++;
        } else if (cb.dataset.status && cb.dataset.status !== 'Loading...') {
            publishCount++;
        }
    });
    
    const totalSelected = window.CPM_STATE.selectedPages.size;
    
    // Update unpublish: pill only visible when count > 0 (SLDS-style)
    if (unpublishCountEl) {
        unpublishCountEl.textContent = unpublishCount > 0 ? unpublishCount : '';
        unpublishCountEl.classList.toggle('cpm-pill-visible', unpublishCount > 0);
    }
    if (batchUnpublishBtn) {
        batchUnpublishBtn.disabled = unpublishCount === 0;
    }
    
    if (publishCountEl) {
        publishCountEl.textContent = publishCount > 0 ? publishCount : '';
        publishCountEl.classList.toggle('cpm-pill-visible', publishCount > 0);
    }
    if (batchPublishBtn) {
        batchPublishBtn.disabled = publishCount === 0;
    }
    
    if (moveCountEl) {
        moveCountEl.textContent = totalSelected > 0 ? totalSelected : '';
        moveCountEl.classList.toggle('cpm-pill-visible', totalSelected > 0);
    }
    if (batchMoveBtn) {
        batchMoveBtn.disabled = totalSelected === 0;
    }
    
    if (bulkBar) bulkBar.style.display = totalSelected > 0 ? 'flex' : 'none';
}

// Returns the exact items currently visible on screen (current page only - e.g. 100 items)
function getCurrentPageItems() {
    let items = [...(window.CPM_STATE.allAssets || [])];
    if (window.CPM_STATE.currentFilter === 'landing') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'landingpage');
    } else if (window.CPM_STATE.currentFilter === 'json') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'jsoncoderesource');
    } else if (window.CPM_STATE.currentFilter === 'javascript') {
        items = items.filter(item => {
            const type = item.assetType?.name?.toLowerCase();
            return type === 'jscoderesource' || type === 'codesnippetblock';
        });
    } else if (window.CPM_STATE.currentFilter === 'css') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'csscoderesource');
    }
    if (window.CPM_STATE.isSearchMode) {
        return items;
    }
    const start = (window.CPM_STATE.currentPage - 1) * window.CPM_STATE.itemsPerPage;
    return items.slice(start, start + window.CPM_STATE.itemsPerPage);
}

// Shared helper: resolve item fields for export
function resolveExportItem(item) {
    const cached = window.CPM_STATE.getCachedEnrichment ? window.CPM_STATE.getCachedEnrichment(item.id) : null;
    const status = typeof item.status === 'string'
        ? item.status
        : (item.status?.status || cached?.status || 'Draft');
    const url = item.url || cached?.url || '';
    const folder = getFolderPath ? getFolderPath(item.category?.id) : (item.category?.name || 'Cloud Pages');
    return {
        name: item.name || '',
        type: item.assetType?.displayName || item.assetType?.name || '',
        status: status,
        folder: folder || item.category?.name || 'Cloud Pages',
        modifiedDate: item.modifiedDate ? new Date(item.modifiedDate).toLocaleString() : '',
        createdDate: item.createdDate ? new Date(item.createdDate).toLocaleString() : '',
        modifiedBy: item.modifiedBy?.name || '',
        createdBy: item.createdBy?.name || '',
        customerKey: item.customerKey || '',
        assetId: String(item.id || ''),
        siteId: String(item.siteId || ''),
        url: url
    };
}

// Export current view to CSV with all enriched fields
function exportToCSV() {
    // Export all filtered items across all loaded pages (not just the current paginated slice)
    let items = [...(window.CPM_STATE.allAssets || [])];
    const filter = window.CPM_STATE.currentFilter || 'all';
    if (filter === 'landing') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'landingpage');
    } else if (filter === 'json') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'jsoncoderesource');
    } else if (filter === 'javascript') {
        items = items.filter(item => {
            const type = item.assetType?.name?.toLowerCase();
            return type === 'jscoderesource' || type === 'codesnippetblock';
        });
    } else if (filter === 'css') {
        items = items.filter(item => item.assetType?.name?.toLowerCase() === 'csscoderesource');
    }
    if (items.length === 0) {
        showNotification('No items to export', 'warning');
        return;
    }
    const date = new Date().toISOString().split('T')[0];
    const headers = ['Name', 'Type', 'Status', 'Folder', 'Modified Date', 'Created Date',
                     'Modified By', 'Created By', 'Customer Key', 'Asset ID', 'Site ID', 'URL'];
    const rows = items.map(item => {
        const r = resolveExportItem(item);
        return [r.name, r.type, r.status, r.folder, r.modifiedDate, r.createdDate,
                r.modifiedBy, r.createdBy, r.customerKey, r.assetId, r.siteId, r.url];
    });

    const csv = [headers, ...rows]
        .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
        .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cpm-export-' + filter + '-' + date + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Exported ' + items.length + ' item(s) to CSV', 'success');
}

/**
 * Export ALL assets across all API pages, with full enrichment (status + URL).
 * Inspired by SFMC Scout's fetchAllDeData pattern.
 */
async function exportAllToCSV() {
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        showNotification('Error: Could not determine SFMC stack', 'error');
        return;
    }

    // Cookie-only proxy: pageHookToken no longer required for Content Builder reads.
    // appcoreToken still used for cloud-pages enrichment endpoints (Tier B — not yet migrated).
    const tokenResponse = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve));
    const pageHookToken = tokenResponse?.tokens?.pageHookToken ?? null;
    const appcoreToken = tokenResponse?.tokens?.appcoreToken ?? null;

    // Theme-aware overlay — reuses the styles registered by Download All so the
    // export modal also tracks the panel's dark/light mode.
    cpmEnsureDownloadOverlayStyles();
    const panel = document.getElementById('cloudpages-manager');
    const isDark = !!panel?.classList.contains('cpm-dark');
    const overlay = document.createElement('div');
    overlay.id = 'cpm-export-overlay';
    overlay.className = isDark ? 'cpm-dl-overlay cpm-dark' : 'cpm-dl-overlay';
    overlay.innerHTML = `
        <div class="cpm-dl-dialog">
            <div class="cpm-dl-title">Exporting All Assets</div>
            <div class="cpm-dl-text" id="cpm-export-progress-text">Initializing...</div>
            <div class="cpm-dl-track"><div id="cpm-export-progress-bar" class="cpm-dl-bar"></div></div>
            <button id="cpm-export-cancel" class="cpm-dl-cancel">Cancel</button>
        </div>
    `;
    if (panel) panel.appendChild(overlay);

    let cancelled = false;
    document.getElementById('cpm-export-cancel')?.addEventListener('click', () => { cancelled = true; });

    const setProgress = (text, pct) => {
        const el = document.getElementById('cpm-export-progress-text');
        const bar = document.getElementById('cpm-export-progress-bar');
        if (el) el.textContent = text;
        if (bar) bar.style.width = Math.min(100, pct) + '%';
    };

    try {
        // ── Step 1: Fetch ALL pages from Content Builder API ──
        const assetTypeIds = [240, 241, 242, 243, 244, 245, 247, 248, 249];
        const pageSize = 100;
        let allRawAssets = [];
        let currentPage = 1;
        let totalCount = 0;

        setProgress('Fetching asset list...', 5);

        while (!cancelled) {
            const payload = {
                page: { pageSize, page: currentPage },
                sort: [{ direction: 'desc', property: 'modifiedDate' }],
                query: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds },
                fields: ['assetType', 'category', 'createdDate', 'createdBy', 'customerKey', 'id', 'modifiedDate', 'modifiedBy', 'name', 'meta', 'status']
            };

            const result = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'MAKE_REQUEST',
                    config: {
                        // Cookie-only proxy: /cloud/fuelapi/ accepts session cookie, no CSRF needed.
                        url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/query?scope=ours`,
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json;datekind=local'
                        },
                        body: JSON.stringify(payload)
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                    if (response?.success) resolve(response.data);
                    else reject(new Error(response?.error || 'Request failed'));
                });
            });

            const items = result.items || [];
            if (currentPage === 1) totalCount = Number(result.count || result.totalCount || 0);
            allRawAssets = allRawAssets.concat(items);

            const fetchPct = Math.min(40, 5 + (allRawAssets.length / Math.max(totalCount, 1)) * 35);
            setProgress(`Fetching assets: ${allRawAssets.length} of ${totalCount || '?'}...`, fetchPct);

            if (items.length < pageSize || (totalCount > 0 && allRawAssets.length >= totalCount)) break;
            currentPage++;
            if (currentPage > 500) break; // safety
        }

        if (cancelled) { overlay.remove(); return; }

        // ── Step 2: Filter to relevant types ──
        const landingPages = allRawAssets
            .filter(a => a.assetType?.name?.toLowerCase() === 'landingpage')
            .map(a => ({ id: a.id, pageId: null, name: a.name, assetType: a.assetType, status: a.status?.status || 'Draft', url: null, modifiedDate: a.modifiedDate, createdDate: a.createdDate, modifiedBy: a.modifiedBy, createdBy: a.createdBy, category: a.category, customerKey: a.customerKey, meta: a.meta }));

        const codeResources = allRawAssets
            .filter(a => ['jsoncoderesource','jscoderesource','codesnippetblock','csscoderesource'].includes(a.assetType?.name?.toLowerCase()))
            .map(a => ({ ...a, status: a.status?.status || 'Draft', url: null, pageId: null }));

        const allItems = [...landingPages, ...codeResources];

        // ── Step 3: Enrich landing pages (status + URL) ──
        // Cookie-only proxy: enrichment no longer gated by appcoreToken presence.
        if (landingPages.length > 0) {
            const batchSize = 10;
            let enriched = 0;
            for (let i = 0; i < landingPages.length && !cancelled; i += batchSize) {
                const batch = landingPages.slice(i, i + batchSize);
                await Promise.all(batch.map(async (item) => {
                    try {
                        const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${item.id}`;
                        const resp = await new Promise((resolve, reject) => {
                            chrome.runtime.sendMessage({
                                type: 'MAKE_REQUEST',
                                config: { url, method: 'GET', headers: { 'Accept': 'application/json' } }
                            }, (r) => {
                                if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                                if (r?.success) resolve(r.data); else reject(new Error(r?.error || 'failed'));
                            });
                        });
                        const site = resp?.entities?.[0];
                        if (site) {
                            item.status = site.status || item.status;
                            item.url = site.url || null;
                            item.siteId = site.siteId;
                            item.pageId = site.defaultPageId || site.siteId;
                        }
                    } catch (_) { /* keep defaults */ }
                    enriched++;
                }));
                const enrichPct = 40 + (enriched / landingPages.length) * 55;
                setProgress(`Enriching landing pages: ${enriched} of ${landingPages.length}...`, enrichPct);
            }
        } else if (!appcoreToken) {
            setProgress('Skipping enrichment (Publish token missing)...', 95);
        }

        if (cancelled) { overlay.remove(); return; }

        // ── Step 4: Build category tree for folder paths ──
        await buildCategoryTree(pageHookToken);

        // ── Step 5: Generate CSV ──
        setProgress('Generating CSV...', 98);
        const filter = window.CPM_STATE.currentFilter || 'all';
        let exportItems = allItems;
        if (filter === 'landing') exportItems = landingPages;
        else if (filter === 'json') exportItems = codeResources.filter(i => i.assetType?.name?.toLowerCase() === 'jsoncoderesource');
        else if (filter === 'javascript') exportItems = codeResources.filter(i => ['jscoderesource','codesnippetblock'].includes(i.assetType?.name?.toLowerCase()));
        else if (filter === 'css') exportItems = codeResources.filter(i => i.assetType?.name?.toLowerCase() === 'csscoderesource');

        const date = new Date().toISOString().split('T')[0];
        const headers = ['Name', 'Type', 'Status', 'Folder', 'Modified Date', 'Created Date',
                         'Modified By', 'Created By', 'Customer Key', 'Asset ID', 'Site ID', 'URL'];
        const rows = exportItems.map(item => {
            const r = resolveExportItem(item);
            return [r.name, r.type, r.status, r.folder, r.modifiedDate, r.createdDate,
                    r.modifiedBy, r.createdBy, r.customerKey, r.assetId, r.siteId, r.url];
        });

        const csv = [headers, ...rows]
            .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
            .join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'cpm-export-all-' + filter + '-' + date + '.csv';
        link.click();
        URL.revokeObjectURL(blobUrl);

        overlay.remove();
        showNotification(`Exported all ${exportItems.length} item(s) to CSV`, 'success');

    } catch (error) {
        console.error('[CloudPage Maestro] exportAllToCSV error:', error);
        overlay.remove();
        showNotification('Export failed: ' + error.message, 'error');
    }
}


// Bulk unpublish - handles both landing pages and code resources
async function bulkUnpublish(appcoreToken) {
    if (window.CPM_STATE.selectedPages.size === 0) return;
    
    console.log('[CloudPage Maestro] Bulk unpublish - Selected count:', window.CPM_STATE.selectedPages.size);
    
    // Get selected items that are published
    const unpublishItems = [];
    document.querySelectorAll('.page-select-checkbox:checked').forEach(cb => {
        if (cb.dataset.status === 'Published') {
            unpublishItems.push({
                id: cb.dataset.id,
                type: cb.dataset.type,
                assetId: cb.dataset.assetid,
                siteId: cb.dataset.siteid
            });
        }
    });
    
    console.log('[CloudPage Maestro] Found', unpublishItems.length, 'items to unpublish');
    
    if (unpublishItems.length === 0) {
        showNotification('No published items selected', 'warning');
        return;
    }
    
    if (!confirm(`Unpublish ${unpublishItems.length} item(s)?`)) return;

    // No showLoading(true) here — the batch progress bar provides feedback, and
    // showLoading(false) is a DOM no-op so the skeleton would get stuck.
    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY = 5;

    const unpublishOne = async (item) => {
        const doOp = async () => {
            const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, r));
            const ac = resp?.tokens?.appcoreToken;
            if (!ac) throw new Error('401 — no publish token available');
            if (item.type === 'landing') await unpublishPage(item.siteId, ac);
            else await unpublishCodeResource(item.assetId, ac);
        };
        try {
            await withTokenRefreshRetry(doOp, 'bulkUnpublish ' + item.id);
            successCount++;
        } catch (error) {
            failCount++;
            console.error('[CloudPage Maestro] Failed to unpublish item:', item.id, error);
        } finally {
            showBatchProgress(successCount + failCount, unpublishItems.length, 'Unpublishing');
        }
    };

    for (let i = 0; i < unpublishItems.length; i += CONCURRENCY) {
        const slice = unpublishItems.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(unpublishOne));
    }

    hideBatchProgress();
    showNotification('Completed: ' + successCount + ' success, ' + failCount + ' failed. Click Refresh to update.', successCount > 0 ? 'success' : 'error');
    
    // Clear selection
    window.CPM_STATE.selectedPages.clear();
    const selectAll = document.getElementById('cpm-select-all');
    if (selectAll) selectAll.checked = false;
    document.querySelectorAll('.page-select-checkbox').forEach(cb => cb.checked = false);
    updateBulkActions();
    
    // DO NOT auto-reload - user will click Refresh manually
}

// Bulk publish - handles both landing pages and code resources
async function bulkPublish(appcoreToken) {
    if (window.CPM_STATE.selectedPages.size === 0) return;
    
    console.log('[CloudPage Maestro] Bulk publish - Selected count:', window.CPM_STATE.selectedPages.size);
    
    // Get selected items that are NOT published
    const publishItems = [];
    document.querySelectorAll('.page-select-checkbox:checked').forEach(cb => {
        if (cb.dataset.status !== 'Published') {
            publishItems.push({
                id: cb.dataset.id,
                type: cb.dataset.type,
                assetId: cb.dataset.assetid,
                siteId: cb.dataset.siteid
            });
        }
    });
    
    console.log('[CloudPage Maestro] Found', publishItems.length, 'items to publish');
    
    if (publishItems.length === 0) {
        showNotification('No unpublished items selected', 'warning');
        return;
    }
    
    if (!confirm(`Publish ${publishItems.length} item(s)?`)) return;

    // No showLoading(true) here — the batch progress bar provides feedback, and
    // showLoading(false) is a DOM no-op so the skeleton would get stuck.
    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY = 5;

    const publishOne = async (item) => {
        const doOp = async () => {
            const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, r));
            const ac = resp?.tokens?.appcoreToken;
            if (!ac) throw new Error('401 — no publish token available');
            if (item.type === 'landing') await publishPage(item.siteId, ac);
            else await publishCodeResource(item.assetId, ac);
        };
        try {
            await withTokenRefreshRetry(doOp, 'bulkPublish ' + item.id);
            successCount++;
        } catch (error) {
            failCount++;
            console.error('[CloudPage Maestro] Failed to publish item:', item.id, error);
        } finally {
            showBatchProgress(successCount + failCount, publishItems.length, 'Publishing');
        }
    };

    for (let i = 0; i < publishItems.length; i += CONCURRENCY) {
        const slice = publishItems.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(publishOne));
    }

    hideBatchProgress();
    showNotification(`Completed: ${successCount} success, ${failCount} failed. Click Refresh to update.`, successCount > 0 ? 'success' : 'error');
    
    // Clear selection
    window.CPM_STATE.selectedPages.clear();
    const selectAllEl = document.getElementById('cpm-select-all');
    if (selectAllEl) selectAllEl.checked = false;
    document.querySelectorAll('.page-select-checkbox').forEach(cb => cb.checked = false);
    updateBulkActions();
    
    // DO NOT auto-reload - user will click Refresh manually
}

// ============================================
// BATCH MOVE (DEBUG VERSION)
// ============================================

// Fetch all CloudPages folders (paginated)
async function fetchAllFolders(pageHookToken) {
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        console.error('[DEBUG] No stack detected');
        return null;
    }
    
    console.log('[DEBUG] ========================================');
    console.log('[DEBUG] Fetching all CloudPages folders...');
    
    const allFolders = [];
    let currentPage = 1;
    let totalCount = 0;
    const pageSize = 500;
    
    try {
        // Keep fetching pages until we have all folders
        while (true) {
            // Cookie-only proxy: /cloud/fuelapi/ accepts session cookie, no CSRF needed.
            const url = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/categories?categoryType=cloudpages&$page=${currentPage}&$pagesize=${pageSize}`;

            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'MAKE_REQUEST',
                    config: {
                        url: url,
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        }
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (response && response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response?.error || 'Unknown error'));
                    }
                });
            });
            
            const items = response.items || [];
            totalCount = response.count || 0;
            
            debugLog(`[DEBUG] Page ${currentPage}: Fetched ${items.length} folders (Total: ${totalCount})`);
            
            // Add folders from this page
            allFolders.push(...items);
            
            // Stop if we got no items or if we have all folders
            if (items.length === 0 || allFolders.length >= totalCount) {
                break;
            }
            
            currentPage++;
        }
        
        debugLog(`[DEBUG] Fetched all ${allFolders.length} folders from ${currentPage} page(s)`);
        
        // Return in same format as original API response
        return {
            count: totalCount,
            items: allFolders,
            page: 1,
            pageSize: allFolders.length
        };
    } catch (error) {
        console.error('[DEBUG] Error fetching folders:', error);
        return null;
    }
}

// Build folder tree from flat list
function buildFolderTree(folders) {
    console.log('[DEBUG] ========================================');
    console.log('[DEBUG] Building folder tree...');
    
    if (!folders || !folders.items) {
        console.error('[DEBUG] No folders to build tree from');
        return null;
    }
    
    // Create a map for quick lookup
    const folderMap = new Map();
    folders.items.forEach(folder => {
        folderMap.set(folder.id, {
            ...folder,
            children: []
        });
    });
    
    // Build tree structure
    const tree = [];
    folders.items.forEach(folder => {
        const folderNode = folderMap.get(folder.id);
        
        if (folder.parentId === 0) {
            // Root folder
            tree.push(folderNode);
        } else {
            // Child folder
            const parent = folderMap.get(folder.parentId);
            if (parent) {
                parent.children.push(folderNode);
            } else {
                console.warn(`[DEBUG] Parent ${folder.parentId} not found for folder ${folder.id}`);
            }
        }
    });
    
    console.log('[DEBUG] Folder tree built:', tree);
    console.log('[DEBUG] Total folders:', folderMap.size);
    
    return { tree, folderMap };
}

// Show folder picker modal with interactive tree
async function showFolderPickerModal(pageHookToken, selectedIds) {
    // (notification removed: fetching folders)
    const foldersResponse = await fetchAllFolders(pageHookToken);
    
    if (!foldersResponse) {
        showNotification('Failed to fetch folders', 'error');
        return;
    }
    
    const { tree, folderMap } = buildFolderTree(foldersResponse);
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'cpm-folder-picker-overlay';
    const fdk = isDarkMode();
    const fBg      = fdk ? '#161b22' : 'white';
    const fBorder  = fdk ? '#30363d' : '#e5e7eb';
    const fText    = fdk ? '#e6edf3' : '#111827';
    const fSubText = fdk ? '#8b949e' : '#6b7280';
    const fInputBg = fdk ? '#0d1117' : 'white';
    const fInputBorder = fdk ? '#30363d' : '#d1d5db';
    const fInputColor  = fdk ? '#c9d1d9' : '#111827';

    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, ${fdk ? '0.7' : '0.5'});
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        animation: fadeIn 0.2s ease-out;
    `;

    // Create modal container
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: ${fBg};
        border: 1px solid ${fBorder};
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,${fdk ? '0.6' : '0.3'});
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        animation: slideUp 0.3s ease-out;
    `;

    // Modal header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 24px;
        border-bottom: 1px solid ${fBorder};
    `;
    header.innerHTML = `
        <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: ${fText};">
            Move ${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''} to folder
        </h2>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: ${fSubText};">
            Select a destination folder
        </p>
    `;

    // Search box
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `padding: 16px 24px; border-bottom: 1px solid ${fBorder};`;
    searchContainer.innerHTML = `
        <input
            type="text"
            id="cpm-folder-search"
            placeholder="Search folders..."
            style="
                width: 100%;
                padding: 10px 12px;
                border: 1px solid ${fInputBorder};
                border-radius: 6px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s;
                background: ${fInputBg};
                color: ${fInputColor};
                box-sizing: border-box;
            "
        />
    `;
    
    // Tree container
    const treeContainer = document.createElement('div');
    treeContainer.style.cssText = `
        padding: 16px 24px;
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        min-height: 300px;
        max-height: 400px;
    `;
    
    // Render tree
    const treeList = document.createElement('ul');
    treeList.style.cssText = `
        list-style: none;
        padding: 0;
        margin: 0;
        min-height: min-content;
    `;
    
    let selectedFolderId = null;
    
    function renderTreeNode(node) {
        const li = document.createElement('li');
        li.dataset.folderId = node.id;
        
        const itemWrapper = document.createElement('div');
        itemWrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s ease;
            user-select: none;
        `;
        
        // Chevron for folders with children
        let chevron = null;
        if (node.children && node.children.length > 0) {
            chevron = document.createElement('span');
            chevron.innerHTML = '▶';
            chevron.style.cssText = `
                display: inline-block;
                width: 16px;
                height: 16px;
                font-size: 12px;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                color: #6b7280;
            `;
            itemWrapper.appendChild(chevron);
        } else {
            const spacer = document.createElement('span');
            spacer.style.cssText = 'width: 16px;';
            itemWrapper.appendChild(spacer);
        }
        
        // Folder icon (blue)
        const icon = document.createElement('span');
        icon.innerHTML = '📁';
        icon.style.cssText = `
            font-size: 20px; 
            line-height: 1;
            filter: brightness(0) saturate(100%) invert(47%) sepia(96%) saturate(1791%) hue-rotate(198deg) brightness(99%) contrast(92%);
        `;
        itemWrapper.appendChild(icon);
        
        // Folder name
        const name = document.createElement('span');
        name.textContent = node.name;
        name.style.cssText = `
            flex: 1;
            font-size: 14px;
            color: ${fText};
            font-weight: 500;
        `;
        itemWrapper.appendChild(name);
        
        li.appendChild(itemWrapper);
        
        // Children container
        let childrenList = null;
        let isOpen = false;
        
        if (node.children && node.children.length > 0) {
            childrenList = document.createElement('ul');
            childrenList.style.cssText = `
                list-style: none;
                padding-left: 24px;
                margin: 0;
                overflow: hidden;
                max-height: 0;
                transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;
            
            node.children.forEach(child => {
                childrenList.appendChild(renderTreeNode(child));
            });
            
            li.appendChild(childrenList);
        }
        
        // Click handler for selection
        itemWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Toggle expansion if has children
            if (chevron && childrenList) {
                isOpen = !isOpen;
                if (isOpen) {
                    chevron.style.transform = 'rotate(90deg)';
                    // Set to actual scroll height to expand
                    childrenList.style.maxHeight = childrenList.scrollHeight + 'px';
                    
                    // After animation, set to 'none' to allow dynamic growth
                    setTimeout(() => {
                        if (isOpen) {
                            childrenList.style.maxHeight = 'none';
                        }
                    }, 300);
                } else {
                    // Before collapsing, set explicit height then collapse to 0
                    childrenList.style.maxHeight = childrenList.scrollHeight + 'px';
                    // Force reflow
                    childrenList.offsetHeight;
                    chevron.style.transform = 'rotate(0deg)';
                    childrenList.style.maxHeight = '0';
                }
            }
            
            // Select folder
            document.querySelectorAll('#cpm-folder-picker-overlay li > div').forEach(el => {
                el.style.background = '';
                el.style.boxShadow = '';
            });
            
            itemWrapper.style.background = fdk ? '#0d2137' : '#eff6ff';
            itemWrapper.style.boxShadow = 'inset 0 0 0 2px #388bfd';
            selectedFolderId = node.id;

            // Enable move button
            document.getElementById('cpm-folder-move-btn').disabled = false;
        });

        // Hover effect
        itemWrapper.addEventListener('mouseenter', () => {
            if (selectedFolderId !== node.id) {
                itemWrapper.style.background = fdk ? '#1c2128' : '#f9fafb';
            }
        });

        itemWrapper.addEventListener('mouseleave', () => {
            if (selectedFolderId !== node.id) {
                itemWrapper.style.background = '';
            }
        });
        
        return li;
    }
    
    tree.forEach(node => {
        treeList.appendChild(renderTreeNode(node));
    });
    
    treeContainer.appendChild(treeList);
    
    // Search functionality
    searchContainer.querySelector('#cpm-folder-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        function filterNode(li) {
            const name = li.querySelector('span:last-child')?.textContent.toLowerCase() || '';
            const matches = name.includes(searchTerm);
            
            // Check children
            const childLis = Array.from(li.querySelectorAll(':scope > ul > li'));
            const hasMatchingChildren = childLis.some(filterNode);
            
            const shouldShow = searchTerm === '' || matches || hasMatchingChildren;
            li.style.display = shouldShow ? '' : 'none';
            
            // Auto-expand if searching and has matching children
            if (searchTerm && hasMatchingChildren) {
                const chevron = li.querySelector(':scope > div > span:first-child');
                const childrenList = li.querySelector(':scope > ul');
                if (chevron && childrenList) {
                    chevron.style.transform = 'rotate(90deg)';
                    childrenList.style.maxHeight = childrenList.scrollHeight + 'px';
                }
            }
            
            return shouldShow;
        }
        
        Array.from(treeList.children).forEach(filterNode);
    });
    
    // Footer with buttons
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 16px 24px;
        border-top: 1px solid ${fBorder};
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        background: ${fBg};
        border-radius: 0 0 12px 12px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        padding: 10px 20px;
        border: 1px solid ${fBorder};
        background: ${fBg};
        color: ${fSubText};
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    `;
    cancelBtn.addEventListener('click', () => {
        overlay.remove();
    });
    
    const moveBtn = document.createElement('button');
    moveBtn.id = 'cpm-folder-move-btn';
    moveBtn.textContent = 'Move Here';
    moveBtn.disabled = true;
    moveBtn.style.cssText = `
        padding: 10px 20px;
        border: none;
        background: #3b82f6;
        color: white;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        opacity: 0.5;
    `;
    moveBtn.addEventListener('click', async () => {
        if (selectedFolderId) {
            overlay.remove();
            await performBatchMove(selectedIds, selectedFolderId, pageHookToken, folderMap);
        }
    });
    
    // Enable/disable move button styling
    const originalDisabled = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled');
    Object.defineProperty(moveBtn, 'disabled', {
        get: function() { return originalDisabled.get.call(this); },
        set: function(val) {
            originalDisabled.set.call(this, val);
            this.style.opacity = val ? '0.5' : '1';
            this.style.cursor = val ? 'not-allowed' : 'pointer';
        }
    });
    
    footer.appendChild(cancelBtn);
    footer.appendChild(moveBtn);
    
    modal.appendChild(header);
    modal.appendChild(searchContainer);
    modal.appendChild(treeContainer);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
    
    // Add animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(overlay);
}

// Perform the actual batch move operation — concurrent batches of 5,
// progress toast feedback, 401-aware token refresh per item.
async function performBatchMove(selectedIds, targetFolderId, pageHookToken, folderMap) {
    const targetFolder = folderMap.get(targetFolderId);
    const stack = window.CPM_STATE.stack || getStack();
    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY = 5;

    console.log('[CloudPage Maestro] Moving', selectedIds.length, 'items to folder', targetFolder?.name);
    showBatchProgress(0, selectedIds.length, 'Moving');

    const moveOne = async (assetId) => {
        const doOp = async () => {
            // Always fetch the current pageHookToken so a refresh-and-retry uses the fresh value.
            const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, r));
            const ph = resp?.tokens?.pageHookToken;
            if (!ph) throw new Error('401 — no Content Builder token available');
            const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/${assetId}`;
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'MAKE_REQUEST',
                    config: {
                        url,
                        method: 'PATCH',
                        headers: {
                            'Accept': '*/*',
                            'Content-Type': 'application/json;datekind=local',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'X-CSRF-Token': ph
                        },
                        body: JSON.stringify({ id: assetId.toString(), category: { id: targetFolderId.toString() } })
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                    if (response && response.success) resolve(response.data);
                    else reject(new Error(response?.error || 'Request failed'));
                });
            });
        };
        try {
            await withTokenRefreshRetry(doOp, 'move ' + assetId);
            successCount++;
            window.CPM_STATE.enrichmentCache.delete(parseInt(assetId));
        } catch (error) {
            failCount++;
            console.error('[CloudPage Maestro] Error moving asset', assetId, error);
        } finally {
            showBatchProgress(successCount + failCount, selectedIds.length, 'Moving');
        }
    };

    for (let i = 0; i < selectedIds.length; i += CONCURRENCY) {
        const slice = selectedIds.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(moveOne));
    }

    hideBatchProgress();

    if (failCount === 0) {
        showNotification(`Moved ${successCount} items to "${targetFolder?.name || 'folder'}". Click Refresh to update.`, 'success');
    } else if (successCount === 0) {
        showNotification(`Failed to move all ${failCount} items`, 'error');
    } else {
        showNotification(`Moved ${successCount} items, ${failCount} failed. Click Refresh to update.`, 'warning');
    }

    window.CPM_STATE.selectedPages.clear();
    updateBulkActions();
}

// Batch move with folder picker
async function batchMoveDebug(pageHookToken) {
    const selectedIds = Array.from(window.CPM_STATE.selectedPages);
    
    if (selectedIds.length === 0) {
        showNotification('Please select items to move', 'warning');
        return;
    }
    
    showFolderPickerModal(pageHookToken, selectedIds);
}

// Universal unpublish - works for both landing pages and code resources.
// Auto-refreshes appcoreToken on 401/403 and retries once.
async function unpublishItem(id, type, assetId, siteId) {
    const itemType = type === 'landing' ? 'Landing Page' : 'Code Resource';
    if (!confirm(`Unpublish this ${itemType}?`)) return;

    const doOp = async () => {
        const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, r));
        const ac = resp?.tokens?.appcoreToken;
        if (!ac) throw new Error('401 — no publish token available');
        if (type === 'landing') {
            console.log('[CloudPage Maestro] Unpublishing Landing Page:', siteId);
            await unpublishPage(siteId, ac);
        } else {
            console.log('[CloudPage Maestro] Unpublishing Code Resource:', assetId);
            await unpublishCodeResource(assetId, ac);
        }
    };

    try {
        await withTokenRefreshRetry(doOp, 'unpublishItem');
        showNotification(`${itemType} unpublished successfully. Click Refresh to update.`, 'success');
        window.CPM_STATE.enrichmentCache.delete(parseInt(assetId));
    } catch (error) {
        console.error('[CloudPage Maestro] Unpublish error:', error);
        showNotification('Error: ' + error.message, 'error');
    }
}

// Universal publish - works for both landing pages and code resources.
// Auto-refreshes appcoreToken on 401/403 and retries once.
async function publishItem(id, type, assetId, siteId) {
    const itemType = type === 'landing' ? 'Landing Page' : 'Code Resource';
    if (!confirm(`Publish this ${itemType}?`)) return;

    const doOp = async () => {
        const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, r));
        const ac = resp?.tokens?.appcoreToken;
        if (!ac) throw new Error('401 — no publish token available');
        if (type === 'landing') {
            console.log('[CloudPage Maestro] Publishing Landing Page:', siteId);
            await publishPage(siteId, ac);
        } else {
            console.log('[CloudPage Maestro] Publishing Code Resource:', assetId);
            await publishCodeResource(assetId, ac);
        }
    };

    try {
        await withTokenRefreshRetry(doOp, 'publishItem');
        showNotification(`${itemType} published successfully. Click Refresh to update.`, 'success');
        window.CPM_STATE.enrichmentCache.delete(parseInt(assetId));
    } catch (error) {
        console.error('[CloudPage Maestro] Publish error:', error);
        showNotification('Error: ' + error.message, 'error');
    }
}

// Unpublish page API call
async function unpublishPage(id, appcoreToken) {
    const stack = getStack();
    const url = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${id}/unpublish`;
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': appcoreToken
                },
                body: JSON.stringify({ landingPageId: parseInt(id) })
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response ? response.error : 'Request failed'));
            }
        });
    });
}

// Publish page
async function publishPage(id, appcoreToken) {
    const stack = getStack();
    const url = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${id}/publish`;
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': appcoreToken
                },
                body: JSON.stringify({ landingPageId: parseInt(id) })
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response ? response.error : 'Request failed'));
            }
        });
    });
}

// Unpublish code resource (different endpoint from landing pages)
async function unpublishCodeResource(assetId, appcoreToken) {
    const stack = getStack();
    
    // Step 1: Get siteId (codeResourceId) from sites endpoint
    const sitesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;
    
    const siteData = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: sitesUrl,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': appcoreToken
                }
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response ? response.error : 'Sites API failed'));
            }
        });
    });
    
    if (!siteData.entities || siteData.entities.length === 0) {
        throw new Error('Could not find site info for this code resource');
    }
    
    const codeResourceId = siteData.entities[0].siteId;
    console.log('[CloudPage Maestro] Found codeResourceId:', codeResourceId);
    
    // Step 2: Unpublish using code-resources endpoint
    const unpublishUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/code-resources/${codeResourceId}/unpublish`;
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: unpublishUrl,
                method: 'POST',
                headers: {
                    'Accept': 'text/html',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': appcoreToken
                },
                body: JSON.stringify({ codeResourceId: parseInt(codeResourceId) })
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response ? response.error : 'Unpublish request failed'));
            }
        });
    });
}

// Publish code resource (different endpoint from landing pages)
async function publishCodeResource(assetId, appcoreToken) {
    const stack = getStack();
    
    // Step 1: Get siteId (codeResourceId) from sites endpoint
    const sitesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;
    
    const siteData = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: sitesUrl,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': appcoreToken
                }
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response ? response.error : 'Sites API failed'));
            }
        });
    });
    
    if (!siteData.entities || siteData.entities.length === 0) {
        throw new Error('Could not find site info for this code resource');
    }
    
    const codeResourceId = siteData.entities[0].siteId;
    console.log('[CloudPage Maestro] Found codeResourceId:', codeResourceId);
    
    // Step 2: Publish using code-resources endpoint
    const publishUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/code-resources/${codeResourceId}/publish`;
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: publishUrl,
                method: 'POST',
                headers: {
                    'Accept': 'text/html',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': appcoreToken
                },
                body: JSON.stringify({})
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response ? response.error : 'Publish request failed'));
            }
        });
    });
}

// Fetch and update status for a single item
async function fetchAndUpdateStatus(assetId, buttonElement) {
    const originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = `${ICONS.spinner} Loading...`;
    buttonElement.disabled = true;
    
    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve);
        });
        
        if (!response || !response.success) {
            throw new Error('No tokens available');
        }
        
        const stack = getStack();
        const siteData = await fetchSiteDetails(assetId, response.tokens.appcoreToken, stack);
        
        if (siteData) {
            // Update the item in our state
            const item = window.CPM_STATE.allAssets.find(a => a.id.toString() === assetId.toString());
            if (item) {
                item.pageId = siteData.id;
                item.siteId = siteData.siteId;
                item.status = siteData.status;
                item.url = siteData.url;
                
                console.log('[CloudPage Maestro] ✓ Updated', item.name, '- Status:', item.status, 'PageID:', item.pageId, 'SiteID:', item.siteId, 'URL:', item.url);
                
                // Re-render the table to show updated status
                renderTable();
                // (notification removed: per-item update)
            }
        } else {
            showNotification('No site data found for this item', 'warning');
        }
    } catch (error) {
        console.error('[CloudPage Maestro] Error fetching status:', error);
        showNotification('Error fetching status: ' + error.message, 'error');
    } finally {
        buttonElement.innerHTML = originalText;
        buttonElement.disabled = false;
    }
}

// Copy to clipboard
function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

// Download Landing Page HTML
async function downloadLandingPageHTML(assetId, name) {
    const stack = window.CPM_STATE.stack || getStack();

    // (notification removed: downloading HTML info)

    try {
        // Cookie-only proxy: HTML download chain no longer requires appcoreToken.
        // Session cookies on *.exacttarget.com carry auth.
        if (!stack) {
            throw new Error('Could not determine SFMC stack');
        }

        console.log(`[CloudPage Maestro] Downloading HTML for "${name}"... (cookie-only)`);

        // Step 1: Get siteId from sites endpoint
        const siteUrl = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;

        const siteResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: siteUrl,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : 'Sites API failed'));
                }
            });
        });
        
        const site = siteResponse.entities?.[0];
        if (!site) {
            throw new Error('No site found for this landing page');
        }
        
        const siteId = site.siteId;
        console.log(`[CloudPage Maestro] Site ID: ${siteId}`);
        
        // Step 2: Get stateId from states endpoint
        const statesUrl = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/`;

        const statesResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: statesUrl,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : 'States API failed'));
                }
            });
        });
        
        const state = statesResponse.entities?.[0];
        if (!state) {
            throw new Error('No state found for this landing page');
        }
        
        const stateId = state.stateId;
        console.log(`[CloudPage Maestro] State ID: ${stateId}`);
        
        // Step 3: Get HTML content from contents endpoint
        const contentsUrl = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/${stateId}/contents/`;

        const contentsResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: contentsUrl,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : 'Contents API failed'));
                }
            });
        });
        
        const content = contentsResponse.entities?.[0];
        if (!content) {
            throw new Error('No content found for this landing page');
        }
        
        const html = content.html;
        console.log(`[CloudPage Maestro] HTML fetched (${html.length} characters)`);
        
        // Decode unicode escapes
        const decodedHTML = html.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
            return String.fromCharCode(parseInt(code, 16));
        });
        
        // Download the HTML file
        const blob = new Blob([decodedHTML], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification(`Downloaded ${a.download}`, 'success');
        console.log(`[CloudPage Maestro] Downloaded "${a.download}"`);
        
    } catch (error) {
        console.error('[CloudPage Maestro] Error downloading HTML:', error);
        showNotification('Error downloading HTML: ' + error.message, 'error');
    }
}

// Download Code Resource (JSON/JS/CSS)
async function downloadCodeResource(assetId, name, assetType) {
    const stack = window.CPM_STATE.stack || getStack();
    
    // (notification removed: downloading file info)
    
    try {
        // Cookie-only proxy: Content Builder reads no longer need pageHookToken.
        // Fetch tokens only for downstream cloud-pages enrichment (still on CSRF path).
        const tokenResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve);
        });

        console.log(`[CloudPage Maestro] Downloading ${assetType} for "${name}"...`);

        // Get asset details from Content Builder API via cookie-only proxy
        const assetUrl = `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/${assetId}`;

        const assetResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: assetUrl,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : 'Asset API failed'));
                }
            });
        });
        
        // Extract content based on asset type
        let content = '';
        let extension = '.txt';
        let mimeType = 'text/plain';
        
        const assetTypeName = assetType || assetResponse.assetType?.name?.toLowerCase() || '';
        
        if (assetTypeName === 'jsoncoderesource') {
            content = assetResponse.content || JSON.stringify(assetResponse.data || {}, null, 2);
            extension = '.json';
            mimeType = 'application/json';
        } else if (assetTypeName === 'jscoderesource' || assetTypeName === 'codesnippetblock') {
            content = assetResponse.content || '';
            extension = '.js';
            mimeType = 'application/javascript';
        } else if (assetTypeName === 'csscoderesource') {
            content = assetResponse.content || '';
            extension = '.css';
            mimeType = 'text/css';
        } else {
            content = assetResponse.content || JSON.stringify(assetResponse, null, 2);
        }
        
        console.log(`[CloudPage Maestro] Content fetched (${content.length} characters)`);
        
        // Download the file
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + extension;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification(`Downloaded ${a.download}`, 'success');
        console.log(`[CloudPage Maestro] Downloaded "${a.download}"`);
        
    } catch (error) {
        console.error('[CloudPage Maestro] Error downloading code resource:', error);
        showNotification('Error downloading file: ' + error.message, 'error');
    }
}

// =====================================================================
// DOWNLOAD ALL FILES — zips every asset's source (HTML/JS/CSS/JSON) into
// a single archive with the SFMC category folder tree preserved.
// Loads JSZip from lib/jszip.min.js (declared first in manifest content_scripts).
// =====================================================================

// Wrap chrome.runtime.sendMessage MAKE_REQUEST in a promise the way the
// rest of the file already does inline, but reusable from the batch loop.
function cpmRequest(config) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'MAKE_REQUEST', config }, (response) => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            if (response && response.success) resolve(response.data);
            else reject(new Error(response?.error || 'Request failed'));
        });
    });
}

// Build a filesystem-safe folder path from an item's SFMC category.
// Uses a folderMap if provided (the full SFMC folder tree from fetchAllFolders);
// falls back to the in-memory categories Map otherwise. The folderMap version
// resolves the full ancestor chain even for folders that don't directly contain assets.
function cpmCategoryPath(item, folderMap, fullPathCache) {
    const catId = item.category?.id;
    if (!catId) return '_unfiled';

    let raw = '';
    if (folderMap && folderMap.has(catId)) {
        raw = cpmResolveFullPath(catId, folderMap, fullPathCache);
    } else {
        const cat = window.CPM_STATE.categories?.get(catId);
        raw = cat?.fullPath || cat?.name || `category_${catId}`;
    }
    return raw
        .replace(/\\/g, '/')
        .replace(/[<>:"|?*]/g, '_')
        .replace(/\/+/g, '/')
        .replace(/^\/+|\/+$/g, '') || '_unfiled';
}

// Walk a folder's parent chain to build the full path. Memoized via fullPathCache.
function cpmResolveFullPath(id, folderMap, cache) {
    if (cache && cache.has(id)) return cache.get(id);
    const f = folderMap.get(id);
    if (!f) return '';
    const name = (f.name || '').toString();
    const parentId = f.parentId;
    let path;
    if (parentId && folderMap.has(parentId)) {
        path = cpmResolveFullPath(parentId, folderMap, cache) + '/' + name;
    } else {
        path = name;
    }
    if (cache) cache.set(id, path);
    return path;
}

// Sanitize an asset name for filesystem use.
function cpmSafeFilename(name, fallbackId) {
    return (name || `asset_${fallbackId}`)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 200);
}

function cpmEnsureDownloadOverlayStyles() {
    if (document.getElementById('cpm-dl-overlay-styles')) return;
    const style = document.createElement('style');
    style.id = 'cpm-dl-overlay-styles';
    style.textContent = `
        .cpm-dl-overlay {
            position: absolute;
            inset: 0;
            background: rgba(3, 45, 96, 0.55);
            z-index: 20000;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: inherit;
            backdrop-filter: blur(2px);
        }
        .cpm-dl-overlay.cpm-dark {
            background: rgba(0, 0, 0, 0.65);
        }
        .cpm-dl-dialog {
            background: #ffffff;
            color: #1e3a5f;
            border-radius: 12px;
            padding: 28px 32px;
            min-width: 360px;
            max-width: 90%;
            box-shadow: 0 16px 48px rgba(3, 45, 96, 0.22), 0 2px 6px rgba(15, 17, 21, 0.08);
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            border: 1px solid rgba(15, 17, 21, 0.06);
        }
        .cpm-dl-overlay.cpm-dark .cpm-dl-dialog {
            background: #161b22;
            color: #e6edf3;
            border-color: #2c333d;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.4);
        }
        .cpm-dl-title {
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 6px;
            letter-spacing: -0.01em;
        }
        .cpm-dl-text {
            font-size: 13px;
            color: #706e6b;
            margin-bottom: 16px;
            min-height: 18px;
        }
        .cpm-dl-overlay.cpm-dark .cpm-dl-text { color: #8b949e; }
        .cpm-dl-track {
            background: #e5e5e5;
            border-radius: 999px;
            height: 8px;
            overflow: hidden;
            margin-bottom: 16px;
        }
        .cpm-dl-overlay.cpm-dark .cpm-dl-track { background: #2c333d; }
        .cpm-dl-bar {
            height: 100%;
            background: linear-gradient(90deg, #0176d3, #4d8eff);
            width: 0%;
            transition: width 0.3s ease;
            border-radius: 999px;
        }
        .cpm-dl-cancel {
            background: transparent;
            border: 1px solid #dddbda;
            border-radius: 5px;
            padding: 6px 16px;
            font-size: 12px;
            color: #706e6b;
            cursor: pointer;
            transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
        }
        .cpm-dl-cancel:hover {
            background: #f4f6f9;
            border-color: #c0c6ce;
            color: #1e3a5f;
        }
        .cpm-dl-overlay.cpm-dark .cpm-dl-cancel {
            border-color: #30363d;
            color: #8b949e;
        }
        .cpm-dl-overlay.cpm-dark .cpm-dl-cancel:hover {
            background: #1f242c;
            border-color: #4d5562;
            color: #e6edf3;
        }
    `;
    document.head.appendChild(style);
}

async function downloadAllFiles(mode = 'all-tree') {
    if (typeof JSZip === 'undefined') {
        showNotification('ZIP library not loaded. Reload the extension and try again.', 'error');
        return;
    }

    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        showNotification('Could not determine SFMC stack', 'error');
        return;
    }

    const isFlatHtml = mode === 'html-flat';
    const confirmMsg = isFlatHtml
        ? 'Download HTML for every landing page into a single flat folder (no SFMC category nesting)?'
        : 'Download EVERY asset (HTML for landing pages, source for code resources) as a ZIP with the full SFMC folder tree preserved?\n\nFor large accounts this can take several minutes.';
    if (!confirm(confirmMsg)) return;

    // Theme-aware overlay — reads .cpm-dark class on the panel and adapts.
    cpmEnsureDownloadOverlayStyles();
    const panel = document.getElementById('cloudpages-manager');
    const isDark = !!panel?.classList.contains('cpm-dark');
    const overlay = document.createElement('div');
    overlay.id = 'cpm-download-all-overlay';
    overlay.className = isDark ? 'cpm-dl-overlay cpm-dark' : 'cpm-dl-overlay';
    overlay.innerHTML = `
        <div class="cpm-dl-dialog">
            <div class="cpm-dl-title">Downloading All Files</div>
            <div class="cpm-dl-text" id="cpm-dl-all-text">Initializing...</div>
            <div class="cpm-dl-track"><div id="cpm-dl-all-bar" class="cpm-dl-bar"></div></div>
            <button id="cpm-dl-all-cancel" class="cpm-dl-cancel">Cancel</button>
        </div>
    `;
    if (panel) panel.appendChild(overlay);

    let cancelled = false;
    document.getElementById('cpm-dl-all-cancel')?.addEventListener('click', () => { cancelled = true; });
    const setProgress = (text, pct) => {
        const t = document.getElementById('cpm-dl-all-text');
        const b = document.getElementById('cpm-dl-all-bar');
        if (t) t.textContent = text;
        if (b) b.style.width = Math.min(100, pct) + '%';
    };

    try {
        // Step 1: fetch all asset metadata across every page
        setProgress('Fetching asset list...', 3);
        const assetTypeIds = [240, 241, 242, 243, 244, 245, 247, 248, 249];
        const pageSize = 100;
        let allRawAssets = [];
        let currentPage = 1;
        let totalCount = 0;

        while (!cancelled) {
            const payload = {
                page: { pageSize, page: currentPage },
                sort: [{ direction: 'desc', property: 'modifiedDate' }],
                query: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds },
                fields: ['assetType', 'category', 'customerKey', 'id', 'modifiedDate', 'name']
            };
            const result = await cpmRequest({
                url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/query?scope=ours`,
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json;datekind=local' },
                body: JSON.stringify(payload)
            });
            const items = result.items || [];
            if (currentPage === 1) totalCount = Number(result.count || result.totalCount || 0);
            allRawAssets = allRawAssets.concat(items);
            const pct = Math.min(18, 3 + (allRawAssets.length / Math.max(totalCount, 1)) * 15);
            setProgress(`Fetching list: ${allRawAssets.length} of ${totalCount || '?'}...`, pct);
            if (items.length < pageSize || (totalCount > 0 && allRawAssets.length >= totalCount)) break;
            currentPage++;
            if (currentPage > 500) break;
        }
        if (cancelled) { overlay.remove(); return; }

        // Step 2: fetch the COMPLETE SFMC folder tree (every category, even ones
        // with no direct assets). Walking ancestor parentIds against this complete
        // map fixes the old bug where `A > B > C` showed up in the zip as only `C`.
        let folderMap = null;
        let fullPathCache = null;
        if (mode === 'all-tree') {
            setProgress('Fetching folder tree...', 20);
            const foldersResult = await fetchAllFolders(null); // cookie-only, no token needed
            folderMap = new Map();
            (foldersResult?.items || []).forEach(f => folderMap.set(f.id, f));
            fullPathCache = new Map();
            console.log(`[CloudPage Maestro] Loaded ${folderMap.size} folders for path resolution`);
        }

        // For html-flat mode, narrow to landing pages only.
        const workingSet = isFlatHtml
            ? allRawAssets.filter(a => a.assetType?.name?.toLowerCase() === 'landingpage')
            : allRawAssets;

        if (workingSet.length === 0) {
            overlay.remove();
            showNotification(isFlatHtml ? 'No landing pages found.' : 'No assets found.', 'warning');
            return;
        }

        // Step 3: fetch each asset's content in parallel batches and stuff
        // it into the ZIP under its category path.
        const zip = new JSZip();
        const CONCURRENCY = 8;
        let processed = 0;
        let failed = 0;
        const failedNames = [];

        const fetchOne = async (asset) => {
            if (cancelled) return;
            const typeName = asset.assetType?.name?.toLowerCase() || '';
            const folderPath = isFlatHtml ? '' : cpmCategoryPath(asset, folderMap, fullPathCache);
            const safeName = cpmSafeFilename(asset.name, asset.id);
            const fullPath = (p, file) => p ? `${p}/${file}` : file;

            try {
                if (typeName === 'landingpage') {
                    // 3-step HTML chain via cookie-only proxy
                    const sites = await cpmRequest({
                        url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${asset.id}`,
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    const siteId = sites.entities?.[0]?.siteId;
                    if (!siteId) throw new Error('no siteId');
                    const states = await cpmRequest({
                        url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/`,
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    const stateId = states.entities?.[0]?.stateId;
                    if (!stateId) throw new Error('no stateId');
                    const contents = await cpmRequest({
                        url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/${stateId}/contents/`,
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    const html = contents.entities?.[0]?.html || '';
                    const decoded = html.replace(/\\u([0-9a-fA-F]{4})/g, (m, c) => String.fromCharCode(parseInt(c, 16)));
                    zip.file(fullPath(folderPath, `${safeName}.html`), decoded);
                } else if (['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource'].includes(typeName)) {
                    const assetData = await cpmRequest({
                        url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/${asset.id}`,
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    let content = assetData.content || '';
                    let ext = '.js';
                    if (typeName === 'jsoncoderesource') {
                        ext = '.json';
                        if (!content) content = JSON.stringify(assetData.data || {}, null, 2);
                    } else if (typeName === 'csscoderesource') {
                        ext = '.css';
                    }
                    zip.file(fullPath(folderPath, `${safeName}${ext}`), content);
                } else {
                    // Unknown type — dump the raw asset JSON so nothing is silently lost.
                    const assetData = await cpmRequest({
                        url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/asset/v1/content/assets/${asset.id}`,
                        method: 'GET',
                        headers: { 'Accept': 'application/json' }
                    });
                    zip.file(`${folderPath}/${safeName}.json`, JSON.stringify(assetData, null, 2));
                }
                processed++;
            } catch (e) {
                console.warn('[CloudPage Maestro] Failed to fetch', asset.name, e.message);
                failed++;
                failedNames.push(asset.name || `id:${asset.id}`);
            }
            const pct = 20 + ((processed + failed) / workingSet.length) * 72;
            setProgress(`Fetching files: ${processed + failed} of ${workingSet.length} (${failed} failed)`, pct);
        };

        for (let i = 0; i < workingSet.length && !cancelled; i += CONCURRENCY) {
            const slice = workingSet.slice(i, i + CONCURRENCY);
            await Promise.all(slice.map(fetchOne));
        }
        if (cancelled) { overlay.remove(); return; }

        // Include a manifest noting any failures so the user can retry them individually.
        if (failedNames.length > 0) {
            zip.file('_FAILED.txt', `These assets could not be downloaded:\n\n${failedNames.join('\n')}\n`);
        }

        // Step 4: generate the ZIP
        setProgress('Generating ZIP archive...', 94);
        const zipBlob = await zip.generateAsync(
            { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
            (meta) => {
                if (cancelled) return;
                setProgress(`Generating ZIP: ${Math.round(meta.percent)}%`, 94 + (meta.percent / 100) * 5);
            }
        );

        // Step 5: trigger download
        const date = new Date().toISOString().slice(0, 10);
        const blobUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        const modeTag = isFlatHtml ? 'html' : 'files';
        link.download = `cloudpage-maestro-${modeTag}-${date}.zip`;
        link.click();
        URL.revokeObjectURL(blobUrl);

        overlay.remove();
        const msg = failed > 0
            ? `Downloaded ${processed} file(s) — ${failed} failed (see _FAILED.txt in the zip)`
            : `Downloaded ${processed} file(s)`;
        showNotification(msg, failed > 0 ? 'warning' : 'success');
    } catch (error) {
        console.error('[CloudPage Maestro] downloadAllFiles error:', error);
        overlay.remove();
        showNotification('Download failed: ' + error.message, 'error');
    }
}

// Show batch operation progress as a theme-aware bottom-right toast.
// Survives renderTable() rewrites (it's a body-level fixed element) and updates in place
// across successive showBatchProgress() calls — one toast per batch, not one per tick.
function showBatchProgress(current, total, action) {
    ensureBatchProgressStyles();
    const isDark = !!document.getElementById('cloudpages-manager')?.classList.contains('cpm-dark');
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const done = current >= total;

    let toast = document.getElementById('cpm-batch-progress-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cpm-batch-progress-toast';
        toast.innerHTML = `
            <div class="cpm-bpt-row">
                <div class="cpm-bpt-spinner" aria-hidden="true"></div>
                <div class="cpm-bpt-content">
                    <div class="cpm-bpt-title"></div>
                    <div class="cpm-bpt-track"><div class="cpm-bpt-bar"></div></div>
                    <div class="cpm-bpt-meta"></div>
                </div>
            </div>
        `;
        document.body.appendChild(toast);
    }

    toast.classList.toggle('cpm-dark', isDark);
    toast.classList.toggle('cpm-bpt-done', done);
    toast.querySelector('.cpm-bpt-title').textContent = action || 'Processing';
    toast.querySelector('.cpm-bpt-meta').textContent = `${current} / ${total} · ${pct}%`;
    toast.querySelector('.cpm-bpt-bar').style.width = pct + '%';
}

// Hide batch progress toast with a slide-out animation.
function hideBatchProgress() {
    const toast = document.getElementById('cpm-batch-progress-toast');
    if (!toast) return;
    toast.classList.add('cpm-bpt-out');
    setTimeout(() => toast.remove(), 280);
}

function ensureBatchProgressStyles() {
    if (document.getElementById('cpm-batch-progress-styles')) return;
    const style = document.createElement('style');
    style.id = 'cpm-batch-progress-styles';
    style.textContent = `
        #cpm-batch-progress-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 320px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-left: 4px solid #0176d3;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(15, 17, 21, 0.12);
            padding: 14px 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            z-index: 2147483647;
            animation: cpm-bpt-in 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
            transition: border-left-color 200ms ease;
        }
        #cpm-batch-progress-toast.cpm-dark {
            background: #1a1f2e;
            border-color: #2c333d;
            border-left-color: #4d8eff;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        }
        #cpm-batch-progress-toast.cpm-bpt-done {
            border-left-color: #3fb950;
        }
        #cpm-batch-progress-toast.cpm-bpt-done.cpm-dark {
            border-left-color: #3fb950;
        }
        #cpm-batch-progress-toast .cpm-bpt-row { display: flex; gap: 12px; align-items: flex-start; }
        #cpm-batch-progress-toast .cpm-bpt-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(1, 118, 211, 0.2);
            border-top-color: #0176d3;
            border-radius: 50%;
            flex-shrink: 0;
            margin-top: 2px;
            animation: cpm-bpt-spin 0.8s linear infinite;
        }
        #cpm-batch-progress-toast.cpm-dark .cpm-bpt-spinner {
            border-color: rgba(77, 142, 255, 0.2);
            border-top-color: #4d8eff;
        }
        #cpm-batch-progress-toast.cpm-bpt-done .cpm-bpt-spinner {
            border-color: rgba(63, 185, 80, 0.25);
            border-top-color: #3fb950;
            animation: none;
        }
        #cpm-batch-progress-toast .cpm-bpt-content { flex: 1; min-width: 0; }
        #cpm-batch-progress-toast .cpm-bpt-title {
            font-size: 13px;
            font-weight: 600;
            color: #1e3a5f;
            margin-bottom: 8px;
            letter-spacing: -0.005em;
        }
        #cpm-batch-progress-toast.cpm-dark .cpm-bpt-title { color: #e8eaed; }
        #cpm-batch-progress-toast .cpm-bpt-track {
            height: 6px;
            background: #e6f2fb;
            border-radius: 999px;
            overflow: hidden;
            margin-bottom: 6px;
        }
        #cpm-batch-progress-toast.cpm-dark .cpm-bpt-track { background: #2c333d; }
        #cpm-batch-progress-toast .cpm-bpt-bar {
            height: 100%;
            background: linear-gradient(90deg, #0176d3, #4d8eff);
            width: 0%;
            transition: width 0.25s ease;
            border-radius: 999px;
        }
        #cpm-batch-progress-toast.cpm-bpt-done .cpm-bpt-bar {
            background: linear-gradient(90deg, #3fb950, #58d473);
        }
        #cpm-batch-progress-toast .cpm-bpt-meta {
            font-size: 11px;
            color: #718096;
            font-variant-numeric: tabular-nums;
            letter-spacing: 0.02em;
        }
        #cpm-batch-progress-toast.cpm-dark .cpm-bpt-meta { color: #a8afb8; }
        #cpm-batch-progress-toast.cpm-bpt-out {
            animation: cpm-bpt-out 0.28s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        @keyframes cpm-bpt-in {
            from { transform: translateX(360px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes cpm-bpt-out {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(360px); opacity: 0; }
        }
        @keyframes cpm-bpt-spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// Show loading - skeleton rows in table, rest of UI stays visible
function showLoading(show) {
    console.log('[CloudPage Maestro] showLoading(' + show + ')');
    window.CPM_STATE.isLoading = show;
    const tbody = document.getElementById('cpm-table-body');
    const pagination = document.getElementById('cpm-pagination');
    
    if (show && tbody) {
        // Generate 8 skeleton rows
        let skeletonHTML = '';
        for (let i = 0; i < 8; i++) {
            skeletonHTML += `
                <tr class="cpm-skeleton-row">
                    <td><div class="cpm-skeleton checkbox"></div></td>
                    <td><span class="cpm-skeleton id"></span></td>
                    <td>
                        <div style="display: flex; align-items: center;">
                            <div class="cpm-skeleton icon"></div>
                            <span class="cpm-skeleton name"></span>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center;">
                            <div class="cpm-skeleton icon"></div>
                            <span class="cpm-skeleton folder"></span>
                        </div>
                    </td>
                    <td><span class="cpm-skeleton type"></span></td>
                    <td><span class="cpm-skeleton status"></span></td>
                    <td><span class="cpm-skeleton url"></span></td>
                    <td><span class="cpm-skeleton date"></span></td>
                    <td><span class="cpm-skeleton actions"></span></td>
                </tr>
            `;
        }
        tbody.innerHTML = skeletonHTML;
        if (pagination) pagination.innerHTML = '';
        console.log('[CloudPage Maestro] Loading: ON - Skeleton rows displayed');
    }
    // When show=false, renderTable() will replace the skeleton rows with real data
}

// Show notification (toast)
function showNotification(message, type = 'info') {
    createNotification('CloudPage Maestro', message, type);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Generic notification function - White with Blue Branding
function createNotification(title, message, type = 'success') {
    const infoIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16V12"/><path d="M12 8h.01"/></svg>';
    const checkIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    const warningIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>';
    const errorIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></svg>';
    
    const configs = {
        success: { color: '#0176d3', icon: checkIcon, border: '#0176d3', iconBg: '#e6f2fb' },
        warning: { color: '#b7791f', icon: warningIcon, border: '#ecc94b', iconBg: '#fefcbf' },
        error: { color: '#c23934', icon: errorIcon, border: '#c23934', iconBg: '#fee2e2' },
        info: { color: '#0176d3', icon: infoIcon, border: '#0176d3', iconBg: '#e6f2fb' }
    };
    const config = configs[type] || configs.info;

    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ffffff;
        border: 1px solid ${config.border};
        border-left: 4px solid ${config.border};
        color: ${config.color};
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 9999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease-out;
        max-width: 380px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
    `;
    notification.innerHTML = `
        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${config.iconBg}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; flex-shrink: 0;">${config.icon}</div>
        <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; margin-bottom: 0.25rem; color: #1e3a5f;">${title}</div>
            <div style="font-size: 0.875rem; color: #4a5568;">${message}</div>
        </div>
        <button type="button" class="cpm-notification-close" aria-label="Close" style="flex-shrink: 0; width: 24px; height: 24px; border: none; background: transparent; color: #718096; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1; padding: 0;">&times;</button>
    `;

    document.body.appendChild(notification);

    let hideTimeoutId = setTimeout(() => {
        hideTimeoutId = null;
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 4000);

    notification.querySelector('.cpm-notification-close')?.addEventListener('click', () => {
        if (hideTimeoutId) clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    });

    if (!document.getElementById('cpm-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'cpm-notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(400px); opacity: 0; }
            }
            .cpm-notification-close:hover {
                background: rgba(0,0,0,0.06) !important;
                color: #2d3748 !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Add to window for debugging
window.CloudPageMaestro = {
    reload: () => {
        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
            if (response && response.success) {
                loadAllData(response.tokens.pageHookToken, response.tokens.appcoreToken);
            }
        });
    },
    stats: () => ({
        total: window.CPM_STATE.allAssets.length,
        landingPages: window.CPM_STATE.landingPages.length,
        selected: window.CPM_STATE.selectedPages.size
    }),
    state: () => window.CPM_STATE
};

console.log('[CloudPage Maestro] Content script initialization complete');
