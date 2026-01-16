// ==UserScript==
// @name         CloudPage Maestro - Optimized v5 (SFMC CloudPages & Assets Manager)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Optimized: Lazy enrichment, request pooling, caching for large datasets
// @author       Aldorino
// @match        https://cloud-pages.*.marketingcloudapps.com/*
// @match        https://content-builder.*.marketingcloudapps.com/*
// @match        https://*.marketingcloudapps.com/*
// @icon         data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">📄</text></svg>
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    let stack = null;
    const stackMatch = window.location.hostname.match(/\.(s\d+)\./);
    if (stackMatch) {
        stack = stackMatch[1];
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

    // Dual Token Storage Keys - SEPARATE TOKENS
    const STORAGE_KEYS = {
        pageHookToken: 'csrfToken_pagehook',        // For search/query operations
        appcoreToken: 'csrfToken_appcore',          // For publish/unpublish operations
        pageHookSource: 'csrfToken_pagehook_source',
        appcoreSource: 'csrfToken_appcore_source'
    };

    // State Management
    let landingPages = [];
    let landingPagesMap = new Map(); // siteAssetId -> landing page for instant lookup
    let allAssets = [];
    let allAssetsForCategories = [];
    let categories = new Map();

    // SEPARATE Token System - DO NOT MIX THESE
    let pageHookToken = GM_getValue(STORAGE_KEYS.pageHookToken, null);    // For CB queries
    let appcoreToken = GM_getValue(STORAGE_KEYS.appcoreToken, null);      // For CP publish/unpublish
    let pageHookSource = GM_getValue(STORAGE_KEYS.pageHookSource, null);
    let appcoreSource = GM_getValue(STORAGE_KEYS.appcoreSource, null);

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
    // ICONOIR SVG ICONS - Modern stroke-based icons
    // ============================================
    const ICONS = {
        // Actions
        cloudUpload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13V22"/><path d="M9 16L12 13L15 16"/><path d="M20 17.607C21.262 16.534 22 14.938 22 13.173C22 9.826 19.379 7.102 16.098 7.102C15.756 7.102 15.419 7.13 15.09 7.185C14.097 4.712 11.739 3 9 3C5.134 3 2 6.177 2 10.098C2 12.002 2.756 13.735 4 14.985"/></svg>',
        refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.168 8A10.003 10.003 0 0012 2C6.477 2 2 6.477 2 12s4.477 10 10 10c4.478 0 8.268-2.943 9.542-7"/><path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3"/></svg>',
        download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20H18"/><path class="download-arrow" d="M12 4V16M12 16L15.5 12.5M12 16L8.5 12.5"/></svg>',
        eyeClosed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3L21 21"/><path d="M10.584 10.587C10.2087 10.962 9.99778 11.4708 9.99756 12.0013C9.99733 12.5318 10.2078 13.0408 10.5828 13.416C10.9578 13.7913 11.4666 14.0022 11.9971 14.0024C12.5276 14.0027 13.0366 13.7922 13.412 13.4172"/><path d="M17.357 17.349C15.726 18.449 13.942 19 12 19C8.278 19 4.889 16.002 3 13.011C4.055 11.282 5.511 9.592 7.373 8.349"/><path d="M19.8 14.2C20.5 13.38 21.034 12.543 21.367 11.782C21.4998 11.474 21.5 11.128 21.367 10.82C20.1 8.181 16.688 4 12 4C11.341 4 10.696 4.079 10.066 4.232"/></svg>',
        cancel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.758 17.243L12.001 12M17.244 6.757L12.001 12M12.001 12L6.758 6.757M12.001 12L17.244 17.243"/></svg>',
        copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 20H9.6C9.26863 20 9 19.7314 9 19.4V9.6C9 9.26863 9.26863 9 9.6 9H19.4C19.7314 9 20 9.26863 20 9.6V19.4C20 19.7314 19.7314 20 19.4 20Z"/><path d="M15 9V4.6C15 4.26863 14.7314 4 14.4 4H4.6C4.26863 4 4 4.26863 4 4.6V14.4C4 14.7314 4.26863 15 4.6 15H9"/></svg>',
        externalLink: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L15 3M21 3L12 12M21 3V9"/><path d="M21 13V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H11"/></svg>',
        
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

    // API Endpoints
    const ENDPOINTS = {
        landingPages: `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages`,
        assetsQuery: `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query?scope=ours`,
        assetsLegacy: `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets`,
        unpublish: (id) => `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${id}/unpublish`,
        categories: (id) => `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/categories/${id}`
    };

    function getAssetTypeInfo(assetType) {
        if (!assetType) return { name: 'Unknown', icon: ICONS.page, color: '#6b7280' };
        const key = assetType.name ? assetType.name.toLowerCase() : '';
        return ASSET_TYPE_CONFIG[key] || { name: assetType.displayName || 'Other', icon: ICONS.page, color: '#6b7280' };
    }

    // Decode unicode escaped HTML
    function decodeHTML(html) {
        // Replace unicode escapes like \u003C with actual characters
        return html.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
            return String.fromCharCode(parseInt(code, 16));
        });
    }

    // Download HTML file
    function downloadHTML(filename, html) {
        const decodedHTML = decodeHTML(html);
        const blob = new Blob([decodedHTML], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✓ Downloaded:', a.download);
    }

    // Generic file download
    function downloadFile(filename, content, extension, mimeType) {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + extension;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✓ Downloaded:', a.download);
    }

    // Fetch HTML content for a landing page
    async function fetchLandingPageHTML(landingPage) {
        if (!appcoreToken) {
            alert('No CloudPages token available! The APPCORE token is needed to fetch HTML content.');
            return;
        }

        console.log(`📥 Fetching HTML for "${landingPage.name}"...`);

        try {
            // Step 1: Get siteId from sites endpoint
            console.log(`📡 Step 1: Fetching site details for asset ${landingPage.assetId}...`);
            const siteUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${landingPage.assetId}`;
            
            const siteResponse = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: siteUrl,
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': appcoreToken
                    },
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(JSON.parse(response.responseText));
                        } else {
                            reject(new Error(`Sites API error: ${response.status}`));
                        }
                    },
                    onerror: reject
                });
            });

            const site = siteResponse.entities?.[0];
            if (!site) {
                throw new Error('No site found for this landing page');
            }

            const siteId = site.siteId;
            console.log(`✓ Site ID: ${siteId}`);

            // Step 2: Get stateId from states endpoint
            console.log(`📡 Step 2: Fetching states for site ${siteId}...`);
            const statesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/`;
            
            const statesResponse = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: statesUrl,
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': appcoreToken
                    },
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(JSON.parse(response.responseText));
                        } else {
                            reject(new Error(`States API error: ${response.status}`));
                        }
                    },
                    onerror: reject
                });
            });

            const state = statesResponse.entities?.[0];
            if (!state) {
                throw new Error('No state found for this landing page');
            }

            const stateId = state.stateId;
            console.log(`✓ State ID: ${stateId}`);

            // Step 3: Get HTML content from contents endpoint
            console.log(`📡 Step 3: Fetching HTML content for state ${stateId}...`);
            const contentsUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${siteId}/states/${stateId}/contents/`;
            
            const contentsResponse = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: contentsUrl,
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': appcoreToken
                    },
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(JSON.parse(response.responseText));
                        } else {
                            reject(new Error(`Contents API error: ${response.status}`));
                        }
                    },
                    onerror: reject
                });
            });

            const content = contentsResponse.entities?.[0];
            if (!content) {
                throw new Error('No content found for this landing page');
            }

            const html = content.html;
            console.log(`✓ HTML fetched (${html.length} characters)`);

            // Download the HTML file
            downloadHTML(landingPage.name, html);
            console.log(`✓ Downloaded "${landingPage.name}.html"`);

        } catch (error) {
            console.error('❌ Error fetching HTML:', error);
            alert(`Error downloading HTML: ${error.message}`);
        }
    }

    // Fetch code resource content
    async function fetchCodeResourceContent(codeResource) {
        if (!pageHookToken) {
            alert('No Content Builder token available! The page hook token is needed to fetch code resource content.');
            return;
        }

        console.log(`📥 Fetching content for "${codeResource.name}"...`);

        try {
            // Get asset details from Content Builder API
            const assetUrl = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/${codeResource.assetId}`;
            
            const assetResponse = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: assetUrl,
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': pageHookToken
                    },
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(JSON.parse(response.responseText));
                        } else {
                            reject(new Error(`Asset API error: ${response.status}`));
                        }
                    },
                    onerror: reject
                });
            });

            // Extract content based on asset type
            let content = '';
            let extension = '.txt';
            let mimeType = 'text/plain';

            const assetTypeName = assetResponse.assetType?.name?.toLowerCase() || '';
            
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

            console.log(`✓ Content fetched (${content.length} characters)`);

            // Download the file
            downloadFile(codeResource.name, content, extension, mimeType);
            console.log(`✓ Downloaded "${codeResource.name}${extension}"`);

        } catch (error) {
            console.error('❌ Error fetching code resource:', error);
            alert(`Error downloading code resource: ${error.message}`);
        }
    }

    // Page Hook Token Capture (for search/query operations)
    function injectPageHook() {
        const code = `
            (function(){
                try {
                    const origFetch = window.fetch;
                    window.fetch = function(resource, config){
                        try {
                            const urlStr = (typeof resource === 'string') ? resource : (resource && resource.url) || '';
                            const headers = config && config.headers;

                            if (urlStr && urlStr.includes('fuelapi') && headers) {
                                let token = null;
                                if (typeof headers.get === 'function') {
                                    token = headers.get('x-csrf-token') || headers.get('X-CSRF-Token') || null;
                                } else if (typeof headers === 'object') {
                                    for (const k in headers) {
                                        if (String(k).toLowerCase() === 'x-csrf-token') {
                                            token = headers[k];
                                            break;
                                        }
                                    }
                                }

                                if (token && String(token).length > 50) {
                                    window.postMessage({
                                        __pageHookToken: true,
                                        token: String(token),
                                        url: urlStr
                                    }, '*');
                                }
                            }
                        } catch(e) {}
                        return origFetch.apply(this, arguments);
                    };

                    const origOpen = XMLHttpRequest.prototype.open;
                    const origSet = XMLHttpRequest.prototype.setRequestHeader;
                    XMLHttpRequest.prototype.open = function(method, url){
                        this.__sfmc_url = url;
                        return origOpen.apply(this, arguments);
                    };
                    XMLHttpRequest.prototype.setRequestHeader = function(header, value){
                        try {
                            const urlStr = this.__sfmc_url || '';
                            if (urlStr && urlStr.includes('fuelapi') &&
                                String(header).toLowerCase() === 'x-csrf-token' &&
                                value && String(value).length > 50) {
                                window.postMessage({
                                    __pageHookToken: true,
                                    token: String(value),
                                    url: urlStr
                                }, '*');
                            }
                        } catch(e) {}
                        return origSet.apply(this, arguments);
                    };
                } catch(e) {}
            })();
        `;

        const script = document.createElement('script');
        script.textContent = code;
        (document.documentElement || document.head || document.body).appendChild(script);
        script.remove();

        console.log('Page hook injected for search/query token capture');
    }

    // Listen for page hook tokens (for search/query operations)
    window.addEventListener('message', (event) => {
        const data = event?.data;
        if (!data || data.__pageHookToken !== true) return;

        const token = String(data.token || '');
        if (token.length > 50) {
            pageHookToken = token;
            pageHookSource = 'pageHook';

            GM_setValue(STORAGE_KEYS.pageHookToken, token);
            GM_setValue(STORAGE_KEYS.pageHookSource, 'pageHook');

            console.log('Page Hook token captured (for search/query operations)');
            updateTokenStatus();
        }
    });

    // Fetch Landing Pages (no auth required for GET)
    async function fetchLandingPages(page = 1, pageSize = 100) {
        const url = `${ENDPOINTS.landingPages}?$page=${page}&$pageSize=${pageSize}&$orderBy=createdDate%20DESC`;
        
        try {
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'Accept': 'application/json'
                    },
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const data = JSON.parse(response.responseText);
                                resolve({ status: response.status, data });
                            } catch (e) {
                                reject(new Error('Failed to parse JSON response'));
                            }
                        } else {
                            reject(new Error(`API request failed: ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });

            const entities = response.data.entities || [];
            const totalCount = Number(response.data.totalCount || response.data.count || response.data.total || 0);

            console.log(`Fetched landing pages page ${page}: ${entities.length} items (${totalCount} total)`);

            return {
                items: entities,
                totalCount: totalCount,
                hasMore: entities.length === pageSize
            };
        } catch (error) {
            console.error('Error fetching landing pages:', error);
            throw error;
        }
    }

    // Enhanced API Helper with separate token usage
    async function apiRequest(url, options = {}) {
        const isContentBuilder = url.includes('content-builder');
        const token = isContentBuilder ? pageHookToken : appcoreToken;

        if (!token) {
            throw new Error(`Missing ${isContentBuilder ? 'Page Hook' : 'APPCORE'} token`);
        }

        const defaultHeaders = {
            'Accept': 'application/json',
            'X-CSRF-Token': token
        };

        if (options.method === 'POST') {
            defaultHeaders['Content-Type'] = 'application/json;datekind=local';
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || 'GET',
                url: url,
                headers: { ...defaultHeaders, ...options.headers },
                data: options.data ? JSON.stringify(options.data) : undefined,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = response.responseText ? JSON.parse(response.responseText) : null;
                            resolve({ status: response.status, data });
                        } catch (e) {
                            reject(new Error('Failed to parse JSON response'));
                        }
                    } else {
                        reject(new Error(`API request failed: ${response.status}`));
                    }
                },
                onerror: function() {
                    reject(new Error('Network error'));
                }
            });
        });
    }

    // Enhanced Data Fetching using POST query API (unified for both landing pages and assets)
    async function fetchItemsWithQuery(page = 1, pageSize = 100, searchOptions = {}) {
        const { mode = 'initial', categoryId = null, keyword = null, assetTypeIds = [240,241,242,243,244,245,247,248,249] } = searchOptions;

        // Build query based on mode
        let query;
        if (mode === 'folder' && categoryId) {
            query = {
                leftOperand: { property: 'category.id', simpleOperator: 'equals', value: String(categoryId) },
                logicalOperator: 'AND',
                rightOperand: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds }
            };
        } else if (mode === 'search' && keyword) {
            const orTree = buildSearchOrTree(keyword);
            query = {
                leftOperand: orTree,
                logicalOperator: 'AND',
                rightOperand: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds }
            };
        } else {
            // Initial mode - just filter by asset types (includes both landing pages and code resources)
            query = { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds };
        }

        const payload = {
            page: { pageSize, page },
            sort: [{ direction: 'desc', property: 'modifiedDate' }],
            query,
            fields: ['assetType', 'category', 'createdDate', 'customerKey', 'id', 'modifiedDate', 'name', 'meta', 'status']
        };

        try {
            const response = await apiRequest(ENDPOINTS.assetsQuery, {
                method: 'POST',
                data: payload
            });

            const items = response.data?.items || [];
            const totalCount = Number(response.data?.count ?? response.data?.totalCount ?? 0);

            console.log(`Fetched items page ${page}: ${items.length} items (${totalCount} total)`);

            return {
                items: items,
                totalCount: totalCount,
                hasMore: items.length === pageSize
            };
        } catch (error) {
            console.error('Error fetching items with query:', error);
            throw error;
        }
    }

    // Enhanced Assets Fetching using POST query endpoint
    async function fetchAssetsWithQuery(page = 1, pageSize = 100, searchOptions = {}) {
        const { mode = 'initial', categoryId = null, keyword = null, assetTypeIds = [240,241,242,243,244,245,247,248,249] } = searchOptions;

        // Build query based on mode
        let query;
        if (mode === 'folder' && categoryId) {
            query = {
                leftOperand: { property: 'category.id', simpleOperator: 'equals', value: String(categoryId) },
                logicalOperator: 'AND',
                rightOperand: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds }
            };
        } else if (mode === 'search' && keyword) {
            const orTree = buildSearchOrTree(keyword);
            query = {
                leftOperand: orTree,
                logicalOperator: 'AND',
                rightOperand: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds }
            };
        } else {
            // Initial mode - just filter by asset types
            query = { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds };
        }

        const payload = {
            page: { pageSize, page },
            // IMPORTANT: Only add sort for non-search modes
            // In search mode, preserve the API's boost scoring order
            ...(mode !== 'search' && { sort: [{ direction: 'desc', property: 'modifiedDate' }] }),
            query,
            fields: ['assetType', 'category', 'createdDate', 'customerKey', 'id', 'modifiedDate', 'name', 'meta', 'status']
        };

        try {
            const response = await apiRequest(ENDPOINTS.assetsQuery, {
                method: 'POST',
                data: payload
            });

            const items = response.data?.items || [];
            const totalCount = Number(response.data?.count ?? response.data?.totalCount ?? 0);

            console.log(`Fetched assets page ${page}: ${items.length} items (${totalCount} total)`);

            return {
                items: items,
                totalCount: totalCount,
                hasMore: items.length === pageSize
            };
        } catch (error) {
            console.error('Error fetching assets with query:', error);
            throw error;
        }
    }

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

    // Enhanced Data Loading - Fetch landing pages separately for correct status/URL
    async function fetchData(page = 1) {
        showLoading(true);
        try {
            console.log(`Fetching data (page ${page}, filter: ${currentFilter})...`);

            // Fetch landing pages - single page
            const lpResult = await fetchLandingPages(page, itemsPerPage);
            landingPages = lpResult.items;
            lpTotalCount = lpResult.totalCount;
            
            // Build Map for instant lookup
            landingPages.forEach(lp => {
                if (lp.siteAssetId) {
                    landingPagesMap.set(lp.siteAssetId, lp);
                }
            });

            console.log(`✓ Loaded page ${page} of landing pages (${landingPages.length} items, ${lpTotalCount} total)`);

            // Fetch ALL assets via POST query endpoint (only if not already loaded)
            if (!allDataLoaded || page === 1) {
                allAssetsForCategories = [];
                let assetsPage = 1;
                let loadedCount = 0;
                const assetsPageSize = 100;

                do {
                    const payload = {
                        page: { pageSize: assetsPageSize, page: assetsPage },
                        sort: [{ direction: 'desc', property: 'modifiedDate' }],
                        query: { property: 'assetType.id', simpleOperator: 'in', values: [240,241,242,243,244,245,247,248,249] },
                        fields: ['assetType','category','createdDate','customerKey','id','modifiedDate','name','meta','status']
                    };

                    const response = await apiRequest(ENDPOINTS.assetsQuery, {
                        method: 'POST',
                        data: payload
                    });

                    const items = response.data?.items || [];
                    allAssetsForCategories = allAssetsForCategories.concat(items);
                    loadedCount += items.length;
                    const nextAssetsTotalCount = Number(response.data?.count || 0);
                    if (Number.isFinite(nextAssetsTotalCount) && nextAssetsTotalCount > 0) {
                        assetsTotalCount = nextAssetsTotalCount;
                    }
                    assetsTotalCount = Math.max(assetsTotalCount, loadedCount);
                    if (items.length === assetsPageSize && assetsTotalCount <= loadedCount) {
                        assetsTotalCount = loadedCount + 1;
                    }
                    assetsPage++;
                } while (loadedCount < assetsTotalCount && assetsPage < 100);

                // Filter to code resources + landing pages (for categories)
                allAssets = allAssetsForCategories.filter(asset => {
                    const assetTypeName = asset.assetType?.name?.toLowerCase() || '';
                    return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource', 'landingpage'].includes(assetTypeName);
                });

                console.log(`✓ Loaded all assets: ${allAssetsForCategories.length} total, ${allAssets.length} code resources`);
                allDataLoaded = true;
            }

            // Build category tree
            buildCategoryTree();

            // Update UI
            renderTable();
            updateStats();
            showLoading(false);
            showToast(`✓ Page ${page} loaded (${landingPages.length} LP + ${allAssets.length} code resources)`);
            
            // Enrich ALL code resources with status/URL from sites endpoint
            // (Uses request queue + caching for optimization)
            const codeResourcesToEnrich = allAssets.filter(asset => {
                const assetTypeName = asset.assetType?.name?.toLowerCase() || '';
                return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource'].includes(assetTypeName);
            });
            
            if (codeResourcesToEnrich.length > 0) {
                console.log(`Fetching status/URL for ${codeResourcesToEnrich.length} code resources from sites endpoint...`);
                fetchAssetSiteDetails(codeResourcesToEnrich);
            }

        } catch (error) {
            console.error('Fetch error:', error);
            showToast('Error loading data: ' + error.message);
            showLoading(false);
        }
    }

    // Load all data for client-side filtering (when not using "all" filter)
    async function loadAllDataForFiltering() {
        if (allDataLoaded) {
            console.log('All data already loaded for filtering');
            return;
        }

        console.log('Loading ALL data for client-side filtering...');

        // Load ALL landing pages
        landingPages = [];
        let lpPage = 1;
        let hasMoreLP = true;

        while (hasMoreLP) {
            const lpResult = await fetchLandingPages(lpPage, 100);
            landingPages = landingPages.concat(lpResult.items);
            lpTotalCount = lpResult.totalCount;
            hasMoreLP = lpResult.hasMore && lpPage < 50; // Safety limit
            lpPage++;
        }

        // Load ALL assets
        allAssets = [];
        let assetsPage = 1;
        let hasMoreAssets = true;

        while (hasMoreAssets) {
            const assetsResult = await fetchAssetsWithQuery(assetsPage, 100);
            allAssets = allAssets.concat(assetsResult.items);
            assetsTotalCount = assetsResult.totalCount;
            hasMoreAssets = assetsResult.hasMore && assetsPage < 50; // Safety limit
            assetsPage++;
        }

        // Filter assets to include only code resources and landing pages
        allAssets = allAssets.filter(asset => {
            const typeName = asset.assetType?.name?.toLowerCase() || '';
            return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource', 'landingpage'].includes(typeName);
        });

        // Store category data
        allAssetsForCategories = allAssets;
        buildCategoryTree();
        allDataLoaded = true;

        // Calculate total items
        totalFilteredItems = landingPages.length + allAssets.length;
    }

    // Enhanced Search Mode with proper query building
    async function loadAllDataForSearch() {
        if (allDataLoaded && isSearchMode) {
            console.log('All data already loaded for search');
            return;
        }

        showLoading(true);
        showToast('Loading all items for search...');

        try {
            console.log('Loading ALL data for enhanced search...');

            // Load ALL landing pages
            landingPages = [];
            let lpPage = 1;
            let hasMoreLP = true;

            while (hasMoreLP) {
                const lpResult = await fetchLandingPages(lpPage, 100);
                landingPages = landingPages.concat(lpResult.items);
                lpTotalCount = lpResult.totalCount;
                hasMoreLP = lpResult.hasMore;
                lpPage++;

                console.log(`Loaded LP page ${lpPage - 1}: ${landingPages.length}/${lpTotalCount}`);
            }
            
            // Build Map for instant lookup by siteAssetId
            landingPagesMap.clear();
            landingPages.forEach(lp => {
                if (lp.siteAssetId) {
                    landingPagesMap.set(lp.siteAssetId, lp);
                }
            });
            console.log(`✓ Built landing pages Map with ${landingPagesMap.size} entries`);

            // Load ALL assets using enhanced query
            allAssets = [];
            let assetsPage = 1;
            let hasMoreAssets = true;

            while (hasMoreAssets) {
                const assetsResult = await fetchAssetsWithQuery(assetsPage, 100);
                allAssets = allAssets.concat(assetsResult.items);
                assetsTotalCount = assetsResult.totalCount;
                hasMoreAssets = assetsResult.hasMore;
                assetsPage++;

                console.log(`Loaded assets page ${assetsPage - 1}: ${allAssets.length}/${assetsTotalCount}`);
            }

            // Filter to include code resources and landing pages (needed for category lookup)
            allAssets = allAssets.filter(asset => {
                const typeName = asset.assetType?.name?.toLowerCase() || '';
                return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource', 'landingpage'].includes(typeName);
            });

            // Store for category building
            allAssetsForCategories = allAssets;

            // Build category tree
            buildCategoryTree();

            allDataLoaded = true;
            isSearchMode = true;

            showLoading(false);
            showToast(`All ${landingPages.length + allAssets.length} items loaded for search`);

        } catch (error) {
            console.error('Error loading all data for search:', error);
            showToast('Error loading search data: ' + error.message);
            showLoading(false);
            allDataLoaded = false;
            isSearchMode = false;
        }
    }

    // Enhanced search with proper query endpoint - LOAD ONE PAGE AT A TIME
    async function performEnhancedSearch(searchTerm) {
        if (!searchTerm.trim()) {
            // Return to normal mode
            isSearchMode = false;
            currentSearchTerm = '';
            itemsPerPage = 100;  // Reset to 100 for normal mode
            currentPage = 1;
            await fetchData(1);
            return;
        }

        // Store search term for pagination
        currentSearchTerm = searchTerm;
        
        // Use 20 items per page in search mode (like platform)
        itemsPerPage = 20;

        showLoading(true);
        try {
            console.log(`Enhanced search: "${searchTerm}"`);

            // Use the boost query API with pagination - it returns BOTH landing pages and code resources
            const searchOptions = {
                mode: 'search',
                keyword: searchTerm,
                assetTypeIds: [240,241,242,243,244,245,247,248,249]  // Includes landing pages (247)
            };

            // Fetch ONLY the current page of results (preserve API relevance order)
            const assetsResult = await fetchAssetsWithQuery(currentPage, itemsPerPage, searchOptions);
            const allSearchResults = assetsResult.items;
            assetsTotalCount = assetsResult.totalCount;

            console.log(`✓ Loaded search page ${currentPage}: ${allSearchResults.length} items of ${assetsTotalCount} total`);

            // Build category tree for folder path resolution
            allAssetsForCategories = allSearchResults;
            buildCategoryTree();

            // Convert search results to proper format - SHOW IMMEDIATELY
            landingPages = [];
            allAssets = [];
            
            const landingPageAssets = [];
            const allAssetsToEnrich = []; // All assets that might have site info
            
            allSearchResults.forEach(asset => {
                const isLandingPage = asset.assetType?.id === 247 || asset.assetType?.name?.toLowerCase() === 'landingpage';
                
                if (isLandingPage) {
                    landingPageAssets.push(asset);
                    allAssetsToEnrich.push(asset); // Add to enrichment list
                    
                    landingPages.push({
                        landingPageId: asset.id,
                        name: asset.name,
                        status: 'Loading...', // Will be updated by enrichment
                        siteAssetId: asset.id,
                        url: null, // Will be updated by enrichment
                        pageId: null,  // Will be populated by fetchAssetSiteDetails
                        modifiedDate: asset.modifiedDate,
                        createdDate: asset.createdDate,
                        categoryId: asset.category?.id
                    });
                } else {
                    // Code resources might also have site info
                    allAssetsToEnrich.push(asset);
                }
                
                // Add all assets for category lookup
                allAssets.push(asset);
            });

            isSearchMode = true;
            totalFilteredItems = assetsTotalCount;

            console.log(`Search results: ${landingPageAssets.length} landing pages + ${allSearchResults.length - landingPageAssets.length} code resources`);

            // SHOW RESULTS IMMEDIATELY with temporary data
            renderTable();
            updateStats();
            showLoading(false);
            showToast(`Search completed: ${allSearchResults.length} results`);

            // THEN fetch site details for all assets (landing pages and code resources)
            // Use progressive rendering for search results (updates in batches of 5)
            if (allAssetsToEnrich.length > 0) {
                console.log(`Fetching status/URL for ${allAssetsToEnrich.length} assets from sites endpoint (progressive)...`);
                fetchAssetSiteDetails(allAssetsToEnrich, true); // true = progressive render
            }

        } catch (error) {
            console.error('Enhanced search error:', error);
            showToast('Search failed: ' + error.message);
            showLoading(false);
        }
    }

    // ============================================
    // LAZY ENRICHMENT: Only enrich visible items
    // Called when page changes or filter changes
    // ============================================
    function getVisibleAssetsToEnrich() {
        // Build the same list of items as renderTable() would - MUST MATCH EXACTLY
        let allItems = [];
        let lpCount = 0;
        let codeResourceCount = 0;
        
        // Add landing pages
        landingPages.forEach(lp => {
            allItems.push({
                id: lp.siteAssetId,
                assetType: { id: 247, name: 'landingpage' },
                type: 'landing',
                status: lp.status,
                modifiedDate: lp.modifiedDate
            });
            lpCount++;
        });
        
        // Add code resources from allAssets
        allAssets.forEach(asset => {
            const assetTypeName = asset.assetType?.name?.toLowerCase() || '';
            if (['jsoncoderesource', 'codesnippetblock', 'jscoderesource', 'csscoderesource'].includes(assetTypeName)) {
                allItems.push({
                    id: asset.id,
                    assetType: asset.assetType,
                    type: 'asset',
                    status: asset.siteStatus || 'Loading...',
                    modifiedDate: asset.modifiedDate
                });
                codeResourceCount++;
            }
        });
        
        console.log(`getVisibleAssetsToEnrich: Built ${allItems.length} items (${lpCount} LPs + ${codeResourceCount} code resources)`);
        
        // CRITICAL: Sort by modified date in normal mode (same as renderTable)
        if (!isSearchMode) {
            allItems.sort((a, b) => new Date(b.modifiedDate) - new Date(a.modifiedDate));
        }
        
        // Apply filter (same as renderTable)
        if (currentFilter !== 'all') {
            if (currentFilter === 'landing') {
                allItems = allItems.filter(item => item.type === 'landing');
            } else if (currentFilter === 'json') {
                allItems = allItems.filter(item => item.assetType?.name?.toLowerCase() === 'jsoncoderesource');
            } else if (currentFilter === 'javascript') {
                allItems = allItems.filter(item => ['jscoderesource', 'codesnippetblock'].includes(item.assetType?.name?.toLowerCase()));
            } else if (currentFilter === 'css') {
                allItems = allItems.filter(item => item.assetType?.name?.toLowerCase() === 'csscoderesource');
            }
        }
        
        // Get visible items for current page
        const startIndex = (currentPage - 1) * itemsPerPage;
        const visibleItems = allItems.slice(startIndex, startIndex + itemsPerPage);
        
        // Count types in visible items
        const visibleLPs = visibleItems.filter(i => i.type === 'landing').length;
        const visibleAssets = visibleItems.filter(i => i.type === 'asset').length;
        console.log(`Visible items on page ${currentPage}: ${visibleLPs} LPs + ${visibleAssets} code resources = ${visibleItems.length} total`);
        
        // Filter to only items that need enrichment (not cached)
        const itemsToEnrich = visibleItems.filter(item => {
            const cached = getCachedEnrichment(item.id);
            return !cached;
        });
        
        // Log breakdown of items to enrich
        const enrichLPs = itemsToEnrich.filter(i => i.type === 'landing').length;
        const enrichAssets = itemsToEnrich.filter(i => i.type === 'asset').length;
        console.log(`Items needing enrichment: ${enrichLPs} LPs + ${enrichAssets} code resources = ${itemsToEnrich.length} total`);
        
        return itemsToEnrich;
    }
    
    // Trigger lazy enrichment for only visible items
    async function enrichVisibleItems() {
        const visibleToEnrich = getVisibleAssetsToEnrich();
        if (visibleToEnrich.length > 0) {
            console.log(`Lazy enriching ${visibleToEnrich.length} visible items...`);
            await fetchAssetSiteDetails(visibleToEnrich);
        }
    }

    // Fetch site details for all assets (landing pages and code resources)
    // OPTIMIZED: Uses request queue (max 10 concurrent) + caching + session tracking
    // Progressive rendering: Updates DOM in batches of 5 for faster visual feedback
    async function fetchAssetSiteDetails(assetsToEnrich, progressiveRender = false) {
        // Start new enrichment session - this invalidates any in-progress sessions
        currentEnrichmentSession++;
        const thisSession = currentEnrichmentSession;
        
        console.log(`Starting enrichment session ${thisSession} for ${assetsToEnrich.length} assets (progressive: ${progressiveRender})`);
        
        try {
            // Filter out already-cached assets and apply cached data
            const uncachedAssets = assetsToEnrich.filter(asset => {
                const cached = getCachedEnrichment(asset.id);
                if (cached) {
                    // Apply cached data immediately
                    applyCachedEnrichment(asset, cached);
                    return false; // Skip this asset
                }
                return true; // Needs fetching
            });
            
            console.log(`Session ${thisSession}: ${uncachedAssets.length} uncached, ${assetsToEnrich.length - uncachedAssets.length} from cache`);
            
            if (uncachedAssets.length === 0) {
                console.log(`Session ${thisSession}: All assets served from cache`);
                renderTable();
                return;
            }
            
            if (progressiveRender) {
                // Progressive rendering: Process one by one, render after each item
                const BATCH_SIZE = 1;
                let completedCount = 0;
                
                for (let i = 0; i < uncachedAssets.length; i += BATCH_SIZE) {
                    // Check if session is still current
                    if (thisSession !== currentEnrichmentSession) {
                        console.log(`Session ${thisSession} superseded, stopping progressive render`);
                        return;
                    }
                    
                    const batch = uncachedAssets.slice(i, i + BATCH_SIZE);
                    const batchPromises = batch.map(asset => 
                        requestQueue(() => fetchSingleAssetSiteDetails(asset, thisSession))
                    );
                    
                    const results = await Promise.all(batchPromises);
                    completedCount += results.filter(r => r && r.success).length;
                    
                    // Check again before rendering
                    if (thisSession !== currentEnrichmentSession) {
                        console.log(`Session ${thisSession} superseded after batch, stopping`);
                        return;
                    }
                    
                    // Render after each batch for progressive updates
                    console.log(`Session ${thisSession}: Batch complete (${completedCount}/${uncachedAssets.length}), updating DOM...`);
                    renderTable();
                }
                
                console.log(`✓ Session ${thisSession}: Progressive render complete (${completedCount}/${uncachedAssets.length})`);
                
            } else {
                // Standard mode: Process all, render once at end
                const promises = uncachedAssets.map(asset => 
                    requestQueue(() => fetchSingleAssetSiteDetails(asset, thisSession))
                );
                
                const results = await Promise.all(promises);
                
                if (thisSession !== currentEnrichmentSession) {
                    console.log(`Session ${thisSession} superseded by session ${currentEnrichmentSession}, skipping render`);
                    return;
                }
                
                const successCount = results.filter(r => r && r.success).length;
                console.log(`✓ Session ${thisSession}: Updated ${successCount}/${uncachedAssets.length} assets with status/URL`);
                
                renderTable();
            }
            
        } catch (error) {
            console.error(`Session ${thisSession} error:`, error);
        }
    }
    
    // Helper: Apply cached enrichment data to an asset
    function applyCachedEnrichment(asset, cached) {
        const isLandingPage = asset.assetType?.id === 247 || asset.assetType?.name?.toLowerCase() === 'landingpage';
        
        if (isLandingPage) {
            const lpIndex = landingPages.findIndex(p => p.siteAssetId === asset.id);
            if (lpIndex !== -1) {
                landingPages[lpIndex].status = cached.status;
                landingPages[lpIndex].url = cached.url;
                landingPages[lpIndex].pageId = cached.pageId;
                landingPages[lpIndex].siteId = cached.siteId;
                landingPages[lpIndex].defaultPageId = cached.defaultPageId;
            }
        } else {
            // Code resources also get defaultPageId and siteId from cache
            const assetIndex = allAssets.findIndex(a => a.id === asset.id);
            if (assetIndex !== -1) {
                allAssets[assetIndex].siteStatus = cached.status;
                allAssets[assetIndex].siteUrl = cached.url;
                allAssets[assetIndex].siteId = cached.siteId;
                allAssets[assetIndex].defaultPageId = cached.defaultPageId;
            }
        }
    }
    
    // Fetch site details for a single asset (called via request queue)
    async function fetchSingleAssetSiteDetails(asset, session) {
        // Early exit if session is stale
        if (session && session !== currentEnrichmentSession) {
            return { success: false, id: asset.id, reason: 'stale session' };
        }
        
        try {
            // Step 1: Get status and URL from sites endpoint (works for ALL asset types)
            const sitesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${asset.id}`;
            
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: sitesUrl,
                    anonymous: false,
                    headers: { 'Accept': 'application/json' },
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                resolve(JSON.parse(response.responseText));
                            } catch (e) {
                                reject(new Error('Failed to parse JSON'));
                            }
                        } else {
                            reject(new Error(`API returned ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });
            
            if (response.entities && response.entities.length > 0) {
                const site = response.entities[0];
                const status = site.status || 'Draft';
                const url = site.url || null;
                const siteId = site.siteId || null;
                const defaultPageId = site.defaultPageId || null; // The actual page ID to display
                const isLandingPage = asset.assetType?.id === 247 || asset.assetType?.name?.toLowerCase() === 'landingpage';
                let pageId = null;
                
                // For landing pages, use defaultPageId from sites endpoint (this is the real CloudPages ID)
                if (isLandingPage) {
                    if (defaultPageId) {
                        pageId = defaultPageId;
                        console.log(`✓ Using defaultPageId ${pageId} for siteAssetId ${asset.id}`);
                    } else if (siteId) {
                        // Fallback to siteId if defaultPageId not available
                        pageId = siteId;
                        console.warn(`⚠ No defaultPageId, using siteId ${siteId} as fallback for siteAssetId ${asset.id}`);
                    } else {
                        pageId = null;
                    }
                }
                
                // Cache the result for future use
                setCachedEnrichment(asset.id, { status, url, pageId, siteId, defaultPageId });
                
                // Update data arrays (same status/url for all types)
                if (isLandingPage) {
                    const lpIndex = landingPages.findIndex(p => p.siteAssetId === asset.id);
                    if (lpIndex !== -1) {
                        landingPages[lpIndex].status = status;
                        landingPages[lpIndex].url = url;
                        landingPages[lpIndex].pageId = pageId;
                        landingPages[lpIndex].siteId = siteId;
                        landingPages[lpIndex].defaultPageId = defaultPageId;
                        console.log(`Updated LP ${asset.id}: status=${status}, url=${url ? url.substring(0, 30) + '...' : 'null'}, pageId=${pageId} (defaultPageId=${defaultPageId}), siteId=${siteId}`);
                    } else {
                        console.warn(`LP ${asset.id} not found in landingPages array (length: ${landingPages.length})`);
                    }
                } else {
                    // Code resources also get defaultPageId
                    const assetIndex = allAssets.findIndex(a => a.id === asset.id);
                    if (assetIndex !== -1) {
                        allAssets[assetIndex].siteStatus = status;
                        allAssets[assetIndex].siteUrl = url;
                        allAssets[assetIndex].siteId = siteId;
                        allAssets[assetIndex].defaultPageId = defaultPageId;
                        console.log(`Updated Asset ${asset.id}: status=${status}, url=${url ? url.substring(0, 30) + '...' : 'null'}, defaultPageId=${defaultPageId}, siteId=${siteId}`);
                    } else {
                        console.warn(`Asset ${asset.id} not found in allAssets array (length: ${allAssets.length})`);
                    }
                }
                
                return { success: true, id: asset.id };
            }
            
            return { success: false, id: asset.id };
        } catch (error) {
            console.warn(`Failed to fetch site for ${asset.id}:`, error.message);
            return { success: false, id: asset.id };
        }
    }

    // Enrich landing pages via individual API calls for the current page only
    async function enrichLandingPagesAsync(landingPageAssets) {
        try {
            console.log(`Enriching ${landingPageAssets.length} landing pages via API calls...`);
            let enrichedCount = 0;
            
            for (const asset of landingPageAssets) {
                try {
                    // Use Asset Builder API to get full asset details (includes landing page metadata)
                    const assetUrl = `https://cloud-pages.s51.marketingcloudapps.com/fuelapi/asset/v1/content/assets/${asset.id}`;
                    
                    console.log(`Fetching asset details: ${assetUrl}`);
                    
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: assetUrl,
                            headers: {
                                'Authorization': `Bearer ${pageHookToken}`,
                                'Accept': 'application/json'
                            },
                            onload: function(response) {
                                if (response.status >= 200 && response.status < 300) {
                                    try {
                                        resolve(JSON.parse(response.responseText));
                                    } catch (e) {
                                        reject(new Error('Failed to parse JSON'));
                                    }
                                } else {
                                    reject(new Error(`API returned ${response.status}`));
                                }
                            },
                            onerror: function() {
                                reject(new Error('Network error'));
                            }
                        });
                    });
                    
                    console.log(`✓ Got asset details, meta.cloudPages:`, response.meta?.cloudPages);
                    
                    // Extract status and URL from meta.cloudPages
                    const status = response.meta?.cloudPages?.status || 'Draft';
                    const url = response.meta?.cloudPages?.url || null;
                    
                    console.log(`Extracted: status=${status}, url=${url}`);
                    
                    // Update DOM directly
                    const row = document.querySelector(`tr[data-lp-id="${asset.id}"]`);
                    if (row) {
                        // Update status cell
                        const statusCell = row.querySelector('.cpm-status');
                        if (statusCell && status) {
                            const isPublished = status.toLowerCase() === 'published';
                            statusCell.className = `cpm-status ${isPublished ? 'published' : 'unpublished'}`;
                            statusCell.innerHTML = `<span class="cpm-status-dot"></span>${status}`;
                        }
                        
                        // Update URL cell
                        const urlCell = row.cells[6];
                        if (urlCell && url) {
                            urlCell.innerHTML = `<a href="${url}" target="_blank" class="cpm-url">${url.substring(0, 40)}...</a>`;
                        }
                        
                        enrichedCount++;
                    }
                    
                } catch (error) {
                    console.warn(`Failed to enrich landing page ${asset.id}:`, error.message);
                }
            }
            
            console.log(`✓ Successfully enriched ${enrichedCount}/${landingPageAssets.length} landing pages`);
            
        } catch (error) {
            console.error('Error enriching landing pages:', error);
        }
    }

    // Category Tree Building (same as original)
    function buildCategoryTree() {
        const assetsToScan = allAssetsForCategories.length > 0 ? allAssetsForCategories : allAssets;
        assetsToScan.forEach(asset => {
            if (asset.category) {
                const {id, name, parentId} = asset.category;
                if (!categories.has(id)) {
                    categories.set(id, {name, parentId, fullPath: null});
                }
            }
        });

        categories.forEach((cat, id) => {
            if (!cat.fullPath) {
                cat.fullPath = buildFullPath(id);
            }
        });
    }

    function buildFullPath(categoryId) {
        const parts = [];
        let currentId = categoryId;
        let depth = 0;

        while (currentId && depth < 10) {
            const cat = categories.get(currentId);
            if (!cat) break;
            parts.unshift(cat.name);
            currentId = cat.parentId;
            depth++;
        }

        return parts.length > 0 ? parts.join(' / ') : 'Cloud Pages';
    }

    function getFolderPath(categoryId) {
        if (!categoryId) return 'Cloud Pages';
        const cat = categories.get(categoryId);
        if (!cat) return 'Cloud Pages';  // Default to Cloud Pages instead of Unknown
        return cat.fullPath || 'Cloud Pages';
    }

    // Get relative time string (e.g., "2 hours ago", "3 days ago")
    function getRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
            }
        }
        
        return 'just now';
    }

    // Enhanced enrichment for items - fetches additional metadata
    async function enrichItemDetails(itemId, itemType) {
        try {
            // Fetch detailed asset info from Asset Builder API
            const assetUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/${itemId}`;
            
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: assetUrl,
                    headers: {
                        'Authorization': `Bearer ${pageHookToken}`,
                        'Accept': 'application/json'
                    },
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                resolve(JSON.parse(response.responseText));
                            } catch (e) {
                                reject(new Error('Failed to parse JSON'));
                            }
                        } else {
                            reject(new Error(`API returned ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });
            
            // Extract useful metadata - handle various data types
            const metadata = {
                createdBy: typeof response.createdBy === 'string' ? response.createdBy : 
                          (response.createdBy?.name || response.createdBy?.id || 'Unknown'),
                createdDate: response.createdDate,
                modifiedBy: typeof response.modifiedBy === 'string' ? response.modifiedBy : 
                           (response.modifiedBy?.name || response.modifiedBy?.id || 'Unknown'),
                modifiedDate: response.modifiedDate,
                views: response.views || 0,
                status: response.status?.name || 'Unknown',
                description: response.description || '',
                customerKey: response.customerKey || '',
                cloudPagesStatus: response.meta?.cloudPages?.status || null,
                cloudPagesUrl: response.meta?.cloudPages?.url || null,
                cloudPagesModifiedDate: response.meta?.cloudPages?.modifiedDate || null
            };
            
            return metadata;
            
        } catch (error) {
            console.warn(`Failed to enrich item ${itemId}:`, error.message);
            return null;
        }
    }

    // Update item row with enhanced details
    function updateItemWithDetails(metadata, itemId) {
        if (!metadata) return;
        
        const row = document.querySelector(`tr[data-item-id="${itemId}"]`);
        if (!row) return;
        
        // Extract usernames - handle if it's an email or just a name
        const modifiedByName = typeof metadata.modifiedBy === 'string' && metadata.modifiedBy.includes('@') 
            ? metadata.modifiedBy.split('@')[0] 
            : metadata.modifiedBy;
        
        const createdByName = typeof metadata.createdBy === 'string' && metadata.createdBy.includes('@')
            ? metadata.createdBy.split('@')[0]
            : metadata.createdBy;
        
        // Calculate times
        const relativeTime = getRelativeTime(metadata.modifiedDate);
        const fullModifiedDate = new Date(metadata.modifiedDate).toLocaleString();
        const fullCreatedDate = new Date(metadata.createdDate).toLocaleString();
        
        // Check if asset has unpublished changes (dirty state)
        const isDirty = metadata.cloudPagesStatus === 'Published' && 
                       metadata.cloudPagesModifiedDate &&
                       new Date(metadata.modifiedDate) > new Date(metadata.cloudPagesModifiedDate);
        
        // Find the modified date cell
        const modifiedCell = row.cells[7];
        if (!modifiedCell) return;
        
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
                    <div class="cpm-tooltip-value">${new Date(metadata.createdDate).toLocaleDateString()}</div>
                    <div class="cpm-tooltip-subvalue">${fullCreatedDate}</div>
                    <div class="cpm-tooltip-subvalue">by ${createdByName}</div>
                </div>
            </div>
            
            ${metadata.cloudPagesStatus ? `
                <div class="cpm-tooltip-section">
                    <div class="cpm-tooltip-icon">${ICONS.cloudUpload}</div>
                    <div class="cpm-tooltip-content">
                        <div class="cpm-tooltip-label">CloudPages Status</div>
                        <div class="cpm-tooltip-value">${metadata.cloudPagesStatus}</div>
                        ${metadata.cloudPagesModifiedDate ? `<div class="cpm-tooltip-subvalue">Last published: ${new Date(metadata.cloudPagesModifiedDate).toLocaleString()}</div>` : ''}
                    </div>
                </div>
            ` : ''}
            
            <div class="cpm-tooltip-arrow"></div>
        `;
        
        document.body.appendChild(tooltip);
        
        // Position and show tooltip on hover
        modifiedCell.style.cursor = 'help';
        modifiedCell.style.position = 'relative';
        
        modifiedCell.addEventListener('mouseenter', () => {
            const cellRect = modifiedCell.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            
            // Position above the cell, centered
            tooltip.style.left = `${cellRect.left + (cellRect.width / 2) - (tooltipRect.width / 2)}px`;
            tooltip.style.top = `${cellRect.top - tooltipRect.height - 10}px`;
            
            // Show tooltip with animation
            requestAnimationFrame(() => {
                tooltip.classList.add('show');
            });
        });
        
        modifiedCell.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
        
        // Add visual indicator to status cell if there are unpublished changes
        const statusCell = row.cells[5];
        if (statusCell && isDirty) {
            const statusSpan = statusCell.querySelector('.cpm-status');
            if (statusSpan) {
                // Add "modified" badge
                const badge = document.createElement('span');
                badge.style.cssText = 'margin-left: 6px; font-size: 10px; background: #ff9800; color: white; padding: 2px 6px; border-radius: 3px; font-weight: 600;';
                badge.textContent = 'MODIFIED';
                badge.title = `Asset modified ${relativeTime}\nLast published: ${new Date(metadata.cloudPagesModifiedDate).toLocaleString()}\n\nClick Publish to update the live version`;
                statusSpan.appendChild(badge);
            }
        }
    }

    // Publish Landing Page (using APPCORE token directly)
    async function publishPage(landingPageId, siteAssetId) {
        console.log(`Publish FLOW STARTED`);
        console.log(`   landingPageId: ${landingPageId}`);
        console.log(`   siteAssetId: ${siteAssetId}`);

        if (!appcoreToken) {
            showToast('APPCORE Token not available. Please refresh the page.');
            console.error('APPCORE Token missing');
            return;
        }

        if (!confirm(`Publish Landing Page ${landingPageId}?`)) return;

        showLoading(true);

        try {
            const endpoint = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${landingPageId}/publish`;

            console.log(`Attempting to publish page ${landingPageId}...`);
            console.log(`   Endpoint: ${endpoint}`);
            console.log(`   Using APPCORE token: ${appcoreToken.substring(0, 50)}...`);
            console.log(`   Token source: ${appcoreSource}`);
            console.log(`   Payload:`, JSON.stringify({ landingPageId: parseInt(landingPageId) }));

            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: {
                    'Accept': 'text/html',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': appcoreToken,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                data: JSON.stringify({ landingPageId: parseInt(landingPageId) }),
                onload: function(response) {
                    showLoading(false);
                    console.log(`Publish response status: ${response.status}`);

                    try {
                        const data = JSON.parse(response.responseText);
                        console.log(`Response status field: ${data.status}`);
                        console.log(`Full response:`, data);

                        if (data.status === 'Published') {
                            showToast('Page published successfully!');
                            console.log('Publish successful - Page is now Published');
                            renderTable(); // Refresh the table to show updated status
                        } else if (data.status === 'Unpublished') {
                            showToast('Publish failed - Page still Unpublished');
                            console.error('Publish failed: Page status is still Unpublished');
                        } else {
                            showToast(`Unexpected status: ${data.status}`);
                            console.log('Unexpected response status:', data.status);
                        }
                    } catch (e) {
                        console.log('Raw response:', response.responseText.substring(0, 200));
                        if (response.status === 200 || response.status === 204) {
                            showToast('Request successful. Check the page status.');
                            console.log('Publish request completed');
                        } else {
                            showToast(`Failed: ${response.status}`);
                            console.error(`Publish failed: ${response.status}`);
                        }
                    }
                },
                onerror: function() {
                    showLoading(false);
                    showToast('Network error');
                    console.error('Publish network error');
                }
            });
        } catch (error) {
            showLoading(false);
            showToast(`Error: ${error.message}`);
            console.error('Error in publish process:', error);
            console.error('Stack:', error.stack);
        }
    }

    // Enhanced Token Status Updates
    function updateTokenStatus() {
        const pageHookEl = document.getElementById('pagehook-token-status');
        const appcoreEl = document.getElementById('appcore-token-status');

        if (pageHookEl) {
            if (pageHookToken) {
                pageHookEl.className = 'cpm-token-badge';
                pageHookEl.innerHTML = '<span class="cpm-token-dot"></span><span>Search Ready</span>';
            } else {
                pageHookEl.className = 'cpm-token-badge error';
                pageHookEl.innerHTML = '<span class="cpm-token-dot"></span><span>Search Missing</span>';
            }
        }

        if (appcoreEl) {
            if (appcoreToken) {
                appcoreEl.className = 'cpm-token-badge';
                appcoreEl.innerHTML = '<span class="cpm-token-dot"></span><span>Publish Ready</span>';
            } else {
                appcoreEl.className = 'cpm-token-badge error';
                appcoreEl.innerHTML = '<span class="cpm-token-dot"></span><span>Publish Missing</span>';
            }
        }
    }

    function getStatusInfo(status) {
        const map = {
            'Published': { color: '#04844b', icon: ICONS.checkCircle },
            'Unpublished': { color: '#c23934', icon: ICONS.warningCircle },
            'Draft': { color: '#ffb75d', icon: ICONS.clock },
            'Loading...': { color: '#9ca3af', icon: ICONS.clock }
        };
        return map[status] || map['Draft'];
    }

    function getSymbol(name, size = 14, inline = false) {
        const m = (name || '').toString().toLowerCase();
        const map = {
            'check': '✓',
            'x': '✖',
            'zap': '⚡',
            'file': '📄',
            'code': '⌘',
            'json': '🧩',
            'css': '🧷',
            'landing': '📄'
        };
        const ch = map[m] || '•';
        const fontSize = Math.max(10, Math.round(size * 0.9));
        const style = `display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;font-size:${fontSize}px;margin-right:${inline?6:8}px;vertical-align:middle;`;
        return `<span class="cpm-symbol" aria-hidden="true" style="${style}">${ch}</span>`;
    }

    function renderTable() {
        const tbody = document.getElementById('cpm-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        // Get ALL items first (landing pages + assets)
        let allItems = [];

        // In search mode, we need to preserve the exact order from the API
        // The search results are already in the correct order (boost scoring)
        // DO NOT re-sort or re-organize them!
        
        // Add landing pages
        landingPages.forEach(lp => {
            const asset = allAssets.find(a => a.id === lp.siteAssetId);
            allItems.push({
                type: 'landing',
                id: lp.pageId || lp.landingPageId,  // Use pageId (from enrichment) if available, otherwise landingPageId
                pageId: lp.pageId,  // Keep pageId for display in ID column
                assetId: lp.siteAssetId,
                siteAssetId: lp.siteAssetId,
                name: lp.name,
                status: lp.status,
                url: lp.url,
                modifiedDate: lp.modifiedDate,
                categoryId: asset?.category?.id || lp.categoryId,
                typeInfo: getAssetTypeInfo({ name: 'landingpage', displayName: 'Landing Page' })
            });
        });

        // Add assets
        allAssets.forEach(asset => {
            const assetTypeName = asset.assetType?.name?.toLowerCase() || '';
            if (['jsoncoderesource', 'codesnippetblock', 'jscoderesource', 'csscoderesource'].includes(assetTypeName)) {
                allItems.push({
                    type: 'asset',
                    id: asset.id,
                    pageId: asset.defaultPageId || asset.id,  // Use defaultPageId for display in ID column, fallback to asset.id
                    assetId: asset.id,
                    name: asset.name,
                    status: asset.siteStatus || (isSearchMode ? 'Loading...' : asset.status?.name || 'Draft'),
                    url: asset.siteUrl || null,
                    modifiedDate: asset.modifiedDate,
                    categoryId: asset.category?.id,
                    typeInfo: getAssetTypeInfo(asset.assetType)
                });
            }
        });

        // Sort by modified date ONLY if NOT in search mode
        // In search mode, preserve the API's relevance order (boost scoring)
        if (!isSearchMode) {
            allItems.sort((a, b) => new Date(b.modifiedDate) - new Date(a.modifiedDate));
        }

        // NOW apply filter (client-side filtering on displayed items)
        let items = allItems;
        if (currentFilter !== 'all') {
            if (currentFilter === 'landing') {
                items = allItems.filter(item => item.type === 'landing');
            } else if (currentFilter === 'json') {
                items = allItems.filter(item => item.typeInfo.name === 'JSON');
            } else if (currentFilter === 'javascript') {
                items = allItems.filter(item => item.typeInfo.name === 'JavaScript');
            } else if (currentFilter === 'css') {
                items = allItems.filter(item => item.typeInfo.name === 'CSS');
            }
        }

        // Calculate totalFilteredItems based on mode
        if (isSearchMode) {
            // Search mode: totalFilteredItems already set by performEnhancedSearch
            // Don't recalculate, just use what's already set
        } else {
            // Normal mode: use API total count
            totalFilteredItems = assetsTotalCount;
        }

        // Calculate pagination
        const totalPages = Math.ceil(totalFilteredItems / itemsPerPage);

        // Ensure current page is within bounds
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        }
        if (currentPage < 1) {
            currentPage = 1;
        }

        // In both search and normal mode, display all items (already fetched the correct page)
        // No client-side pagination needed - the API already gave us the right items
        let paginatedItems = items;

        // Render rows
        paginatedItems.forEach(item => {
            const statusInfo = getStatusInfo(item.status);
            const folder = getFolderPath(item.categoryId);
            const modifiedDate = new Date(item.modifiedDate).toLocaleDateString();

            const tr = document.createElement('tr');
            // Add data attribute for items so we can update them later
            tr.setAttribute('data-item-id', item.id);
            tr.setAttribute('data-item-type', item.type);
            
            // Both landing pages and code resources can be published/unpublished
            // In search mode, verify we have a valid pageId for landing pages before allowing actions
            const isLandingPage = item.type === 'landing';
            const hasValidPageId = !isLandingPage || (isLandingPage && item.pageId);
            const isEnriched = item.status !== 'Loading...';
            
            const canPublish = isEnriched && hasValidPageId && item.status !== 'Published';
            const canUnpublish = isEnriched && hasValidPageId && item.status === 'Published';
            
            // Debug log for landing pages
            if (isLandingPage && isSearchMode) {
                console.log(`LP ${item.name}: id=${item.id}, pageId=${item.pageId}, assetId=${item.assetId}, hasValidPageId=${hasValidPageId}`);
            }
            
            tr.innerHTML = `
                <td>
                    <input type="checkbox" class="page-select-checkbox" data-id="${item.id}" data-type="${item.type}" data-assetid="${item.assetId}" data-status="${item.status}">
                </td>
                <td>
                    <span class="cpm-id" data-action="copy" data-id="${item.pageId || item.id}" title="Click to copy">
                        ${item.pageId || item.id}
                    </span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="cpm-download-icon" data-download="${isLandingPage ? 'html' : 'code'}" data-name="${item.name}" data-assetid="${item.assetId}" data-type="${item.type}" title="Download ${isLandingPage ? 'HTML' : 'code'}" style="background: none; border: none; padding: 0; cursor: pointer; color: ${item.typeInfo.color}; display: flex; align-items: center;">
                            ${ICONS.download}
                        </button>
                        <span>${item.name}</span>
                    </div>
                </td>
                <td>
                    <span class="cpm-breadcrumb" title="${folder}">${ICONS.folder} ${folder}</span>
                </td>
                <td>
                    <span class="cpm-type" style="background: ${item.typeInfo.color}22; color: ${item.typeInfo.color};">
                        ${item.typeInfo.icon} ${item.typeInfo.name}
                    </span>
                </td>
                <td>
                    <span class="cpm-status ${item.status.toLowerCase() === 'published' ? 'published' : (item.status.toLowerCase() === 'unpublished' ? 'unpublished' : 'draft')}">
                        ${statusInfo.icon}
                        ${item.status}
                    </span>
                </td>
                <td>
                    ${item.url ? `<a href="${item.url}" target="_blank" class="cpm-url">${ICONS.externalLink} ${item.url.substring(0, 35)}...</a>` : '<span style="color: #9ca3af;">N/A</span>'}
                </td>
                <td>${modifiedDate}</td>
                <td>
                    <div class="cpm-actions">
                        ${canUnpublish ?
                            `<button class="cpm-action-btn unpublish-btn" data-action="unpublish" data-id="${item.id}" data-type="${item.type}" data-assetid="${item.assetId}" title="Unpublish">
                                ${ICONS.eyeClosed} Unpublish
                            </button>` : ''}
                        ${canPublish ?
                            `<button class="cpm-action-btn publish-btn" data-action="publish" data-id="${item.id}" data-type="${item.type}" data-assetid="${item.assetId}" data-siteassetid="${item.siteAssetId || item.assetId}" title="Publish">
                                ${ICONS.cloudUpload} Publish
                            </button>` : ''}
                        ${!hasValidPageId && isEnriched ? 
                            `<span style="color: #ff6b6b; font-size: 11px; font-weight: 600;">⚠ No Page ID</span>` : ''}
                        <button class="cpm-action-btn" data-action="copy" data-id="${item.id}">${ICONS.copy} Copy ID</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;">No items found</td></tr>';
        }

        // Render pagination
        renderPagination(totalPages);
        
        // Enrich all visible items with additional details (async, non-blocking)
        if (paginatedItems.length > 0) {
            console.log(`🔍 Enriching ${paginatedItems.length} visible items with metadata...`);
            
            // Enrich in parallel for better performance
            const enrichmentPromises = paginatedItems.map(item => {
                const assetId = item.assetId || item.id;
                return enrichItemDetails(assetId, item.type)
                    .then(metadata => {
                        if (metadata) {
                            updateItemWithDetails(metadata, item.id);
                        }
                    })
                    .catch(err => console.warn(`Enrichment failed for item ${item.id}:`, err));
            });
            
            Promise.all(enrichmentPromises).then(() => {
                console.log(`✓ Finished enriching ${paginatedItems.length} items`);
            });
        }
    }

    function renderPagination(totalPages) {
        const paginationContainer = document.getElementById('cpm-pagination');
        if (!paginationContainer) return;

        // Always show the pagination info (even if only one page), but only render buttons when multiple pages exist
        let paginationHTML = '<div class="cpm-pagination-info">';
        if (totalFilteredItems === 0) {
            paginationHTML += 'Showing 0 of 0 items';
        } else {
            paginationHTML += `Showing ${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, totalFilteredItems)} of ${totalFilteredItems} items`;
        }
        paginationHTML += '</div><div class="cpm-pagination-buttons">';

        if (totalPages <= 1) {
            // No page buttons needed; render the info and exit
            paginationContainer.innerHTML = paginationHTML + '</div>';
            return;
        }

        // Previous button
        paginationHTML += `<button class="cpm-page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>« Prev</button>`;

        // Page numbers with smart truncation
        const maxPagesToShow = 7;
        let startPage = Math.max(1, currentPage - 3);
        let endPage = Math.min(totalPages, currentPage + 3);

        // Adjust if we're near the start or end
        if (currentPage <= 4) {
            endPage = Math.min(totalPages, maxPagesToShow);
        }
        if (currentPage > totalPages - 4) {
            startPage = Math.max(1, totalPages - maxPagesToShow + 1);
        }

        // First page
        if (startPage > 1) {
            paginationHTML += `<button class="cpm-page-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                paginationHTML += '<span class="cpm-page-ellipsis">...</span>';
            }
        }

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === currentPage ? ' active' : '';
            paginationHTML += `<button class="cpm-page-btn${isActive}" data-page="${i}" ${i === currentPage ? 'disabled' : ''}>${i}</button>`;
        }

        // Last page
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += '<span class="cpm-page-ellipsis">...</span>';
            }
            paginationHTML += `<button class="cpm-page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next button
        paginationHTML += `<button class="cpm-page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next »</button>`;
        paginationHTML += '</div>';

        paginationContainer.innerHTML = paginationHTML;
    }

    function updateStats() {
        // Count code resources only (excluding landing pages to avoid double-counting)
        const codeResources = allAssets.filter(a => {
            const typeName = a.assetType?.name?.toLowerCase() || '';
            return ['jsoncoderesource', 'jscoderesource', 'codesnippetblock', 'csscoderesource'].includes(typeName);
        });

        const stats = {
            total: landingPages.length + codeResources.length,
            landing: landingPages.length,
            published: landingPages.filter(p => p.status === 'Published').length,
            unpublished: landingPages.filter(p => p.status === 'Unpublished').length,
            draft: landingPages.filter(p => p.status === 'Draft').length,
            json: codeResources.filter(a => a.assetType?.name?.toLowerCase() === 'jsoncoderesource').length,
            js: codeResources.filter(a => ['jscoderesource', 'codesnippetblock'].includes(a.assetType?.name?.toLowerCase() || '')).length,
            css: codeResources.filter(a => a.assetType?.name?.toLowerCase() === 'csscoderesource').length
        };

        const els = {
            'stat-total': stats.total,
            'stat-landing': stats.landing,
            'stat-published': stats.published,
            'stat-unpublished': stats.unpublished,
            'stat-draft': stats.draft,
            'stat-json': stats.json,
            'stat-js': stats.js,
            'stat-css': stats.css
        };

        Object.entries(els).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    function showLoading(show) {
        isLoading = show;
        const el = document.getElementById('cpm-loading');
        // Only show loader if panel is open
        if (el && show && isPanelOpen) {
            el.style.display = 'flex';
        } else if (el) {
            el.style.display = 'none';
        }
    }

    function showToast(message) {
        const toast = document.getElementById('cloudpages-toast');
        if (toast) {
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    }

    function updateSelectedCount() {
        const unpublishCount = Array.from(selectedPages).filter(id => {
            const checkbox = document.querySelector(`.page-select-checkbox[data-id="${id}"]`);
            return checkbox && checkbox.dataset.status === 'Published';
        }).length;

        const publishCount = Array.from(selectedPages).filter(id => {
            const checkbox = document.querySelector(`.page-select-checkbox[data-id="${id}"]`);
            return checkbox && checkbox.dataset.status !== 'Published';
        }).length;

        const unpublishCountEl = document.getElementById('unpublish-count');
        const publishCountEl = document.getElementById('publish-count');

        if (unpublishCountEl) unpublishCountEl.textContent = unpublishCount;
        if (publishCountEl) publishCountEl.textContent = publishCount;

        const batchUnpublishBtn = document.getElementById('cpm-batch-unpublish-btn');
        const batchPublishBtn = document.getElementById('cpm-batch-publish-btn');

        if (batchUnpublishBtn) batchUnpublishBtn.disabled = unpublishCount === 0;
        if (batchPublishBtn) batchPublishBtn.disabled = publishCount === 0;
    }

    function copyToClipboard(text) {
        // Use execCommand method which works in all contexts, including restricted ones
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showToast(`Copied: ${text}`);
            } else {
                showToast('Copy failed');
            }
        } catch (err) {
            console.error('Copy error:', err);
            showToast('Copy not supported');
        } finally {
            document.body.removeChild(textArea);
        }
    }

    // Enhanced UI Creation with dual token display
    function createUI() {
        const container = document.createElement('div');
        container.id = 'cloudpages-manager';
        container.className = isPanelOpen ? '' : 'minimized';

        container.innerHTML = `
            <style>
                #cloudpages-manager {
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 70%;
                    height: 100vh;
                    background: #ffffff;
                    box-shadow: -8px 0 32px rgba(0,0,0,0.2);
                    z-index: 999999;
                    display: flex;
                    flex-direction: column;
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border-left: 1px solid #e5e7eb;
                }

                #cloudpages-manager.minimized {
                    transform: translateX(100%);
                }

                .cpm-toggle-btn {
                    position: fixed;
                    top: 50%;
                    right: 0;
                    transform: translateY(-50%);
                    /* SLDS brand color */
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

                .cpm-header {
                    /* SLDS brand header */
                    background: #0176d3;
                    color: #ffffff;
                    padding: 20px 30px;
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

                .cpm-header h1 {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
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

                #selected-count {
                    font-weight: 700;
                }

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

                .cpm-token-section {
                    background: #fef3c7;
                    border: 1px solid #fcd34d;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }

                .cpm-token-status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 12px;
                }

                .status {
                    font-weight: 600;
                    font-size: 13px;
                }

                .status.success { color: #10b981; }
                .status.error { color: #ef4444; }

                .cpm-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 8px;
                    margin-bottom: 12px;
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
                    position: relative;
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
                    margin-right: 8px;
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

                .cpm-stat-label {
                    font-size: 9px;
                    color: #6b7280;
                    margin-bottom: 3px;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    line-height: 1.2;
                }

                .cpm-stat-value {
                    font-size: 18px;
                    font-weight: 700;
                    color: #111827;
                    line-height: 1;
                }

                .cpm-search-bar {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 16px;
                }

                #cpm-search {
                    flex: 1;
                    padding: 10px 14px;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 14px;
                }

                #cpm-search:focus {
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

                .cpm-table-container {
                    background: white;
                    border-radius: 8px;
                    overflow-x: auto;
                    overflow-y: visible;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                .cpm-table {
                    width: 100%;
                    min-width: 1200px;
                    border-collapse: collapse;
                    font-size: 13px;
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
                    position: relative;
                    user-select: none;
                    transition: background 0.2s;
                }

                .cpm-table thead th:hover {
                    background: #f1f5f9;
                }

                .cpm-table tbody td {
                    padding: 12px;
                    border-bottom: 1px solid #f1f5f9;
                    color: #334155;
                    transition: background-color 0.15s ease-out;
                }

                .cpm-table tbody tr {
                    background: #ffffff;
                    transition: all 0.15s ease-out;
                }

                .cpm-table tbody tr:hover {
                    background: #f8fafc;
                    box-shadow: inset 0 0 0 1px #e2e8f0;
                }

                .cpm-table tbody tr.selected {
                    background: #eff6ff;
                }

                /* Column resize handle */
                .cpm-table-col-resizer {
                    position: absolute;
                    right: -6px;
                    top: 0;
                    bottom: 0;
                    width: 12px;
                    cursor: col-resize;
                    user-select: none;
                    background: transparent;
                }

                .cpm-table-col-resizer::after {
                    content: '';
                    position: absolute;
                    right: 5px;
                    top: 4px;
                    bottom: 4px;
                    width: 1px;
                    background: #cbd5e1;
                    opacity: 0;
                    transition: opacity 0.2s;
                }

                .cpm-table-col-resizer:hover::after {
                    opacity: 1;
                    background: #0250D9;
                }

                .cpm-table th:hover .cpm-table-col-resizer::after {
                    opacity: 1;
                }

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

                .cpm-breadcrumb svg {
                    flex-shrink: 0;
                }

                .cpm-status, .cpm-type {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    white-space: nowrap;
                    transition: all 0.2s ease;
                }

                .cpm-status svg, .cpm-type svg {
                    flex-shrink: 0;
                }

                .cpm-type-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }

                .cpm-type-icon svg {
                    width: 18px;
                    height: 18px;
                }

                /* Status colors with SLDS palette */
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

                .cpm-url {
                    color: #00588F;
                    text-decoration: none;
                    font-size: 12px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .cpm-url svg {
                    flex-shrink: 0;
                }

                .cpm-url:hover {
                    text-decoration: underline;
                    color: #0176d3;
                }

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

                .cpm-action-btn svg {
                    flex-shrink: 0;
                }

                .cpm-action-btn:hover {
                    border-color: #0250D9;
                    color: #0250D9;
                    background: #eff6ff;
                    box-shadow: 0 1px 3px rgba(2, 80, 217, 0.1);
                }

                .cpm-action-btn:active {
                    transform: scale(0.98);
                }

                .page-select-checkbox, #select-all-checkbox {
                    cursor: pointer;
                    width: 16px;
                    height: 16px;
                    accent-color: #0250D9;
                    transition: all 0.2s;
                }

                .page-select-checkbox:hover, #select-all-checkbox:hover {
                    transform: scale(1.1);
                }

                .unpublish-btn {
                    color: #8A033E;
                    border-color: #FDB6C5;
                    background: #FEF0F3;
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
                }

                .publish-btn:hover {
                    background: #ACF3E4;
                    border-color: #06A59A;
                    color: #056764;
                }

                .cpm-download-icon {
                    transition: all 0.2s ease;
                }

                .cpm-download-icon:hover {
                    transform: scale(1.15);
                    opacity: 0.7;
                }

                .cpm-download-icon:active {
                    transform: scale(1.0);
                }

                @keyframes downloadBounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-1px); }
                }

                .cpm-download-icon.downloading .download-arrow {
                    animation: downloadBounce 0.6s ease-in-out infinite;
                }

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
                    font-size: 13px;
                }

                #cpm-loading {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: none;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    gap: 16px;
                    z-index: 10000000;
                }

                .cpm-spinner {
                    width: 50px;
                    height: 50px;
                    background: #0176d3;
                    animation: morphingSquare 2s ease-in-out infinite;
                }

                .cpm-loading-text {
                    color: white;
                    font-size: 14px;
                    font-weight: 500;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                @keyframes morphingSquare {
                    0% {
                        border-radius: 6%;
                        transform: rotate(0deg);
                    }
                    50% {
                        border-radius: 50%;
                        transform: rotate(180deg);
                    }
                    100% {
                        border-radius: 6%;
                        transform: rotate(360deg);
                    }
                }

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
                
                /* Modern Tooltip Styles */
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
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2);
                    pointer-events: none;
                    opacity: 0;
                    transform: translateY(4px);
                    transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1), 
                                transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
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
            </style>

            <div class="cpm-header">
                <div class="cpm-header-left">
                    <div class="cpm-logo">
                        <img src="https://i.postimg.cc/TYgXhFJJ/output-onlinepngtools-(4).png" alt="Salesforce Logo">
                    </div>
                
                </div>
                <div class="cpm-header-actions">
                    <button class="cpm-header-btn batch-unpublish" id="cpm-batch-unpublish-btn" disabled>
                        ${ICONS.eyeClosed} Unpublish (<span id="unpublish-count">0</span>)
                    </button>
                    <button class="cpm-header-btn batch-publish" id="cpm-batch-publish-btn" disabled>
                        ${ICONS.cloudUpload} Publish (<span id="publish-count">0</span>)
                    </button>
                    <button class="cpm-header-btn" id="cpm-refresh-btn">${ICONS.refresh} Refresh</button>
                    <button class="cpm-header-btn" id="cpm-export-btn">${ICONS.download} Export</button>
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
                    <div class="cpm-stats-grid">
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
                        <input type="text" id="cpm-search" placeholder="Search by name, content, description, folder...">
                        <button class="cpm-btn" id="cpm-search-btn">Search</button>
                    </div>
                </div>

                <div class="cpm-table-container">
                    <table class="cpm-table">
                        <thead>
                            <tr>
                                <th style="width: 40px;">
                                    <input type="checkbox" id="select-all-checkbox" title="Select all published pages">
                                </th>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Folder</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>URL</th>
                                <th>Modified</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="cpm-table-body">
                            <tr><td colspan="9" style="text-align:center;padding:40px;color:#9ca3af;">Loading...</td></tr>
                        </tbody>
                    </table>
                    <div id="cpm-pagination"></div>
                </div>
            </div>

            <div id="cpm-loading">
                <div class="cpm-spinner"></div>
                <div class="cpm-loading-text">Loading data...</div>
            </div>
        `;

        document.body.appendChild(container);

        // Add toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'cpm-toggle-btn';
        toggleBtn.textContent = 'CP Maestro';
        toggleBtn.addEventListener('click', () => window.cpManager.togglePanel());
        document.body.appendChild(toggleBtn);

        // Add toast
        const toast = document.createElement('div');
        toast.id = 'cloudpages-toast';
        document.body.appendChild(toast);



        // Setup event listeners
        setupEventListeners();
    }

    function setupEventListeners() {
        // Header button event listeners
        document.getElementById('cpm-refresh-btn').addEventListener('click', () => window.cpManager.refresh());
        document.getElementById('cpm-export-btn').addEventListener('click', () => window.cpManager.exportCSV());
        document.getElementById('cpm-close-btn').addEventListener('click', () => window.cpManager.togglePanel());

        // Enhanced search functionality
        document.getElementById('cpm-search').addEventListener('keyup', async (e) => {
            if (e.key === 'Enter') {
                const searchTerm = e.target.value.trim();
                await performEnhancedSearch(searchTerm);
            }
        });

        const searchBtn = document.getElementById('cpm-search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', async () => {
                const searchTerm = document.getElementById('cpm-search')?.value.trim();
                await performEnhancedSearch(searchTerm);
            });
        }

        // Event delegation for clickable stat cards
        const statsGrid = document.querySelector('.cpm-stats-grid');
        if (statsGrid) {
            statsGrid.addEventListener('click', (e) => {
                const statCard = e.target.closest('.cpm-stat[data-filter]');
                if (!statCard) return;

                currentFilter = statCard.dataset.filter;
                // Don't reset currentPage - keep user on their current page
                
                document.querySelectorAll('.cpm-stat').forEach(card => {
                    card.classList.remove('active');
                });
                statCard.classList.add('active');
                
                // Just re-render with the filter applied
                renderTable();
            });
        }

        // Event delegation for table actions
        document.getElementById('cpm-table-body').addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const id = target.dataset.id;
            const type = target.dataset.type; // 'landing' or 'asset'
            const assetId = target.dataset.assetid;

            if (action === 'copy') {
                window.cpManager.copyText(id);
            } else if (action === 'unpublish') {
                window.cpManager.unpublishItem(id, type, assetId);
            } else if (action === 'publish') {
                const siteAssetId = target.dataset.siteassetid || assetId || 0;
                window.cpManager.publishItem(id, type, siteAssetId);
            }
        });

        // Download handler for landing pages and code resources
        document.getElementById('cpm-table-body').addEventListener('click', async (e) => {
            const target = e.target.closest('[data-download]');
            if (!target) return;

            const downloadType = target.dataset.download;
            const name = target.dataset.name;
            const assetId = target.dataset.assetid;
            const type = target.dataset.type;
            
            // Show loading state with CSS animation
            target.classList.add('downloading');
            target.disabled = true;
            target.style.cursor = 'wait';
            
            try {
                if (downloadType === 'html') {
                    await fetchLandingPageHTML({ name, assetId });
                } else if (downloadType === 'code') {
                    await fetchCodeResourceContent({ name, assetId, type });
                }
            } finally {
                // Restore original state
                target.classList.remove('downloading');
                target.disabled = false;
                target.style.cursor = 'pointer';
            }
        });

        // Select all checkbox handler
        document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.page-select-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                if (e.target.checked) {
                    selectedPages.add(cb.dataset.id);
                } else {
                    selectedPages.delete(cb.dataset.id);
                }
            });
            updateSelectedCount();
        });

        // Individual checkbox handler
        document.getElementById('cpm-table-body').addEventListener('change', (e) => {
            if (e.target.classList.contains('page-select-checkbox')) {
                const pageId = e.target.dataset.id;
                if (e.target.checked) {
                    selectedPages.add(pageId);
                } else {
                    selectedPages.delete(pageId);
                }
                updateSelectedCount();
            }
        });

        // Pagination click handler
        document.getElementById('cpm-pagination').addEventListener('click', async (e) => {
            const pageBtn = e.target.closest('.cpm-page-btn');
            if (!pageBtn || pageBtn.disabled) return;

            const page = parseInt(pageBtn.dataset.page);
            if (page && page !== currentPage) {
                currentPage = page;

                if (isSearchMode) {
                    // Search mode: re-run search with new page number to get next page from API
                    await performEnhancedSearch(currentSearchTerm);
                } else if (currentFilter === 'all') {
                    // All filter: server-side pagination
                    await fetchData(page);
                } else {
                    // Other filters: client-side pagination on already loaded data
                    renderTable();
                }

                // Scroll to top of table
                document.querySelector('.cpm-table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        // Batch unpublish button handler
        document.getElementById('cpm-batch-unpublish-btn').addEventListener('click', async () => {
            const unpublishItems = Array.from(selectedPages).map(id => {
                const checkbox = document.querySelector(`.page-select-checkbox[data-id="${id}"]`);
                if (checkbox && checkbox.dataset.status === 'Published') {
                    return {
                        id: id,
                        type: checkbox.dataset.type,
                        assetId: checkbox.dataset.assetid
                    };
                }
                return null;
            }).filter(item => item !== null);

            if (unpublishItems.length === 0) {
                showToast('No published items selected');
                return;
            }

            if (!confirm(`Unpublish ${unpublishItems.length} item(s)?`)) return;

            showLoading(true);
            let successCount = 0;
            let failCount = 0;

            for (const item of unpublishItems) {
                try {
                    if (item.type === 'landing') {
                        await window.cpManager.unpublishPageAsync(item.id);
                    } else {
                        await window.cpManager.unpublishCodeResourceAsync(item.assetId);
                    }
                    successCount++;
                    showToast(`Progress: ${successCount}/${unpublishItems.length} unpublished`);
                } catch (error) {
                    failCount++;
                    console.error(`Failed to unpublish ${item.id}:`, error);
                }
            }

            showLoading(false);
            showToast(`Completed: ${successCount} success, ${failCount} failed. Click Refresh to update.`);
            selectedPages.clear();
            updateSelectedCount();
            document.querySelectorAll('.page-select-checkbox').forEach(cb => cb.checked = false);
            document.getElementById('select-all-checkbox').checked = false;
        });

        // Batch publish button handler
        document.getElementById('cpm-batch-publish-btn').addEventListener('click', async () => {
            const publishItems = Array.from(selectedPages).map(id => {
                const checkbox = document.querySelector(`.page-select-checkbox[data-id="${id}"]`);
                if (checkbox && checkbox.dataset.status !== 'Published') {
                    return {
                        id: id,
                        type: checkbox.dataset.type,
                        assetId: checkbox.dataset.assetid
                    };
                }
                return null;
            }).filter(item => item !== null);

            if (publishItems.length === 0) {
                showToast('No unpublished items selected');
                return;
            }

            if (!confirm(`Publish ${publishItems.length} item(s)?`)) return;

            showLoading(true);
            let successCount = 0;
            let failCount = 0;

            for (const item of publishItems) {
                try {
                    if (item.type === 'landing') {
                        await window.cpManager.publishPageAsync(item.id, 0);
                    } else {
                        await window.cpManager.publishCodeResourceAsync(item.assetId);
                    }
                    successCount++;
                    showToast(`Progress: ${successCount}/${publishItems.length} published`);
                } catch (error) {
                    failCount++;
                    console.error(`Failed to publish ${item.id}:`, error);
                }
            }

            showLoading(false);
            showToast(`Completed: ${successCount} success, ${failCount} failed. Click Refresh to update.`);
            selectedPages.clear();
            updateSelectedCount();
            document.querySelectorAll('.page-select-checkbox').forEach(cb => cb.checked = false);
            document.getElementById('select-all-checkbox').checked = false;
        });
    }

    // Enhanced Public API
    window.cpManager = {
        togglePanel() {
            const container = document.getElementById('cloudpages-manager');
            if (!container) return;

            isPanelOpen = !isPanelOpen;
            if (isPanelOpen) {
                container.classList.remove('minimized');
                if (isLoading) {
                    const loaderEl = document.getElementById('cpm-loading');
                    if (loaderEl) loaderEl.style.display = 'flex';
                }
            } else {
                container.classList.add('minimized');
            }
        },

        setFilter(filter) {
            currentFilter = filter;
            document.querySelectorAll('.cpm-stat').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            renderTable();
        },

        copyText(text) {
            copyToClipboard(text);
        },

        // Universal unpublish - works for both landing pages and code resources
        async unpublishItem(id, type, assetId) {
            if (!appcoreToken) {
                showToast('APPCORE Token not available. Please refresh the page.');
                return;
            }

            const itemType = type === 'landing' ? 'Landing Page' : 'Code Resource';
            if (!confirm(`Unpublish ${itemType} ${id}?`)) return;

            showLoading(true);
            
            if (type === 'landing') {
                // Landing pages use the landing-pages endpoint with landingPageId
                const endpoint = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${id}/unpublish`;
                
                console.log(`Attempting to unpublish Landing Page ${id}...`);
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: endpoint,
                    anonymous: false,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': appcoreToken
                    },
                    data: JSON.stringify({ landingPageId: parseInt(id) }),
                    onload: function(response) {
                        showLoading(false);
                        if (response.status === 200 || response.status === 204) {
                            showToast('Landing Page unpublished successfully. Click Refresh to update.');
                            enrichmentCache.delete(parseInt(assetId));
                        } else if (response.status === 403) {
                            showToast('APPCORE Token invalid/expired. Please refresh the page.');
                        } else {
                            showToast(`Failed: ${response.status}`);
                            console.error(`Unpublish failed: ${response.status}`, response.responseText);
                        }
                    },
                    onerror: function() {
                        showLoading(false);
                        showToast('Network error');
                    }
                });
            } else {
                // Code resources: first get codeResourceId from sites endpoint, then unpublish
                console.log(`Fetching codeResourceId for asset ${assetId}...`);
                
                const sitesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;
                
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: sitesUrl,
                    anonymous: false,
                    headers: { 'Accept': 'application/json' },
                    onload: function(response) {
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                console.log('Sites response:', JSON.stringify(data, null, 2));
                                
                                if (data.entities && data.entities.length > 0) {
                                    const entity = data.entities[0];
                                    // siteId is the codeResourceId for code resources
                                    const codeResourceId = entity.siteId;
                                    console.log(`Found codeResourceId (siteId): ${codeResourceId}, unpublishing...`);
                                    
                                    if (!codeResourceId) {
                                        showLoading(false);
                                        showToast('Could not find codeResourceId in site data');
                                        console.error('Entity structure:', entity);
                                        return;
                                    }
                                    
                                    // Use the code-resources endpoint
                                    const unpublishUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/code-resources/${codeResourceId}/unpublish`;
                                    
                                    GM_xmlhttpRequest({
                                        method: 'POST',
                                        url: unpublishUrl,
                                        anonymous: false,
                                        headers: {
                                            'Accept': 'text/html',
                                            'Content-Type': 'application/json',
                                            'X-CSRF-Token': appcoreToken
                                        },
                                        data: JSON.stringify({ codeResourceId: parseInt(codeResourceId) }),
                                        onload: function(resp) {
                                            showLoading(false);
                                            if (resp.status === 200 || resp.status === 204) {
                                                showToast('Code Resource unpublished successfully. Click Refresh to update.');
                                                enrichmentCache.delete(parseInt(assetId));
                                            } else if (resp.status === 403) {
                                                showToast('APPCORE Token invalid/expired. Please refresh the page.');
                                            } else {
                                                showToast(`Failed: ${resp.status}`);
                                                console.error(`Unpublish failed: ${resp.status}`, resp.responseText);
                                            }
                                        },
                                        onerror: function() {
                                            showLoading(false);
                                            showToast('Network error');
                                        }
                                    });
                                } else {
                                    showLoading(false);
                                    showToast('Could not find site info for this asset');
                                }
                            } catch (e) {
                                showLoading(false);
                                showToast('Error parsing site info');
                                console.error('Parse error:', e);
                            }
                        } else {
                            showLoading(false);
                            showToast(`Failed to get site info: ${response.status}`);
                        }
                    },
                    onerror: function() {
                        showLoading(false);
                        showToast('Network error');
                    }
                });
            }
        },

        // Universal publish - works for both landing pages and code resources
        async publishItem(id, type, siteAssetId) {
            if (!appcoreToken) {
                showToast('APPCORE Token not available. Please refresh the page.');
                return;
            }

            const itemType = type === 'landing' ? 'Landing Page' : 'Code Resource';
            showLoading(true);
            
            if (type === 'landing') {
                // Landing pages use the landing-pages endpoint
                const endpoint = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${id}/publish`;
                
                console.log(`Attempting to publish Landing Page ${id}...`);
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: endpoint,
                    anonymous: false,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': appcoreToken
                    },
                    data: JSON.stringify({ landingPageId: parseInt(id) }),
                    onload: function(response) {
                        showLoading(false);
                        if (response.status === 200 || response.status === 204) {
                            showToast('Landing Page published successfully. Click Refresh to update.');
                            enrichmentCache.delete(parseInt(siteAssetId));
                        } else if (response.status === 403) {
                            showToast('APPCORE Token invalid/expired. Please refresh the page.');
                        } else {
                            showToast(`Failed: ${response.status}`);
                            console.error(`Publish failed: ${response.status}`, response.responseText);
                        }
                    },
                    onerror: function() {
                        showLoading(false);
                        showToast('Network error');
                    }
                });
            } else {
                // Code resources: first get codeResourceId from sites endpoint, then publish
                console.log(`Fetching codeResourceId for asset ${siteAssetId}...`);
                
                const sitesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${siteAssetId}`;
                
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: sitesUrl,
                    anonymous: false,
                    headers: { 'Accept': 'application/json' },
                    onload: function(response) {
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                console.log('Sites response:', JSON.stringify(data, null, 2));
                                
                                if (data.entities && data.entities.length > 0) {
                                    const entity = data.entities[0];
                                    // siteId is the codeResourceId for code resources
                                    const codeResourceId = entity.siteId;
                                    console.log(`Found codeResourceId (siteId): ${codeResourceId}, publishing...`);
                                    
                                    if (!codeResourceId) {
                                        showLoading(false);
                                        showToast('Could not find codeResourceId in site data');
                                        console.error('Entity structure:', entity);
                                        return;
                                    }
                                    
                                    // Use the code-resources endpoint
                                    const publishUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/code-resources/${codeResourceId}/publish`;
                                    
                                    GM_xmlhttpRequest({
                                        method: 'POST',
                                        url: publishUrl,
                                        anonymous: false,
                                        headers: {
                                            'Accept': 'text/html',
                                            'Content-Type': 'application/json',
                                            'X-CSRF-Token': appcoreToken
                                        },
                                        data: JSON.stringify({}),
                                        onload: function(resp) {
                                            showLoading(false);
                                            if (resp.status === 200 || resp.status === 204) {
                                                showToast('Code Resource published successfully. Click Refresh to update.');
                                                enrichmentCache.delete(parseInt(siteAssetId));
                                            } else if (resp.status === 403) {
                                                showToast('APPCORE Token invalid/expired. Please refresh the page.');
                                            } else {
                                                showToast(`Failed: ${resp.status}`);
                                                console.error(`Publish failed: ${resp.status}`, resp.responseText);
                                            }
                                        },
                                        onerror: function() {
                                            showLoading(false);
                                            showToast('Network error');
                                        }
                                    });
                                } else {
                                    showLoading(false);
                                    showToast('Could not find site info for this asset');
                                }
                            } catch (e) {
                                showLoading(false);
                                showToast('Error parsing site info');
                                console.error('Parse error:', e);
                            }
                        } else {
                            showLoading(false);
                            showToast(`Failed to get site info: ${response.status}`);
                        }
                    },
                    onerror: function() {
                        showLoading(false);
                        showToast('Network error');
                    }
                });
            }
        },

        // Legacy methods for backward compatibility
        async unpublishPage(landingPageId) {
            if (!appcoreToken) {
                showToast('APPCORE Token not available. Please refresh the page.');
                return;
            }

            if (!confirm(`Unpublish Landing Page ${landingPageId}?`)) return;

            showLoading(true);
            const endpoint = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${landingPageId}/unpublish`;

            console.log(`Attempting to unpublish page ${landingPageId}...`);
            console.log(`   Using APPCORE token: ${appcoreToken.substring(0, 50)}...`);
            console.log(`   Token source: ${appcoreSource}`);

            GM_xmlhttpRequest({
                method: 'POST',
                url: endpoint,
                headers: {
                    'Accept': 'text/html',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': appcoreToken
                },
                data: JSON.stringify({ landingPageId: parseInt(landingPageId) }),
                onload: function(response) {
                    showLoading(false);
                    if (response.status === 200 || response.status === 204) {
                        showToast('Page unpublished successfully. Click Refresh to update the list.');
                        console.log('Unpublish successful');
                    } else if (response.status === 403) {
                        showToast('APPCORE Token invalid/expired. Please refresh the page.');
                        console.error('Unpublish failed: 403 Forbidden');
                    } else {
                        showToast(`Failed: ${response.status}`);
                        console.error(`Unpublish failed: ${response.status}`);
                    }
                },
                onerror: function() {
                    showLoading(false);
                    showToast('Network error');
                    console.error('Unpublish network error');
                }
            });
        },

        async publishPage(landingPageId, siteAssetId) {
            await publishPage(landingPageId, siteAssetId);
        },

        unpublishPageAsync(landingPageId) {
            return new Promise((resolve, reject) => {
                if (!appcoreToken) {
                    reject(new Error('APPCORE CSRF Token not available'));
                    return;
                }

                const endpoint = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${landingPageId}/unpublish`;

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: endpoint,
                    headers: {
                        'Accept': 'text/html',
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': appcoreToken
                    },
                    data: JSON.stringify({ landingPageId: parseInt(landingPageId) }),
                    onload: function(response) {
                        if (response.status === 200 || response.status === 204) {
                            resolve();
                        } else {
                            reject(new Error(`Status ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });
        },

        publishPageAsync(landingPageId, stateId) {
            return new Promise((resolve, reject) => {
                if (!appcoreToken) {
                    reject(new Error('APPCORE CSRF Token not available'));
                    return;
                }

                const endpoint = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/${landingPageId}/publish`;

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: endpoint,
                    headers: {
                        'Accept': 'text/html',
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': appcoreToken
                    },
                    data: JSON.stringify({ landingPageId: parseInt(landingPageId) }),
                    onload: function(response) {
                        if (response.status === 200 || response.status === 204) {
                            resolve();
                        } else {
                            reject(new Error(`Status ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });
        },

        // Async unpublish for code resources - gets siteId first, then unpublishes
        unpublishCodeResourceAsync(assetId) {
            return new Promise((resolve, reject) => {
                if (!appcoreToken) {
                    reject(new Error('APPCORE CSRF Token not available'));
                    return;
                }

                // First get the siteId (codeResourceId) from the sites endpoint
                const sitesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: sitesUrl,
                    anonymous: false,
                    headers: { 'Accept': 'application/json' },
                    onload: function(response) {
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                if (data.entities && data.entities.length > 0) {
                                    const codeResourceId = data.entities[0].siteId;
                                    
                                    // Now unpublish the code resource
                                    const unpublishUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/code-resources/${codeResourceId}/unpublish`;
                                    
                                    GM_xmlhttpRequest({
                                        method: 'POST',
                                        url: unpublishUrl,
                                        anonymous: false,
                                        headers: {
                                            'Accept': 'text/html',
                                            'Content-Type': 'application/json',
                                            'X-CSRF-Token': appcoreToken
                                        },
                                        data: JSON.stringify({ codeResourceId: parseInt(codeResourceId) }),
                                        onload: function(resp) {
                                            if (resp.status === 200 || resp.status === 204) {
                                                enrichmentCache.delete(parseInt(assetId));
                                                resolve();
                                            } else {
                                                reject(new Error(`Status ${resp.status}`));
                                            }
                                        },
                                        onerror: function() {
                                            reject(new Error('Network error'));
                                        }
                                    });
                                } else {
                                    reject(new Error('Could not find site info'));
                                }
                            } catch (e) {
                                reject(new Error('Error parsing site info'));
                            }
                        } else {
                            reject(new Error(`Failed to get site info: ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });
        },

        // Async publish for code resources - gets siteId first, then publishes
        publishCodeResourceAsync(assetId) {
            return new Promise((resolve, reject) => {
                if (!appcoreToken) {
                    reject(new Error('APPCORE CSRF Token not available'));
                    return;
                }

                // First get the siteId (codeResourceId) from the sites endpoint
                const sitesUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/sites?siteAssetId=${assetId}`;

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: sitesUrl,
                    anonymous: false,
                    headers: { 'Accept': 'application/json' },
                    onload: function(response) {
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                if (data.entities && data.entities.length > 0) {
                                    const codeResourceId = data.entities[0].siteId;
                                    
                                    // Now publish the code resource
                                    const publishUrl = `https://cloud-pages.${stack}.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/code-resources/${codeResourceId}/publish`;
                                    
                                    GM_xmlhttpRequest({
                                        method: 'POST',
                                        url: publishUrl,
                                        anonymous: false,
                                        headers: {
                                            'Accept': 'text/html',
                                            'Content-Type': 'application/json',
                                            'X-CSRF-Token': appcoreToken
                                        },
                                        data: JSON.stringify({}),
                                        onload: function(resp) {
                                            if (resp.status === 200 || resp.status === 204) {
                                                enrichmentCache.delete(parseInt(assetId));
                                                resolve();
                                            } else {
                                                reject(new Error(`Status ${resp.status}`));
                                            }
                                        },
                                        onerror: function() {
                                            reject(new Error('Network error'));
                                        }
                                    });
                                } else {
                                    reject(new Error('Could not find site info'));
                                }
                            } catch (e) {
                                reject(new Error('Error parsing site info'));
                            }
                        } else {
                            reject(new Error(`Failed to get site info: ${response.status}`));
                        }
                    },
                    onerror: function() {
                        reject(new Error('Network error'));
                    }
                });
            });
        },

        refresh() {
            isSearchMode = false;
            allDataLoaded = false;
            currentPage = 1;
            document.getElementById('cpm-search').value = '';
            fetchData(1);
        },

        exportCSV() {
            const headers = ['ID', 'Name', 'Folder', 'Type', 'Status', 'URL', 'Modified'];
            const rows = [];

                // Build combined list of displayed items (landing pages + assets)
                const allItems = [];

                // Add landing pages (may reference an asset for folder)
                landingPages.forEach(lp => {
                    const asset = allAssets.find(a => a.id === lp.siteAssetId) || null;
                    allItems.push({
                        id: lp.landingPageId,
                        name: lp.name,
                        folderId: asset?.category?.id,
                        type: 'Landing Page',
                        status: lp.status,
                        url: lp.url || '',
                        modifiedDate: lp.modifiedDate
                    });
                });

                // Add assets (code resources and others) — avoid duplicating landing page siteAssets
                const landingAssetIds = new Set(landingPages.map(lp => lp.siteAssetId));
                allAssets.forEach(asset => {
                    if (!asset) return;
                    // If this asset is the siteAsset for a landing page we've already exported, skip
                    if (landingAssetIds.has(asset.id)) return;

                    const typeInfo = getAssetTypeInfo(asset.assetType);
                    const status = asset.status?.name || asset.status || 'Draft';
                    allItems.push({
                        id: asset.id,
                        name: asset.name,
                        folderId: asset.category?.id,
                        type: typeInfo.name,
                        status: status,
                        url: asset.meta?.publishUrl || '',
                        modifiedDate: asset.modifiedDate
                    });
                });

                // Apply currentFilter (if any) — keep behavior same as table
                let exportItems = allItems;
                if (currentFilter && currentFilter !== 'all') {
                    if (currentFilter === 'landing') {
                        exportItems = allItems.filter(i => i.type === 'Landing Page');
                    } else if (currentFilter === 'json') {
                        exportItems = allItems.filter(i => i.type === 'JSON');
                    } else if (currentFilter === 'javascript') {
                        exportItems = allItems.filter(i => i.type === 'JavaScript');
                    } else if (currentFilter === 'css') {
                        exportItems = allItems.filter(i => i.type === 'CSS');
                    }
                }

                // Build CSV rows from exportItems
                exportItems.forEach(item => {
                    rows.push([
                        item.id,
                        `"${item.name || ''}"`,
                        `"${getFolderPath(item.folderId)}"`,
                        item.type,
                        item.status,
                        item.url || '',
                        item.modifiedDate || ''
                    ]);
                });

            const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], {type: 'text/csv'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cloudpages_enhanced_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            showToast('Enhanced CSV exported');
        },

        renderTable
    };

    // Enhanced Initialization
    function init() {
        if (window.cpManagerInitialized) {
            console.log('CloudPage Maestro already initialized');
            return;
        }

        if (document.getElementById('cloudpages-manager')) {
            console.log('CloudPage Maestro already exists');
            return;
        }

        window.cpManagerInitialized = true;

        console.log('Initializing CloudPage Maestro...');
        console.log('Enhanced features: Dual tokens, POST query pagination, improved search');

        // Load tokens from storage (captured separately)
        pageHookToken = GM_getValue(STORAGE_KEYS.pageHookToken, null);
        appcoreToken = GM_getValue(STORAGE_KEYS.appcoreToken, null);
        pageHookSource = GM_getValue(STORAGE_KEYS.pageHookSource, null);
        appcoreSource = GM_getValue(STORAGE_KEYS.appcoreSource, null);

        if (pageHookToken) {
            console.log(`Page Hook token loaded from storage: ${pageHookToken.substring(0, 50)}... (length: ${pageHookToken.length})`);
            console.log(`   Source: ${pageHookSource} - Used for search/query operations`);
        } else {
            console.warn('No Page Hook token found in storage');
        }

        if (appcoreToken) {
            console.log(`APPCORE token loaded from storage: ${appcoreToken.substring(0, 50)}... (length: ${appcoreToken.length})`);
            console.log(`   Source: ${appcoreSource} - Used for publish/unpublish operations`);
        } else {
            console.warn('No APPCORE token found in storage - token should have been captured in cloud-pages iframe');
        }

        // Create the enhanced UI
        createUI();

        // Update token status after UI is created
        setTimeout(() => {
            updateTokenStatus();
        }, 100);

        // Fetch data after a short delay
        setTimeout(() => {
            fetchData();
            console.log('CloudPage Maestro initialized successfully');
        }, 300);
    }

    // Context Detection (same as original)
    function isInTokenIframeContext() {
        return window.location.href.includes('cloud-pages');
    }

    function isInUIIframeContext() {
        const isObjectManager = window.location.href.includes('objectmanager');
        const hasCorrectName = window.name && window.name.includes('crossdocmessenger');
        const isInIframe = window.self !== window.top;

        return isObjectManager && isInIframe && hasCorrectName;
    }

    // Enhanced Entry Point
    console.log('═══════════════════════════════════════════════════════════');
    console.log('CloudPage Maestro - Enhanced v4.0');
    console.log('   Features: Dual tokens, POST query, enhanced search');
    console.log('   URL:', window.location.href);
    console.log('   Window name:', window.name);
    console.log('═══════════════════════════════════════════════════════════');

    // Inject page hook immediately (before page loads)
    injectPageHook();

    if (isInTokenIframeContext()) {
        console.log('TOKEN CONTEXT - Capturing APPCORE token from cloud-pages...');

        // Extract APPCORE_BROWSER_CONFIG token from DOM (like v3.0 does)
        setTimeout(() => {
            const scripts = document.getElementsByTagName('script');
            console.log(`   Searching ${scripts.length} script tags for APPCORE_BROWSER_CONFIG...`);

            for (let i = 0; i < scripts.length; i++) {
                const content = scripts[i].textContent || scripts[i].innerHTML;

                if (content.includes('APPCORE_BROWSER_CONFIG') && content.includes('csrfToken')) {
                    console.log(`Found APPCORE_BROWSER_CONFIG in script tag #${i}`);

                    // Extract token with regex
                    const tokenMatch = content.match(/csrfToken["']?\s*:\s*["']([^"']+)["']/);
                    if (tokenMatch && tokenMatch[1]) {
                        const token = tokenMatch[1];
                        console.log('Extracted APPCORE csrfToken from HTML');
                        console.log(`   Token (first 50 chars): ${token.substring(0, 50)}...`);
                        console.log(`   Token length: ${token.length}`);

                        // Store it as APPCORE token for publish/unpublish operations
                        GM_setValue(STORAGE_KEYS.appcoreToken, token);
                        GM_setValue(STORAGE_KEYS.appcoreSource, `scriptTag#${i}`);
                        console.log('APPCORE token saved to Tampermonkey storage');
                        console.log('   The objectmanager iframe will use this token for publish/unpublish');
                        break;
                    }
                }
            }
        }, 500);

        console.log('Not initializing UI in token iframe (UI belongs in objectmanager)');
    }
    else if (isInUIIframeContext()) {
        console.log('UI CONTEXT - Initializing enhanced manager...');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(init, 500);
            });
        } else {
            setTimeout(init, 500);
        }
    } else {
        console.log('NOT IN EXPECTED CONTEXT - Enhanced script will not run');
        console.log('   Expected: cloud-pages (token) OR objectmanager (UI)');
    }
})();
