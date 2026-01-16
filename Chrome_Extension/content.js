// Content script for CloudPage Maestro Chrome Extension
// Converted from Tampermonkey userscript v5.0

console.log('[CloudPage Maestro] Content script loaded on:', window.location.href);

(async function() {
    'use strict';

    // Wait a bit for page to stabilize
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('[CloudPage Maestro] Initializing on:', window.location.href);

    // Always try to capture tokens
    captureTokensFromDOM();

    // Initialize the main application on any SFMC page
    await initializeCloudPageMaestro();

})();

// Token capture from DOM
function captureTokensFromDOM() {
    console.log('[CloudPage Maestro] Attempting to capture tokens from DOM...');

    // Look for APPCORE token in script tags
    const scripts = document.querySelectorAll('script');
    for (let script of scripts) {
        const text = script.textContent || '';
        
        // Try to find APPCORE_BROWSER_CONFIG
        if (text.includes('APPCORE_BROWSER_CONFIG')) {
            console.log('[CloudPage Maestro] Found APPCORE_BROWSER_CONFIG script');
            const match = text.match(/csrfToken["']?\s*:\s*["']([^"']+)["']/);
            if (match) {
                chrome.runtime.sendMessage({
                    type: 'TOKEN_CAPTURED',
                    tokenType: 'appcore',
                    token: match[1],
                    source: 'DOM:APPCORE_BROWSER_CONFIG'
                }, response => {
                    console.log('[CloudPage Maestro] APPCORE token sent to background');
                });
            }
        }

        // Look for _pageHook token
        if (text.includes('_pageHook') || text.includes('pageHook')) {
            const match = text.match(/["']?csrfToken["']?\s*:\s*["']([^"']+)["']/);
            if (match) {
                chrome.runtime.sendMessage({
                    type: 'TOKEN_CAPTURED',
                    tokenType: 'pageHook',
                    token: match[1],
                    source: 'DOM:pageHook'
                }, response => {
                    console.log('[CloudPage Maestro] PageHook token sent to background');
                });
            }
        }
    }

    // Intercept fetch calls for token capture
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
            // Clone to read headers without consuming response
            const token = response.headers.get('x-csrf-token');
            if (token) {
                const url = args[0];
                const tokenType = url.includes('content-builder') ? 'pageHook' : 'appcore';
                chrome.runtime.sendMessage({
                    type: 'TOKEN_CAPTURED',
                    tokenType: tokenType,
                    token: token,
                    source: 'fetch:' + url.substring(0, 100)
                });
            }
            return response;
        });
    };
}

// Main initialization function
async function initializeCloudPageMaestro() {
    console.log('[CloudPage Maestro] Getting tokens from background...');

    // Get tokens from background script
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
            console.warn('[CloudPage Maestro] No tokens available yet, showing notification...');
            createNotification('Waiting for tokens...', 'Navigate to CloudPages to capture tokens', 'warning');
            return;
        }

        console.log('[CloudPage Maestro] Tokens loaded, showing ready notification...');
        createReadyNotification();
        
        // Create the main UI panel
        createMainUI(pageHookToken, appcoreToken);
    });
}

// Create main UI panel
function createMainUI(pageHookToken, appcoreToken) {
    console.log('[CloudPage Maestro] Creating main UI panel...');
    
    // Remove any existing panel
    const existingPanel = document.getElementById('cloudpage-maestro-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    // Create panel container
    const panel = document.createElement('div');
    panel.id = 'cloudpage-maestro-panel';
    panel.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        width: 400px;
        max-height: 80vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    `;
    
    // Panel header
    const header = document.createElement('div');
    header.style.cssText = `
        background: rgba(0, 0, 0, 0.2);
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <img src="https://i.postimg.cc/TYgXhFJJ/output-onlinepngtools-(4).png" 
                 alt="CloudPage Maestro" 
                 style="height: 28px; width: auto;">
            <span style="color: white; font-weight: 600; font-size: 1rem;">CloudPage Maestro</span>
        </div>
        <button id="cpm-close-btn" style="
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
        ">✕</button>
    `;
    
    // Panel content
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 1.5rem;
        flex: 1;
        overflow-y: auto;
    `;
    
    content.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <h3 style="margin: 0 0 0.5rem 0; color: #1f2937; font-size: 1.125rem;">
                Token Status
            </h3>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: ${pageHookToken ? '#ecfdf5' : '#fef2f2'}; border-radius: 6px;">
                    <span style="font-size: 1.25rem;">${pageHookToken ? '✓' : '✗'}</span>
                    <span style="color: #374151; font-size: 0.875rem;">Content Builder Token</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: ${appcoreToken ? '#ecfdf5' : '#fef2f2'}; border-radius: 6px;">
                    <span style="font-size: 1.25rem;">${appcoreToken ? '✓' : '✗'}</span>
                    <span style="color: #374151; font-size: 0.875rem;">CloudPages Token</span>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <h3 style="margin: 0 0 0.5rem 0; color: #1f2937; font-size: 1.125rem;">
                Quick Actions
            </h3>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <button id="cpm-list-pages" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 0.75rem 1rem;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    📄 List All CloudPages
                </button>
                <button id="cpm-export-list" style="
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    padding: 0.75rem 1rem;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    💾 Export to CSV
                </button>
                <button id="cpm-bulk-unpublish" style="
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                    color: white;
                    border: none;
                    padding: 0.75rem 1rem;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    🔒 Bulk Unpublish
                </button>
            </div>
        </div>
        
        <div id="cpm-results" style="margin-top: 1rem; display: none;">
            <h3 style="margin: 0 0 0.5rem 0; color: #1f2937; font-size: 1.125rem;">
                Results
            </h3>
            <div id="cpm-results-content" style="
                background: #f9fafb;
                padding: 1rem;
                border-radius: 6px;
                max-height: 300px;
                overflow-y: auto;
                font-size: 0.875rem;
                color: #374151;
            "></div>
        </div>
    `;
    
    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);
    
    // Make panel draggable
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    
    header.addEventListener('mousedown', (e) => {
        if (e.target.id === 'cpm-close-btn') return;
        isDragging = true;
        initialX = e.clientX - panel.offsetLeft;
        initialY = e.clientY - panel.offsetTop;
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        panel.style.left = currentX + 'px';
        panel.style.top = currentY + 'px';
        panel.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    // Close button
    document.getElementById('cpm-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    // Button event listeners
    document.getElementById('cpm-list-pages').addEventListener('click', () => {
        listCloudPages(pageHookToken); // Use pageHook token for Content Builder API
    });
    
    document.getElementById('cpm-export-list').addEventListener('click', () => {
        showMessage('Export functionality coming soon!', 'info');
    });
    
    document.getElementById('cpm-bulk-unpublish').addEventListener('click', () => {
        showMessage('Bulk unpublish functionality coming soon!', 'info');
    });
    
    console.log('[CloudPage Maestro] UI panel created successfully');
}

// List CloudPages function (basic version)
async function listCloudPages(token) {
    const resultsDiv = document.getElementById('cpm-results');
    const resultsContent = document.getElementById('cpm-results-content');
    
    resultsDiv.style.display = 'block';
    resultsContent.innerHTML = '<div style="text-align: center; color: #667eea;">⏳ Loading CloudPages...</div>';
    
    try {
        // Get stack from URL
        const stack = getStack();
        if (!stack) {
            throw new Error('Could not determine SFMC stack from URL');
        }
        
        console.log('[CloudPage Maestro] Fetching CloudPages from stack:', stack);
        
        // Fetch first page of assets
        const result = await fetchCloudPagesAPI(stack, token, 1, 50);
        
        if (!result || !result.items) {
            throw new Error('No data returned from API');
        }
        
        console.log('[CloudPage Maestro] Fetched:', result.items.length, 'items, total:', result.totalCount);
        
        // Display results
        displayCloudPagesTable(result.items, result.totalCount);
        
    } catch (error) {
        console.error('[CloudPage Maestro] Error:', error);
        resultsContent.innerHTML = `<div style="color: #dc2626;">❌ Error: ${error.message}</div>`;
    }
}

// Extract stack from URL
function getStack() {
    const match = window.location.href.match(/mc\.([^.]+)\.exacttarget\.com/);
    return match ? match[1] : null;
}

// Fetch CloudPages via API
async function fetchCloudPagesAPI(stack, token, page = 1, pageSize = 50) {
    const url = `https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query?scope=ours`;
    
    // CloudPages asset type IDs (landing pages and code resources)
    const assetTypeIds = [240, 241, 242, 243, 244, 245, 247, 248, 249];
    
    const payload = {
        page: { pageSize, page },
        sort: [{ direction: 'desc', property: 'modifiedDate' }],
        query: { property: 'assetType.id', simpleOperator: 'in', values: assetTypeIds },
        fields: ['assetType', 'category', 'createdDate', 'customerKey', 'id', 'modifiedDate', 'name', 'meta', 'status']
    };
    
    console.log('[CloudPage Maestro] API Request:', url);
    console.log('[CloudPage Maestro] Using token:', token ? token.substring(0, 20) + '...' : 'MISSING');
    
    // Use background script to make request (bypasses CORS)
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

// Display CloudPages in table
function displayCloudPagesTable(items, totalCount) {
    const resultsContent = document.getElementById('cpm-results-content');
    
    if (items.length === 0) {
        resultsContent.innerHTML = '<div style="color: #6b7280;">No CloudPages found.</div>';
        return;
    }
    
    let html = `
        <div style="margin-bottom: 0.75rem; font-weight: 600; color: #1f2937;">
            Found ${totalCount} CloudPages (showing ${items.length})
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem;">
                <thead style="position: sticky; top: 0; background: white;">
                    <tr style="border-bottom: 2px solid #e5e7eb;">
                        <th style="padding: 0.5rem; text-align: left; color: #374151; font-weight: 600;">Name</th>
                        <th style="padding: 0.5rem; text-align: left; color: #374151; font-weight: 600;">Type</th>
                        <th style="padding: 0.5rem; text-align: left; color: #374151; font-weight: 600;">Modified</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    items.forEach((item, index) => {
        const bgColor = index % 2 === 0 ? '#f9fafb' : 'white';
        const assetTypeName = item.assetType?.name || 'Unknown';
        const modifiedDate = new Date(item.modifiedDate).toLocaleDateString();
        
        html += `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 0.5rem; color: #111827;">${escapeHtml(item.name)}</td>
                <td style="padding: 0.5rem; color: #6b7280;">${assetTypeName}</td>
                <td style="padding: 0.5rem; color: #6b7280;">${modifiedDate}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    resultsContent.innerHTML = html;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show message helper
function showMessage(message, type = 'info') {
    const resultsDiv = document.getElementById('cpm-results');
    const resultsContent = document.getElementById('cpm-results-content');
    
    resultsDiv.style.display = 'block';
    const colors = {
        info: '#3b82f6',
        success: '#10b981',
        error: '#ef4444'
    };
    resultsContent.innerHTML = `<div style="color: ${colors[type]};">${message}</div>`;
}

// Show ready notification
function createReadyNotification() {
    createNotification('CloudPage Maestro', 'Extension loaded successfully', 'success');
}

// Generic notification function
function createNotification(title, message, type = 'success') {
    const colors = {
        success: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
    };

    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
    `;
    notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${title}</div>
        <div style="font-size: 0.875rem; opacity: 0.9;">${message}</div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 4000);

    // Add animations if not already added
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

// Helper function to make API requests via background script
async function makeAPIRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'MAKE_REQUEST',
            config: {
                url: url,
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.body || null
            }
        }, (response) => {
            if (!response.success) {
                reject(new Error(response.error));
            } else {
                resolve(response.data);
            }
        });
    });
}

// Export helper functions for later use
window.CloudPageMaestro = {
    makeAPIRequest,
    getTokens: () => {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, (response) => {
                resolve(response.success ? response.tokens : null);
            });
        });
    },
    notify: createNotification
};

console.log('[CloudPage Maestro] Content script initialization complete');
