// handlers/search/AssetSearchService.js
// Search Content Builder assets (templates, emails, blocks, etc.) via Content Builder tab.

import { executeAssetSearch } from './AssetSearchBridge.js';

export class AssetSearchService {
    /**
     * Search assets in Content Builder (requires a Content Builder tab to be open).
     * @param {string} searchTerm - Search term
     * @param {*} _instance - Unused; baseUrl comes from the Content Builder tab
     * @returns {Promise<{ results: Array<{ type: string, id: *, name: string, assetType: string, modifiedDate: *, url: string }>, hint?: string }>}
     */
    static async search(searchTerm, _instance = null) {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        try {
            const payload = await executeAssetSearch({ searchTerm: searchTerm.trim() });
            if (!payload.success || !Array.isArray(payload.results)) {
                return { results: [], hint: payload.error || 'Unknown error during asset search' };
            }
            const baseUrl = payload.baseUrl || '';
            return {
                results: payload.results.map((item) => ({
                type: 'asset',
                id: item.id,
                name: item.name || '(Unnamed)',
                assetType: item.assetType?.displayName || item.assetType?.name || 'Asset',
                modifiedDate: item.modifiedDate || null,
                url: baseUrl ? `${baseUrl}/#/content/contentBuilder/${item.id}` : ''
                })),
                hint: null
            };
        } catch (error) {
            console.error('AssetSearchService error:', error);
            return [];
        }
    }
}
