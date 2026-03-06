// utils/CSRFService.js — SGv2 shim
// Tokens are captured via background.js webRequest listener.
// This shim reads them from chrome.storage so existing handlers work unchanged.

export class CSRFService {
    static _cache = null;

    /** Get CSRF token — reads from chrome.storage (set by webRequest listener) */
    static async getToken(instance) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['sgv2_appcoreToken', 'sgv2_pageHookToken'], (result) => {
                resolve(result.sgv2_appcoreToken || result.sgv2_pageHookToken || null);
            });
        });
    }

    /** Simplified version (no scripting API) — same as getToken in v2 */
    static async getTokenSimple(instance) {
        return this.getToken(instance);
    }

    /** No-op — cache is managed by chrome.storage TTL logic in background */
    static clearCache() {}
}
