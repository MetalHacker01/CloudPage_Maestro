// Content script for CloudPage Maestro Chrome Extension - Full Version
// Converted from Tampermonkey userscript v5.0

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

// Replace all console.log with debugLog for production
// Use Ctrl+H in VS Code: Find "console\.log\(" Replace "debugLog(" (Regex mode)
// Keep console.error and console.warn as-is for critical messages

console.log('═══════════════════════════════════════════════════════════');
console.log('CloudPage Maestro - Chrome Extension v5.0');
console.log('   URL:', window.location.href);
console.log('   Debug Mode:', DEBUG_MODE ? 'ENABLED ✓' : 'DISABLED (production)');
console.log('═══════════════════════════════════════════════════════════');

(async function() {
    'use strict';

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
    const MAX_CONCURRENT_REQUESTS = 10;
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
    console.log('[CloudPage Maestro] Request queue initialized (max:', MAX_CONCURRENT_REQUESTS, 'concurrent)');

    // ============================================
    // PERFORMANCE OPTIMIZATION: Enrichment Cache
    // Avoids re-fetching same asset's site details
    // ============================================
    const enrichmentCache = new Map(); // assetId -> { status, url, pageId, timestamp }
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache validity

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
    console.log('[CloudPage Maestro] Enrichment cache initialized (TTL:', CACHE_TTL / 1000, 'seconds)');

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
        currentEnrichmentSession,
        requestQueue,
        enrichmentCache,
        getCachedEnrichment,
        setCachedEnrichment
    };

    // ============================================
    // DELAYED INITIALIZATION (6 seconds + page ready check)
    // Wait for page to fully stabilize before injecting UI
    // ============================================
    console.log('[CloudPage Maestro] Waiting for page to fully load...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    
    // Additional delay to ensure SFMC framework is loaded AND visible
    console.log('[CloudPage Maestro] DOM ready, waiting 10 seconds for SFMC initialization and visibility...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check if SFMC elements are present and visible
    const sfmcCheck = document.querySelector('[data-sfmc-app]') || 
                     document.querySelector('.slds-scope') ||
                     document.querySelector('.slds-spinner_container') ||
                     document.querySelector('[class*="sfmc"]') ||
                     document.body;
    
    console.log('[CloudPage Maestro] SFMC elements detected:', !!sfmcCheck);
    console.log('[CloudPage Maestro] Starting initialization...');

    // ============================================
    // TOKEN CAPTURE FROM DOM
    // Enhanced token capture with both DOM and network interception
    // ============================================
    function captureTokensFromDOM() {
        console.log('[CloudPage Maestro] Setting up token capture...');
        
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
        
        console.log('[CloudPage Maestro] Token capture hooks installed');
    }

    // Token capture from DOM and network requests
    captureTokensFromDOM();

    // Main initialization function
    async function initializeCloudPageMaestro() {
        console.log('[CloudPage Maestro] Getting tokens from background...');

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

            if (!pageHookToken && !appcoreToken) {
                console.warn('[CloudPage Maestro] No tokens available yet');
                createNotification('Waiting for tokens...', 'Navigate around SFMC to capture tokens', 'warning');
                return;
            }

            console.log('[CloudPage Maestro] Tokens loaded, creating UI...');
            createNotification('CloudPage Maestro', 'Extension loaded successfully', 'success');
            
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
    console.log(`[DEBUG] buildCategoryTree START - hasToken: ${!!pageHookToken}`);
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
    
    console.log(`[DEBUG] Built category tree with ${window.CPM_STATE.categories.size} folders`);
    console.log(`[DEBUG] First few categories:`, Array.from(window.CPM_STATE.categories.entries()).slice(0, 3));
    
    // Build full paths for all categories (fetch missing parents from API)
    const pathPromises = [];
    window.CPM_STATE.categories.forEach((cat, id) => {
        if (!cat.fullPath) {
            console.log(`[DEBUG] Processing category ${id}: ${cat.name} (parentId: ${cat.parentId})`);
            pathPromises.push(
                buildFullPath(id, pageHookToken).then(fullPath => {
                    cat.fullPath = fullPath;
                    console.log(`[DEBUG] Set fullPath for category ${id}: ${fullPath}`);
                })
            );
        }
    });
    
    await Promise.all(pathPromises);
    console.log(`[DEBUG] buildCategoryTree DONE - Processed ${pathPromises.length} categories`);
}

// Fetch category details from API
async function fetchCategoryDetails(categoryId, pageHookToken) {
    if (!categoryId || !pageHookToken) {
        console.log(`[DEBUG] fetchCategoryDetails - Missing params: categoryId=${categoryId}, hasToken=${!!pageHookToken}`);
        return null;
    }
    
    const stack = window.CPM_STATE.stack || getStack();
    if (!stack) {
        console.log(`[DEBUG] fetchCategoryDetails - No stack detected`);
        return null;
    }
    
    try {
        const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/categories/${categoryId}`;
        console.log(`[DEBUG] Fetching category ${categoryId} from API...`);
        
        // Use Chrome extension message passing to avoid CORS
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: url,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': pageHookToken
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
        
        console.log(`[DEBUG] Fetched category ${categoryId}:`, response);
        
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
    console.log(`[DEBUG] ========================================`);
    console.log(`[DEBUG] buildFullPath START - categoryId: ${categoryId}`);
    
    const parts = [];
    let currentId = categoryId;
    let depth = 0;
    
    while (currentId && depth < 20) {
        console.log(`[DEBUG] Depth ${depth}: Looking for category ${currentId}`);
        
        let cat = window.CPM_STATE.categories.get(currentId);
        
        if (cat) {
            console.log(`[DEBUG] Found in cache: ${cat.name} (parentId: ${cat.parentId})`);
        } else {
            console.log(`[DEBUG] Not in cache, fetching from API...`);
            cat = await fetchCategoryDetails(currentId, pageHookToken);
            if (cat) {
                console.log(`[DEBUG] Fetched from API: ${cat.name} (parentId: ${cat.parentId})`);
                // Cache the fetched category
                window.CPM_STATE.categories.set(currentId, cat);
            } else {
                console.log(`[DEBUG] Failed to fetch category ${currentId}, stopping traversal`);
                break;
            }
        }
        
        parts.unshift(cat.name);
        currentId = cat.parentId;
        depth++;
        
        console.log(`[DEBUG] Current path so far: ${parts.join(' / ')}`);
    }
    
    // Remove 'CloudPages' root folder from display
    const filteredParts = parts.filter(p => p.toLowerCase() !== 'cloudpages');
    const finalPath = filteredParts.length > 0 ? filteredParts.join(' / ') : 'Cloud Pages';
    console.log(`[DEBUG] buildFullPath DONE - Final path: ${finalPath}`);
    console.log(`[DEBUG] ========================================`);
    
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
        <div class="cpm-header">
            <div class="cpm-header-left">
                <div class="cpm-logo" style="display: flex; justify-content: center; align-items: center;">
                    <img src="${chrome.runtime.getURL('CP_Maestro_Logo.png')}" alt="CloudPage Maestro" style="height: 130px; width: auto;">
                    <span style="font-weight: 600; margin-left: 8px; font-size: 20px;">CloudPage Maestro</span>
                </div>
            </div>
            <div class="cpm-header-actions">
                <button class="cpm-header-btn batch-unpublish" id="cpm-batch-unpublish" disabled>
                    ${ICONS.eyeClosed} Unpublish (<span id="cpm-unpublish-count">0</span>)
                </button>
                <button class="cpm-header-btn batch-publish" id="cpm-batch-publish" disabled>
                    ${ICONS.cloudUpload} Publish (<span id="cpm-publish-count">0</span>)
                </button>
                <button class="cpm-header-btn batch-move" id="cpm-batch-move" disabled>
                    ${ICONS.folder} Move (<span id="cpm-move-count">0</span>)
                </button>
                <button class="cpm-header-btn" id="cpm-refresh">${ICONS.refresh} Refresh</button>
                <button class="cpm-header-btn" id="cpm-export-csv">${ICONS.download} Export</button>
                <button class="cpm-header-btn" id="cpm-close-btn">${ICONS.cancel} Close</button>
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
                    </div>
                </div>
                <div class="cpm-stats-grid" id="cpm-stats-grid">
                    <div class="cpm-stat active" data-filter="all">
                        <div class="cpm-stat-label">Overview</div>
                        <div class="cpm-stat-value" id="stat-total">0</div>
                    </div>
                    <div class="cpm-stat" data-filter="landing">
                        <div class="cpm-stat-label">Landing Pages</div>
                        <div class="cpm-stat-value" id="stat-landing">0</div>
                    </div>
                    <div class="cpm-stat" data-filter="json">
                        <div class="cpm-stat-label">JSON</div>
                        <div class="cpm-stat-value" id="stat-json">0</div>
                    </div>
                    <div class="cpm-stat" data-filter="javascript">
                        <div class="cpm-stat-label">JavaScript</div>
                        <div class="cpm-stat-value" id="stat-js">0</div>
                    </div>
                    <div class="cpm-stat" data-filter="css">
                        <div class="cpm-stat-label">CSS</div>
                        <div class="cpm-stat-value" id="stat-css">0</div>
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
                <table class="cpm-table" id="cpm-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">
                                <input type="checkbox" id="cpm-select-all" title="Select all">
                            </th>
                            <th>${ICONS.hashtag} ID</th>
                            <th>Name</th>
                            <th>${ICONS.folder} Folder</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>${ICONS.externalLink} URL</th>
                            <th>Modified</th>
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
    toggleBtn.className = 'cpm-toggle-btn';
    toggleBtn.textContent = 'CP Maestro';
    toggleBtn.addEventListener('click', () => {
        const mgr = document.getElementById('cloudpages-manager');
        if (mgr) {
            mgr.classList.toggle('minimized');
            window.CPM_STATE.isPanelOpen = !mgr.classList.contains('minimized');
        }
    });
    document.body.appendChild(toggleBtn);
    
    // Add toast
    const toast = document.createElement('div');
    toast.id = 'cloudpages-toast';
    document.body.appendChild(toast);
    
    // Add styles
    addStyles();
    
    // Setup event listeners
    setupEventListeners(pageHookToken, appcoreToken);
    
    // Keep panel closed on initialization but load data in background
    panel.classList.add('minimized');
    window.CPM_STATE.isPanelOpen = false;
    showLoading(true);  // Show skeleton rows while loading
    loadAllData(pageHookToken, appcoreToken);
    
    console.log('[CloudPage Maestro] UI panel created successfully');
}

// Add CSS styles - Matching Tampermonkey v5 Design
function addStyles() {
    if (document.getElementById('cpm-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'cpm-styles';
    style.textContent = `
        /* Main Panel Container - Slide from right */
        #cloudpages-manager {
            position: fixed;
            top: 0;
            right: 0;
            width: 85%;
            height: 100vh;
            background: #ffffff;
            box-shadow: -8px 0 32px rgba(0,0,0,0.2);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-left: 1px solid #e5e7eb;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        #cloudpages-manager.minimized {
            transform: translateX(100%);
        }

        /* Toggle Button - CP Maestro */
        .cpm-toggle-btn {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            background: #0176d3;
            color: #ffffff;
            border: none;
            padding: 20px 12px;
            border-radius: 8px 0 0 8px;
            cursor: pointer;
            font-size: 16px;
            z-index: 1000000;
            box-shadow: -2px 2px 12px rgba(0,0,0,0.2);
            font-weight: 600;
            writing-mode: vertical-rl;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .cpm-toggle-btn:hover {
            padding-right: 16px;
            background: #015ca1;
        }

        /* Header */
        .cpm-header {
            background: #0176d3;
            color: #ffffff;
            padding: 0px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }

        .cpm-header-left {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .cpm-logo img {
            width: 150px;
            height: 50px;
            display: block;
        }

        .cpm-header-actions {
            display: flex;
            gap: 10px;
        }

        .cpm-header-btn {
            background: rgba(255,255,255,0.12);
            border: none;
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .cpm-header-btn svg {
            flex-shrink: 0;
        }

        .cpm-header-btn:hover {
            background: rgba(255,255,255,0.22);
        }

        .cpm-header-btn.batch-unpublish {
            color: #8A033E;
            border-color: #FDB6C5;
            background: #FEF0F3;
        }

        .cpm-header-btn.batch-unpublish:hover:not(:disabled) {
            background: #FDDDE3;
            border-color: #E3066A;
            color: #E3066A;
        }

        .cpm-header-btn.batch-publish {
            color: #0B827C;
            border-color: #ACF3E4;
            background: #DEF9F3;
        }

        .cpm-header-btn.batch-publish:hover:not(:disabled) {
            background: #ACF3E4;
            border-color: #06A59A;
            color: #056764;
        }

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

        .cpm-section {
            background: #f9fafb;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .cpm-section-title {
            font-size: 13px;
            font-weight: 600;
            color: #374151;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        }

        /* Token Badges */
        .cpm-token-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
            color: #10b981;
            flex-shrink: 0;
        }

        .cpm-token-badge.error {
            background: rgba(239, 68, 68, 0.1);
            border-color: rgba(239, 68, 68, 0.3);
            color: #ef4444;
        }

        .cpm-token-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
        }

        /* Stats Grid - Clickable Filter Cards */
        .cpm-stats-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
        }

        .cpm-stat {
            background: white;
            padding: 8px 10px;
            border-radius: 6px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: all 0.2s;
            border: 2px solid transparent;
        }

        .cpm-stat:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-color: #0176d3;
        }

        .cpm-stat.active {
            background: #0176d3;
            border-color: #0176d3;
        }

        .cpm-stat.active .cpm-stat-label {
            color: rgba(255,255,255,0.9);
        }

        .cpm-stat.active .cpm-stat-value {
            color: white;
        }

        .cpm-stat-label {
            font-size: 9px;
            color: #6b7280;
            margin-bottom: 3px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .cpm-stat-value {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
        }

        /* Search Bar */
        .cpm-search-bar {
            display: flex;
            gap: 8px;
        }

        #cpm-search-input {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
        }

        #cpm-search-input:focus {
            outline: none;
            border-color: #0176d3;
            box-shadow: 0 0 0 3px rgba(1, 118, 211, 0.1);
        }

        .cpm-btn {
            padding: 10px 16px;
            border: none;
            background: #0176d3;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        }

        .cpm-btn:hover {
            background: #015ca1;
        }

        /* Table Container */
        .cpm-table-container {
            background: white;
            border-radius: 8px;
            overflow-x: auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .cpm-table {
            width: 100%;
            min-width: 900px;
            border-collapse: collapse;
            font-size: 13px;
            table-layout: auto;
        }

        .cpm-table thead th {
            background: #f8fafc;
            padding: 14px 12px;
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            border-bottom: 1px solid #e2e8f0;
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
            padding: 12px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
        }

        .cpm-table tbody tr {
            background: #ffffff;
            transition: all 0.15s ease-out;
        }

        .cpm-table tbody tr:hover {
            background: #f8fafc;
        }

        /* ID Column */
        .cpm-id {
            font-family: monospace;
            font-weight: 600;
            color: #00588F;
            cursor: pointer;
            font-size: 12px;
        }

        .cpm-id:hover {
            text-decoration: underline;
            color: #FF6A39;
        }

        /* Breadcrumb / Folder */
        .cpm-breadcrumb {
            font-size: 12px;
            color: #6b7280;
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
            background: rgba(6, 165, 154, 0.12);
            color: #0B827C;
        }

        .cpm-status.unpublished {
            background: rgba(227, 6, 106, 0.12);
            color: #8A033E;
        }

        .cpm-status.draft {
            background: rgba(255, 183, 93, 0.15);
            color: #8C4B02;
        }

        /* URL Column */
        .cpm-url {
            color: #00588F;
            text-decoration: none;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .cpm-url:hover {
            text-decoration: underline;
            color: #0176d3;
        }

        /* Action Buttons */
        .cpm-actions {
            display: flex;
            gap: 6px;
        }

        .cpm-action-btn {
            padding: 6px 10px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            border-radius: 5px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: #334155;
            white-space: nowrap;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .cpm-action-btn:hover {
            border-color: #0250D9;
            color: #0250D9;
            background: #eff6ff;
        }

        .unpublish-btn {
            color: #8A033E;
            border-color: #FDB6C5;
            background: #FEF0F3;
            min-width: 95px;
            justify-content: center;
        }

        .unpublish-btn:hover {
            background: #FDDDE3;
            border-color: #E3066A;
            color: #E3066A;
        }

        .publish-btn {
            color: #0B827C;
            border-color: #ACF3E4;
            background: #DEF9F3;
            min-width: 95px;
            justify-content: center;
        }

        .publish-btn:hover {
            background: #ACF3E4;
            border-color: #06A59A;
            color: #056764;
        }

        /* Download Icon */
        .cpm-download-icon {
            transition: all 0.2s ease;
        }

        .cpm-download-icon:hover {
            transform: scale(1.15);
            opacity: 0.7;
        }

        /* Checkbox */
        .page-select-checkbox, #cpm-select-all {
            cursor: pointer;
            width: 16px;
            height: 16px;
            accent-color: #0250D9;
        }

        /* Pagination */
        #cpm-pagination {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            background: white;
            border-top: 1px solid #e5e7eb;
            border-radius: 0 0 8px 8px;
        }

        .cpm-pagination-info {
            font-size: 13px;
            color: #6b7280;
            font-weight: 500;
        }

        .cpm-pagination-buttons {
            display: flex;
            gap: 4px;
            align-items: center;
        }

        .cpm-page-btn {
            padding: 6px 12px;
            border: 1px solid #d1d5db;
            background: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: #374151;
            transition: all 0.2s;
            min-width: 36px;
        }

        .cpm-page-btn:hover:not(:disabled) {
            border-color: #0176d3;
            color: #0176d3;
            background: #eff6ff;
        }

        .cpm-page-btn.active {
            background: #0176d3;
            border-color: #0176d3;
            color: white;
            font-weight: 600;
        }

        .cpm-page-btn:disabled {
            opacity: 0.4;
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

        .cpm-skeleton {
            background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: 4px;
            height: 14px;
            display: inline-block;
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
            
            // Update filter state - DO NOT reset page
            window.CPM_STATE.currentFilter = statCard.dataset.filter;
            renderTable();
            // Enrich visible items after filter change
            enrichVisibleItems(appcoreToken);
        });
    }
    
    // Refresh button
    document.getElementById('cpm-refresh')?.addEventListener('click', () => {
        loadAllData(pageHookToken, appcoreToken);
    });
    
    // Export CSV button
    document.getElementById('cpm-export-csv')?.addEventListener('click', () => {
        exportToCSV();
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
    document.getElementById('cpm-batch-move')?.addEventListener('click', () => {
        batchMoveDebug(pageHookToken);
    });
    
    // Pagination (delegated)
    document.getElementById('cpm-pagination')?.addEventListener('click', (e) => {
        const pageBtn = e.target.closest('.cpm-page-btn');
        if (pageBtn && !pageBtn.disabled) {
            const page = parseInt(pageBtn.dataset.page);
            if (!isNaN(page) && page > 0) {
                window.CPM_STATE.currentPage = page;
                
                // If in search mode, fetch new page
                if (window.CPM_STATE.isSearchMode && window.CPM_STATE.currentSearchTerm) {
                    performEnhancedSearch(window.CPM_STATE.currentSearchTerm);
                } else {
                    renderTable();
                    // Enrich visible items on page change
                    enrichVisibleItems(appcoreToken);
                }
                
                // Scroll to top of table
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
}

// Enhanced search with proper query endpoint - LOAD ONE PAGE AT A TIME
async function performEnhancedSearch(searchTerm) {
    if (!searchTerm.trim()) {
        // Return to normal mode
        window.CPM_STATE.isSearchMode = false;
        window.CPM_STATE.currentSearchTerm = '';
        window.CPM_STATE.itemsPerPage = 100;
        window.CPM_STATE.currentPage = 1;
        
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
        const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query?scope=ours`;

        // Get current token
        const tokenResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve);
        });
        
        if (!tokenResponse || !tokenResponse.success || !tokenResponse.tokens.pageHookToken) {
            throw new Error('No token available for search');
        }

        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: url,
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json;datekind=local',
                        'X-CSRF-Token': tokenResponse.tokens.pageHookToken
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
        showNotification(`Search completed: ${allSearchResults.length} results. Enriching...`, 'info');

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
    
    // Validate token
    if (!pageHookToken || pageHookToken.length < 50) {
        console.warn('[CloudPage Maestro] Invalid or missing pageHookToken, retrying...');
        showNotification('Waiting for authentication token...', 'warning');
        
        // Retry after 2 seconds to give token capture time
        setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
                if (response && response.success && response.tokens.pageHookToken) {
                    loadAllData(response.tokens.pageHookToken, response.tokens.appcoreToken, retryCount + 1);
                } else {
                    showNotification('Please refresh the page or navigate to Content Builder to capture token', 'error');
                }
            });
        }, 2000);
        return;
    }
    
    showLoading(true);
    
    // Clear enrichment cache on refresh to get fresh status
    window.CPM_STATE.enrichmentCache.clear();
    console.log('[CloudPage Maestro] Cleared enrichment cache for fresh data');
    
    try {
        console.log('[CloudPage Maestro] Loading landing pages and code resources...');
        
        // 1. Fetch landing pages from CloudPages API (has correct status and URL)
        console.log('[CloudPage Maestro] Fetching landing pages from CloudPages API...');
        console.log('[CloudPage Maestro] Using appcoreToken:', appcoreToken ? appcoreToken.substring(0, 20) + '...' : 'MISSING');
        
        window.CPM_STATE.landingPages = [];
        let lpPage = 1;
        let hasMoreLP = true;
        
        // Try to fetch from CloudPages API, but don't fail if it doesn't work
        try {
            while (hasMoreLP) {
                const result = await fetchLandingPagesAPI(stack, appcoreToken, lpPage, 100);
                window.CPM_STATE.landingPages = window.CPM_STATE.landingPages.concat(result.items);
                hasMoreLP = result.hasMore;
                lpPage++;
                
                // Safety limit
                if (lpPage > 50) break;
            }
            
            console.log('[CloudPage Maestro] Loaded', window.CPM_STATE.landingPages.length, 'landing pages from CloudPages API');
        } catch (error) {
            console.warn('[CloudPage Maestro] CloudPages API fetch failed:', error.message);
            console.warn('[CloudPage Maestro] Will continue with Content Builder data only (status/URL will not be available)');
        }
        
        // 2. Fetch all assets from Content Builder API (for code resources + category info)
        console.log('[CloudPage Maestro] Fetching assets from Content Builder API...');
        let allContentBuilderAssets = [];
        let cbPage = 1;
        let hasMoreCB = true;
        
        while (hasMoreCB) {
            const result = await fetchCloudPagesAPI(stack, pageHookToken, cbPage, 100);
            allContentBuilderAssets = allContentBuilderAssets.concat(result.items);
            hasMoreCB = result.hasMore;
            cbPage++;
            
            // Safety limit
            if (cbPage > 50) break;
        }
        
        console.log('[CloudPage Maestro] Loaded', allContentBuilderAssets.length, 'assets from Content Builder');
        
        // 3. Build a map of landing pages from CloudPages API by siteAssetId for quick lookup
        const cloudPagesMap = new Map();
        window.CPM_STATE.landingPages.forEach(lp => {
            if (lp.siteAssetId) {
                cloudPagesMap.set(lp.siteAssetId, lp);
            }
        });
        
        console.log('[CloudPage Maestro] CloudPages API returned', cloudPagesMap.size, 'landing pages with status/URL');
        
        // 4. Get ALL landing pages from Content Builder (the source of truth for what exists)
        const cbLandingPages = allContentBuilderAssets.filter(asset => 
            asset.assetType?.name?.toLowerCase() === 'landingpage'
        );
        
        console.log('[CloudPage Maestro] Content Builder has', cbLandingPages.length, 'landing pages');
        
        // 5. Merge: For each Content Builder landing page, enrich with CloudPages data if available
        const landingPageItems = cbLandingPages.map(cbAsset => {
            const cloudPageData = cloudPagesMap.get(cbAsset.id);
            
            return {
                id: cbAsset.id,
                pageId: cloudPageData?.id || null,
                name: cbAsset.name,
                assetType: cbAsset.assetType,
                // Use CloudPages status/URL if available, otherwise default to Draft
                status: cloudPageData?.status?.status || cbAsset.status?.status || 'Draft',
                url: cloudPageData?.url || null,
                modifiedDate: cbAsset.modifiedDate,
                createdDate: cbAsset.createdDate,
                modifiedBy: cbAsset.modifiedBy,
                createdBy: cbAsset.createdBy,
                category: cbAsset.category,
                customerKey: cbAsset.customerKey,
                meta: cbAsset.meta
            };
        });
        
        console.log('[CloudPage Maestro] Created', landingPageItems.length, 'landing page items with merged data');
        
        // Skip enrichment for now - we'll lazy-load status/URL when needed
        // This makes initial load much faster
        console.log('[CloudPage Maestro] Skipping bulk enrichment - will fetch on-demand');
        
        // 7. Filter code resources from Content Builder assets
        const codeResourceItems = allContentBuilderAssets.filter(asset => {
            const typeName = asset.assetType?.name?.toLowerCase() || '';
            return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource'].includes(typeName);
        }).map(asset => ({
            ...asset,
            status: asset.status?.status || 'Draft',
            url: null,
            pageId: null
        }));
        
        console.log('[CloudPage Maestro] Created', codeResourceItems.length, 'code resource items');
        
        // 8. Combine all items and update state
        window.CPM_STATE.allAssets = [...landingPageItems, ...codeResourceItems];
        window.CPM_STATE.landingPages = landingPageItems; // Update landingPages to match
        window.CPM_STATE.allAssetsForCategories = allContentBuilderAssets;
        
        console.log('[CloudPage Maestro] Total items:', window.CPM_STATE.allAssets.length, '(', landingPageItems.length, 'landing pages +', codeResourceItems.length, 'code resources)');
        
        // Build category tree
        await buildCategoryTree(pageHookToken);
        
        // Update stats and render
        updateStats();
        renderTable();
        
        // Automatically enrich visible items
        console.log('[CloudPage Maestro] Starting automatic enrichment of visible items...');
        enrichVisibleItems(appcoreToken);
        
        // Hide loading and show success
        showLoading(false);
        showNotification('Loaded ' + window.CPM_STATE.allAssets.length + ' items successfully', 'success');
        
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

// Extract stack from URL
function getStack() {
    const match = window.location.href.match(/mc\.([^.]+)\.exacttarget\.com/);
    return match ? match[1] : null;
}

// Fetch landing pages from CloudPages API (gives correct status and URL)
async function fetchLandingPagesAPI(stack, appcoreToken, page = 1, pageSize = 100) {
    if (!appcoreToken || appcoreToken.length < 20) {
        console.warn('[CloudPage Maestro] Invalid appcoreToken for CloudPages API, skipping...');
        return { items: [], totalCount: 0, hasMore: false };
    }
    
    const url = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages?$page=${page}&$pageSize=${pageSize}&$orderBy=modifiedDate desc`;
    
    console.log('[CloudPage Maestro] Fetching CloudPages API page', page, 'with token:', appcoreToken.substring(0, 20) + '...');
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': appcoreToken
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
async function fetchSiteDetails(assetId, appcoreToken, stack) {
    const url = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': appcoreToken
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
    
    visibleRows.forEach(row => {
        const itemId = row.dataset.itemId;
        const item = window.CPM_STATE.allAssets.find(a => String(a.id) === String(itemId));
        
        if (item) {
            // Only check cache - if cache was cleared (on refresh), item will be re-enriched
            const cached = window.CPM_STATE.getCachedEnrichment(parseInt(itemId));
            if (!cached) {
                itemsToEnrich.push(item);
            } else {
                // Apply cached data to item
                item.siteId = cached.siteId;
                item.pageId = cached.pageId;
                item.status = cached.status;
                item.url = cached.url;
            }
        }
    });
    
    console.log('[CloudPage Maestro] Enriching', itemsToEnrich.length, 'visible items (', visibleRows.length - itemsToEnrich.length, 'from cache)');
    
    if (itemsToEnrich.length === 0) {
        console.log('[CloudPage Maestro] All visible items already enriched');
        if (visibleRows.length > 0) {
            renderTable(); // Re-render to show cached data
        }
        return;
    }
    
    // Increment enrichment session to cancel any stale requests
    window.CPM_STATE.currentEnrichmentSession++;
    const currentSession = window.CPM_STATE.currentEnrichmentSession;
    
    // Process items in batches using the request queue
    let enrichedCount = 0;
    const batchSize = 5; // Update UI every 5 items
    
    showNotification(`Enriching ${itemsToEnrich.length} items...`, 'info');
    
    for (const item of itemsToEnrich) {
        // Check if session is still valid
        if (currentSession !== window.CPM_STATE.currentEnrichmentSession) {
            console.log('[CloudPage Maestro] Enrichment session cancelled');
            return;
        }
        
        try {
            const siteData = await fetchSiteDetails(item.id, appcoreToken, stack);
            
            if (siteData) {
                // Update the item in state
                item.siteId = siteData.siteId;
                item.pageId = siteData.id;
                item.status = siteData.status;
                item.url = siteData.url;
                
                // Cache the result
                window.CPM_STATE.setCachedEnrichment(item.id, {
                    siteId: siteData.siteId,
                    pageId: siteData.id,
                    status: siteData.status,
                    url: siteData.url
                });
                
                console.log('[CloudPage Maestro] ✓ Enriched:', item.name, '- Status:', item.status, 'URL:', item.url);
            } else {
                // No site found - mark as draft with no site
                item.status = 'Draft';
                item.siteId = null;
                console.log('[CloudPage Maestro] ⚠ No site for:', item.name);
            }
            
            enrichedCount++;
            
            // Re-render every batch to show progress
            if (enrichedCount % batchSize === 0) {
                renderTable();
            }
        } catch (error) {
            console.error('[CloudPage Maestro] Error enriching item:', item.name, error);
        }
    }
    
    // Final re-render
    if (enrichedCount > 0) {
        renderTable();
        showNotification(`Enrichment complete: ${enrichedCount} items`, 'success');
        console.log('[CloudPage Maestro] Enrichment complete:', enrichedCount, 'items enriched');
    }
}

// Fetch CloudPages via Content Builder API (for code resources)
async function fetchCloudPagesAPI(stack, token, page = 1, pageSize = 100) {
    const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query?scope=ours`;
    
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
                    'Content-Type': 'application/json;datekind=local',
                    'X-CSRF-Token': token
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
                    hasMore: (data.items || []).length === pageSize
                });
            } else {
                reject(new Error(response ? response.error : 'Request failed'));
            }
        });
    });
}

// Update stats dashboard
function updateStats(displayedItems = null) {
    // Overview shows TOTAL count from the API (all items in system)
    // Other filters show counts from the CURRENTLY DISPLAYED items on the page
    // This way filter counts reflect what's visible, not reset to 0
    const itemsForCount = displayedItems || window.CPM_STATE.allAssets;
    
    // Always count from the displayed items to show what's on screen
    const stats = {
        // Total: show the API total count (all items in system)
        total: window.CPM_STATE.assetsTotalCount || window.CPM_STATE.allAssets.length,
        // Filter counts: from currently displayed items on the page
        landing: itemsForCount.filter(a => a.assetType?.name?.toLowerCase() === 'landingpage').length,
        json: itemsForCount.filter(a => a.assetType?.name?.toLowerCase() === 'jsoncoderesource').length,
        js: itemsForCount.filter(a => {
            const type = a.assetType?.name?.toLowerCase();
            return type === 'jscoderesource' || type === 'codesnippetblock';
        }).length,
        css: itemsForCount.filter(a => a.assetType?.name?.toLowerCase() === 'csscoderesource').length
    };
    
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
    
    // Pagination - In search mode, items are already paginated by API
    let paginatedItems;
    let totalPages;
    
    if (window.CPM_STATE.isSearchMode) {
        // Search mode: Items already paginated, use total from API
        paginatedItems = items;
        totalPages = Math.ceil(window.CPM_STATE.assetsTotalCount / window.CPM_STATE.itemsPerPage);
    } else {
        // Normal mode: Client-side pagination
        totalPages = Math.ceil(items.length / window.CPM_STATE.itemsPerPage);
        const startIndex = (window.CPM_STATE.currentPage - 1) * window.CPM_STATE.itemsPerPage;
        paginatedItems = items.slice(startIndex, startIndex + window.CPM_STATE.itemsPerPage);
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
    
    // Render pagination
    renderPagination(totalPages, items.length);
    
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
    
    // Action buttons (publish, unpublish, copy)
    tbody.querySelectorAll('.cpm-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            const id = e.currentTarget.dataset.id;
            const assetId = e.currentTarget.dataset.assetid;
            const pageId = e.currentTarget.dataset.pageid;
            const siteId = e.currentTarget.dataset.siteid;
            const type = e.currentTarget.dataset.type;
            
            if (action === 'copy') {
                copyToClipboard(id);
                showNotification(`ID ${id} copied to clipboard`, 'success');
            } else if (action === 'unpublish') {
                console.log('[CloudPage Maestro] Unpublish clicked - type:', type, 'id:', id, 'assetId:', assetId, 'siteId:', siteId);
                unpublishItem(id, type, assetId, siteId);
            } else if (action === 'publish') {
                console.log('[CloudPage Maestro] Publish clicked - type:', type, 'id:', id, 'assetId:', assetId, 'siteId:', siteId);
                publishItem(id, type, assetId, siteId);
            }
        });
    });
    
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
function renderPagination(totalPages, totalItems) {
    const container = document.getElementById('cpm-pagination');
    if (!container) return;
    
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
    
    let html = `<div style="color: #1e3a5f; font-size: 0.875rem; font-weight: 500;">${displayText}</div>`;
    
    if (totalPages > 1) {
        html += '<div style="display: flex; gap: 0.375rem;">';
        
        // First Page
        const firstDisabled = window.CPM_STATE.currentPage === 1;
        html += `<button class="cpm-page-btn" data-page="1" ${firstDisabled ? 'disabled' : ''} style="
            padding: 8px 14px;
            border: 1px solid ${firstDisabled ? '#e5e7eb' : '#0176d3'};
            background: ${firstDisabled ? '#f3f4f6' : 'white'};
            color: ${firstDisabled ? '#9ca3af' : '#0176d3'};
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
            border: 1px solid ${prevDisabled ? '#e5e7eb' : '#0176d3'};
            background: ${prevDisabled ? '#f3f4f6' : 'white'};
            color: ${prevDisabled ? '#9ca3af' : '#0176d3'};
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
                border: 1px solid ${isActive ? '#0176d3' : '#e5e7eb'};
                background: ${isActive ? '#0176d3' : 'white'};
                color: ${isActive ? 'white' : '#374151'};
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: ${isActive ? '600' : '400'};
                transition: all 0.2s;
                ${isActive ? 'box-shadow: 0 2px 8px rgba(1, 118, 211, 0.3);' : ''}
            ">${i}</button>`;
        }
        
        // Next
        const nextDisabled = window.CPM_STATE.currentPage === totalPages;
        html += `<button class="cpm-page-btn" data-page="${window.CPM_STATE.currentPage + 1}" ${nextDisabled ? 'disabled' : ''} style="
            padding: 8px 14px;
            border: 1px solid ${nextDisabled ? '#e5e7eb' : '#0176d3'};
            background: ${nextDisabled ? '#f3f4f6' : 'white'};
            color: ${nextDisabled ? '#9ca3af' : '#0176d3'};
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
            border: 1px solid ${lastDisabled ? '#e5e7eb' : '#0176d3'};
            background: ${lastDisabled ? '#f3f4f6' : 'white'};
            color: ${lastDisabled ? '#9ca3af' : '#0176d3'};
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
    
    // Update unpublish button
    if (unpublishCountEl) unpublishCountEl.textContent = unpublishCount;
    if (batchUnpublishBtn) {
        batchUnpublishBtn.disabled = unpublishCount === 0;
        batchUnpublishBtn.style.opacity = unpublishCount > 0 ? '1' : '0.5';
    }
    
    // Update publish button
    if (publishCountEl) publishCountEl.textContent = publishCount;
    if (batchPublishBtn) {
        batchPublishBtn.disabled = publishCount === 0;
        batchPublishBtn.style.opacity = publishCount > 0 ? '1' : '0.5';
    }
    
    // Update move button
    if (moveCountEl) moveCountEl.textContent = totalSelected;
    if (batchMoveBtn) {
        batchMoveBtn.disabled = totalSelected === 0;
        batchMoveBtn.style.opacity = totalSelected > 0 ? '1' : '0.5';
    }
    
    // Show/hide bulk bar
    if (bulkBar) bulkBar.style.display = totalSelected > 0 ? 'flex' : 'none';
}

// Export to CSV
function exportToCSV() {
    const headers = ['Name', 'Type', 'Status', 'Folder', 'Modified Date', 'URL'];
    const rows = window.CPM_STATE.allAssets.map(item => {
        return [
            item.name,
            item.assetType?.displayName || item.assetType?.name || '',
            item.status?.status || 'Draft',
            item.category?.name || 'Cloud Pages',
            new Date(item.modifiedDate).toLocaleString(),
            item.status?.url || ''
        ];
    });
    
    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloudpages_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    showNotification('CSV exported successfully', 'success');
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
    
    showLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const item of unpublishItems) {
        try {
            if (item.type === 'landing') {
                console.log('[CloudPage Maestro] Unpublishing landing page:', item.siteId);
                await unpublishPage(item.siteId, appcoreToken);
            } else {
                console.log('[CloudPage Maestro] Unpublishing code resource:', item.assetId);
                await unpublishCodeResource(item.assetId, appcoreToken);
            }
            successCount++;
            showNotification(`Progress: ${successCount}/${unpublishItems.length} unpublished`, 'info');
        } catch (error) {
            failCount++;
            console.error('[CloudPage Maestro] Failed to unpublish item:', item.id, error);
        }
    }
    
    showLoading(false);
    showNotification(`Completed: ${successCount} success, ${failCount} failed. Click Refresh to update.`, successCount > 0 ? 'success' : 'error');
    
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
    
    showLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const item of publishItems) {
        try {
            if (item.type === 'landing') {
                console.log('[CloudPage Maestro] Publishing landing page:', item.siteId);
                await publishPage(item.siteId, appcoreToken);
            } else {
                console.log('[CloudPage Maestro] Publishing code resource:', item.assetId);
                await publishCodeResource(item.assetId, appcoreToken);
            }
            successCount++;
            showNotification(`Progress: ${successCount}/${publishItems.length} published`, 'info');
        } catch (error) {
            failCount++;
            console.error('[CloudPage Maestro] Failed to publish item:', item.id, error);
        }
    }
    
    showLoading(false);
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
            const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/categories?categoryType=cloudpages&$page=${currentPage}&$pagesize=${pageSize}`;
            
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'MAKE_REQUEST',
                    config: {
                        url: url,
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': pageHookToken
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
            
            console.log(`[DEBUG] Page ${currentPage}: Fetched ${items.length} folders (Total: ${totalCount})`);
            
            // Add folders from this page
            allFolders.push(...items);
            
            // Stop if we got no items or if we have all folders
            if (items.length === 0 || allFolders.length >= totalCount) {
                break;
            }
            
            currentPage++;
        }
        
        console.log(`[DEBUG] Fetched all ${allFolders.length} folders from ${currentPage} page(s)`);
        
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
    showNotification('Fetching folders...', 'info');
    const foldersResponse = await fetchAllFolders(pageHookToken);
    
    if (!foldersResponse) {
        showNotification('Failed to fetch folders', 'error');
        return;
    }
    
    const { tree, folderMap } = buildFolderTree(foldersResponse);
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'cpm-folder-picker-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        animation: fadeIn 0.2s ease-out;
    `;
    
    // Create modal container
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
        border-bottom: 1px solid #e5e7eb;
    `;
    header.innerHTML = `
        <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
            Move ${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''} to folder
        </h2>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">
            Select a destination folder
        </p>
    `;
    
    // Search box
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `padding: 16px 24px; border-bottom: 1px solid #e5e7eb;`;
    searchContainer.innerHTML = `
        <input 
            type="text" 
            id="cpm-folder-search" 
            placeholder="Search folders..." 
            style="
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s;
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
            color: #111827;
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
            
            itemWrapper.style.background = '#eff6ff';
            itemWrapper.style.boxShadow = 'inset 0 0 0 2px #3b82f6';
            selectedFolderId = node.id;
            
            // Enable move button
            document.getElementById('cpm-folder-move-btn').disabled = false;
        });
        
        // Hover effect
        itemWrapper.addEventListener('mouseenter', () => {
            if (selectedFolderId !== node.id) {
                itemWrapper.style.background = '#f9fafb';
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
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        padding: 10px 20px;
        border: 1px solid #d1d5db;
        background: white;
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

// Perform the actual batch move operation
async function performBatchMove(selectedIds, targetFolderId, pageHookToken, folderMap) {
    const targetFolder = folderMap.get(targetFolderId);
    showNotification(`Moving ${selectedIds.length} items to "${targetFolder.name}"...`, 'info');
    
    const stack = window.CPM_STATE.stack || getStack();
    let successCount = 0;
    let failCount = 0;
    
    console.log('[CloudPage Maestro] Moving items:', selectedIds);
    console.log('[CloudPage Maestro] Target folder:', targetFolderId, targetFolder.name);
    
    // Move items one by one
    for (const assetId of selectedIds) {
        try {
            const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/${assetId}`;
            
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'MAKE_REQUEST',
                    config: {
                        url: url,
                        method: 'PATCH',
                        headers: {
                            'Accept': '*/*',
                            'Content-Type': 'application/json;datekind=local',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'X-CSRF-Token': pageHookToken
                        },
                        body: JSON.stringify({
                            id: assetId.toString(),
                            category: {
                                id: targetFolderId.toString()
                            }
                        })
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
            
            successCount++;
            console.log(`[CloudPage Maestro] Moved asset ${assetId} successfully`);
            // Clear cache for this item
            window.CPM_STATE.enrichmentCache.delete(parseInt(assetId));
        } catch (error) {
            failCount++;
            console.error(`[CloudPage Maestro] Error moving asset ${assetId}:`, error);
        }
    }
    
    // Show result notification
    if (failCount === 0) {
        showNotification(`Successfully moved ${successCount} items to "${targetFolder.name}". Click Refresh to update.`, 'success');
    } else if (successCount === 0) {
        showNotification(`Failed to move all ${failCount} items`, 'error');
    } else {
        showNotification(`Moved ${successCount} items, ${failCount} failed. Click Refresh to update.`, 'warning');
    }
    
    // Clear selection - don't auto-refresh, let user do it manually
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

// Universal unpublish - works for both landing pages and code resources
async function unpublishItem(id, type, assetId, siteId) {
    const itemType = type === 'landing' ? 'Landing Page' : 'Code Resource';
    if (!confirm(`Unpublish this ${itemType}?`)) return;
    
    chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, async (response) => {
        if (!response || !response.success) {
            showNotification('Error: Authentication tokens not available', 'error');
            return;
        }
        
        // Don't show skeleton loading for single item actions
        showNotification(`Unpublishing ${itemType}...`, 'info');
        
        try {
            if (type === 'landing') {
                // Landing pages use the landing-pages endpoint with siteId
                console.log('[CloudPage Maestro] Unpublishing Landing Page:', siteId);
                await unpublishPage(siteId, response.tokens.appcoreToken);
            } else {
                // Code resources use the code-resources endpoint
                console.log('[CloudPage Maestro] Unpublishing Code Resource:', assetId);
                await unpublishCodeResource(assetId, response.tokens.appcoreToken);
            }
            showNotification(`${itemType} unpublished successfully. Click Refresh to update.`, 'success');
            // Clear cache for this item so it gets re-enriched on refresh
            window.CPM_STATE.enrichmentCache.delete(parseInt(assetId));
        } catch (error) {
            console.error('[CloudPage Maestro] Unpublish error:', error);
            showNotification('Error: ' + error.message, 'error');
        }
    });
}

// Universal publish - works for both landing pages and code resources
async function publishItem(id, type, assetId, siteId) {
    const itemType = type === 'landing' ? 'Landing Page' : 'Code Resource';
    if (!confirm(`Publish this ${itemType}?`)) return;
    
    chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, async (response) => {
        if (!response || !response.success) {
            showNotification('Error: Authentication tokens not available', 'error');
            return;
        }
        
        // Don't show skeleton loading for single item actions
        showNotification(`Publishing ${itemType}...`, 'info');
        
        try {
            if (type === 'landing') {
                // Landing pages use the landing-pages endpoint with siteId
                console.log('[CloudPage Maestro] Publishing Landing Page:', siteId);
                await publishPage(siteId, response.tokens.appcoreToken);
            } else {
                // Code resources use the code-resources endpoint
                console.log('[CloudPage Maestro] Publishing Code Resource:', assetId);
                await publishCodeResource(assetId, response.tokens.appcoreToken);
            }
            showNotification(`${itemType} published successfully. Click Refresh to update.`, 'success');
            // Clear cache for this item so it gets re-enriched on refresh
            window.CPM_STATE.enrichmentCache.delete(parseInt(assetId));
        } catch (error) {
            console.error('[CloudPage Maestro] Publish error:', error);
            showNotification('Error: ' + error.message, 'error');
        }
    });
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
                showNotification(`Updated: ${item.name} - ${item.status}`, 'success');
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
    
    showNotification('Downloading HTML...', 'info');
    
    try {
        // Get tokens
        const tokenResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve);
        });
        
        if (!tokenResponse || !tokenResponse.success || !tokenResponse.tokens.appcoreToken) {
            throw new Error('No CloudPages token available');
        }
        
        const appcoreToken = tokenResponse.tokens.appcoreToken;
        
        console.log(`[CloudPage Maestro] Downloading HTML for "${name}"...`);
        
        // Step 1: Get siteId from sites endpoint
        const siteUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;
        
        const siteResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: siteUrl,
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
        
        const site = siteResponse.entities?.[0];
        if (!site) {
            throw new Error('No site found for this landing page');
        }
        
        const siteId = site.siteId;
        console.log(`[CloudPage Maestro] Site ID: ${siteId}`);
        
        // Step 2: Get stateId from states endpoint
        const statesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/`;
        
        const statesResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: statesUrl,
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
        const contentsUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/${stateId}/contents/`;
        
        const contentsResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: contentsUrl,
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
    
    showNotification('Downloading file...', 'info');
    
    try {
        // Get tokens
        const tokenResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, resolve);
        });
        
        if (!tokenResponse || !tokenResponse.success || !tokenResponse.tokens.pageHookToken) {
            throw new Error('No Content Builder token available');
        }
        
        const pageHookToken = tokenResponse.tokens.pageHookToken;
        
        console.log(`[CloudPage Maestro] Downloading ${assetType} for "${name}"...`);
        
        // Get asset details from Content Builder API
        const assetUrl = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/${assetId}`;
        
        const assetResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'MAKE_REQUEST',
                config: {
                    url: assetUrl,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': pageHookToken
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
        <div>
            <div style="font-weight: 600; margin-bottom: 0.25rem; color: #1e3a5f;">${title}</div>
            <div style="font-size: 0.875rem; color: #4a5568;">${message}</div>
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 4000);

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
