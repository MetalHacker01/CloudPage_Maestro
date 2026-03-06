// handlers/search/DESearchService.js
// Search service for Data Extensions

import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

export class DESearchService {
    /**
     * Search Data Extensions by name
     * @param {string} searchTerm - Search term
     * @param {string} instance - SFMC instance (optional)
     * @returns {Promise<Array>} Array of matching Data Extensions
     */
    static async search(searchTerm, instance = null) {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        try {
            const sfmcInstance = instance || await SFMCInstanceService.getInstance();
            const encodedTerm = encodeURIComponent(searchTerm.trim());
            const url = `https://${sfmcInstance}.marketingcloudapps.com/contactsmeta/fuelapi/data-internal/v1/customobjects/category/0?retrievalType=1&$page=1&$pagesize=100&$search=${encodedTerm}`;

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to search DEs: ${response.status}`);
            }

            const data = await response.json();
            const items = data.items || [];

            // Format results
            return items.map(item => ({
                type: 'data-extension',
                id: item.id,
                name: item.name,
                customerKey: item.key,
                fieldCount: item.fieldCount || 0,
                rowCount: item.rowCount || 0,
                isSendable: item.isSendable || false,
                categoryId: item.categoryId,
                url: `https://${sfmcInstance}.marketingcloudapps.com/contactsmeta/admin.html#admin/data-extension/${item.id}/properties/`
            }));
        } catch (error) {
            console.error('Error searching Data Extensions:', error);
            return [];
        }
    }
}

