// utils/APIService.js — SFMC Grep v2
// Token retrieval uses chrome.storage (captured by webRequest in background.js).
// CSRFService and TokenService are removed — no login form required.

import { SFMCInstanceService } from './SFMCInstanceService.js';

export class APIService {

    static async get(url, options = {}) {
        return this._fetch(url, { ...options, method: 'GET' });
    }

    static async post(url, data, options = {}) {
        return this._fetch(url, {
            ...options, method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
    }

    static async patch(url, data, options = {}) {
        return this._fetch(url, {
            ...options, method: 'PATCH',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json', ...options.headers }
        });
    }

    static async delete(url, options = {}) {
        return this._fetch(url, { ...options, method: 'DELETE' });
    }

    static async _fetch(url, options = {}) {
        const fetchOptions = {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
            credentials: options.credentials || 'include'
        };
        try {
            const response = await fetch(url, fetchOptions);
            return response;
        } catch (error) {
            console.error('[SGv2] API request failed:', error);
            throw error;
        }
    }

    /**
     * Make a credentialed SFMC API request.
     * @param {string} endpoint - Full URL or path
     * @param {Object} options - Fetch options
     * @param {string|null} instance - SFMC instance (e.g. "mc.s51" or "content-builder.s51")
     * @param {boolean} useCSRF - Whether to add x-csrf-token header
     */
    static async sfmcRequest(endpoint, options = {}, instance = null, useCSRF = false) {
        if (!instance) {
            instance = await SFMCInstanceService.getInstance();
        }

        const baseUrl = SFMCInstanceService.getApiBaseUrl(instance);
        const fullUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

        const defaultHeaders = {
            'accept': 'application/json',
            ...options.headers
        };

        // Add CSRF token from chrome.storage (captured via webRequest)
        if (useCSRF && options.method && options.method !== 'GET') {
            try {
                const token = await APIService._getStoredCsrfToken();
                if (token) defaultHeaders['x-csrf-token'] = token;
            } catch (e) {
                console.warn('[SGv2] Could not get CSRF token from storage:', e);
            }
        }

        const fetchOptions = {
            ...options,
            headers: defaultHeaders,
            credentials: 'include'
        };

        try {
            const response = await fetch(fullUrl, fetchOptions);
            return response;
        } catch (error) {
            console.error('[SGv2] SFMC API request failed:', error);
            throw error;
        }
    }

    /**
     * Get stored CSRF token from chrome.storage (set by background webRequest listener).
     * Prefers appcoreToken for most write operations.
     */
    static _getStoredCsrfToken() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['sgv2_appcoreToken', 'sgv2_pageHookToken'], (result) => {
                resolve(result.sgv2_appcoreToken || result.sgv2_pageHookToken || null);
            });
        });
    }
}
