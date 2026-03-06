/**
 * DE Search Service
 * Shared service for searching Data Extensions
 * Extracted from popup/assets/data-handler.js for reuse
 */

import { SFMCInstanceService } from '../utils/SFMCInstanceService.js';
import { fetchFolderPath } from './DEExportService.js';

/**
 * Search for Data Extensions
 * @param {string} searchTerm - Search term
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @returns {Promise<Array>} Array of matching Data Extensions
 */
export async function searchDataExtensions(searchTerm, instance = null) {
    if (!instance) {
        instance = await SFMCInstanceService.getInstance();
    }
    
    // Ensure full instance format
    if (!instance.startsWith('mc.')) {
        instance = `mc.${instance}`;
    }

    const apiUrl = `https://${instance}.exacttarget.com/cloud/fuelapi/data-internal/v1/customobjects?retrievalType=1&$page=1&$pagesize=1000&$search=${encodeURIComponent(searchTerm)}`;

    const response = await fetch(apiUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
            'accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
        // Fetch folder paths for all items in parallel
        const itemsWithPaths = await Promise.all(
            data.items.map(async (item) => {
                let path = 'Uncategorized';
                try {
                    if (item.categoryId) {
                        path = await fetchFolderPath(item.categoryId, instance);
                    }
                } catch (error) {
                    console.warn(`Failed to fetch folder path for DE ${item.id}:`, error);
                    path = 'Uncategorized';
                }
                
                return {
                    id: item.id,
                    name: item.name,
                    path: path,
                    fieldCount: item.fieldCount,
                    rowCount: item.rowCount,
                    owner: item.ownerName || 'N/A',
                    isSendable: item.isSendable
                };
            })
        );
        
        return itemsWithPaths;
    }
    
    return [];
}

