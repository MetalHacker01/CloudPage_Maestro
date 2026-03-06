// handlers/search/AutomationSearchService.js
// Search service for Automations

import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

export class AutomationSearchService {
    /**
     * Search Automations by name
     * @param {string} searchTerm - Search term
     * @param {string} instance - SFMC instance (optional)
     * @returns {Promise<Array>} Array of matching Automations
     */
    static async search(searchTerm, instance = null) {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        try {
            const sfmcInstance = instance || await SFMCInstanceService.getInstance();
            const url = `https://${sfmcInstance}.exacttarget.com/cloud/fuelapi/legacy/v1/beta/automations/automation/definition/?$sort=lastRunTime%20desc&view=gridView`;

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'accept': 'application/json, text/javascript, */*; q=0.01'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to search automations: ${response.status}`);
            }

            const data = await response.json();
            const automations = data.entry || [];

            // Filter by search term (case-insensitive)
            const searchLower = searchTerm.toLowerCase().trim();
            const filtered = automations.filter(automation => 
                automation.name && automation.name.toLowerCase().includes(searchLower)
            );

            // Format results
            return filtered.map(automation => {
                // Automation ID needs special format: AutomationStudioFuel3/%23Instance/{id}
                const automationId = automation.id || automation.key;
                return {
                    type: 'automation',
                    id: automationId,
                    name: automation.name,
                    status: automation.status || 'Unknown',
                    lastRunTime: automation.lastRunTime || null,
                    url: `https://${sfmcInstance}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23Instance/${automationId}`
                };
            });
        } catch (error) {
            console.error('Error searching Automations:', error);
            return [];
        }
    }
}

