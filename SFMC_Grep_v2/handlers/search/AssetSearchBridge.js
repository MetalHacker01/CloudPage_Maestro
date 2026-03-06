// handlers/search/AssetSearchBridge.js
// Runs in background context; finds a Content Builder tab and forwards ASSET_SEARCH to its content script.

/**
 * Find a tab that has Content Builder open and send ASSET_SEARCH to its content script.
 * @param {{ searchTerm: string }} request
 * @returns {Promise<{ success: boolean, results: Array, total: number, baseUrl: string|null, error?: string }>}
 */
export function executeAssetSearch(request) {
    const searchTerm = typeof request?.searchTerm === 'string' ? request.searchTerm.trim() : '';
    if (!searchTerm) {
        return Promise.resolve({ success: true, results: [], total: 0, baseUrl: null });
    }

    return new Promise((resolve) => {
        chrome.tabs.query({ url: '*://*.marketingcloudapps.com/*' }, (tabs) => {
            const contentBuilderTab = (tabs || []).find((t) => t.url && t.url.includes('content-builder')) || (tabs || [])[0];
            if (!contentBuilderTab || !contentBuilderTab.id) {
                resolve({
                    success: false,
                    error: 'No Content Builder tab found. Open Content Builder in a tab and try again.',
                    results: [],
                    total: 0,
                    baseUrl: null
                });
                return;
            }
            chrome.tabs.sendMessage(
                contentBuilderTab.id,
                { action: 'ASSET_SEARCH', searchTerm },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({
                            success: false,
                            error: chrome.runtime.lastError.message || 'Content script did not respond',
                            results: [],
                            total: 0,
                            baseUrl: null
                        });
                        return;
                    }
                    resolve(
                        response && typeof response === 'object'
                            ? response
                            : { success: false, results: [], total: 0, baseUrl: null }
                    );
                }
            );
        });
    });
}
