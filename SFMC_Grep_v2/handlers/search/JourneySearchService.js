// handlers/search/JourneySearchService.js
// Search service for Journeys (Journey Builder)

import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

export class JourneySearchService {
    /**
     * Search Journeys by name
     * @param {string} searchTerm - Search term
     * @param {string} instance - SFMC instance (optional)
     * @returns {Promise<Array>} Array of matching Journeys
     */
    static async search(searchTerm, instance = null) {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        try {
            const sfmcInstance = instance || await SFMCInstanceService.getInstance();
            const url = `https://${sfmcInstance}.exacttarget.com/cloud/fuelapi/interaction/v1/interactions/?mostRecentVersionOnly=false&mostRecentVersionOrRunningOnly=true&$page=1&$pageSize=100&extras=trigger%2Cstats%2Ctag&$orderBy=modifiedDate%20desc`;

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to search journeys: ${response.status}`);
            }

            const data = await response.json();
            const journeys = data.items || [];

            // Filter by search term (case-insensitive)
            const searchLower = searchTerm.toLowerCase().trim();
            const filtered = journeys.filter(journey => 
                journey.name && journey.name.toLowerCase().includes(searchLower)
            );

            // Format results
            return filtered.map(journey => {
                // Journey ID needs %23 prefix (URL encoded #)
                // The ID should be used as-is, with %23 prefix in the URL
                const journeyId = journey.id;
                return {
                    type: 'journey',
                    id: journey.id,
                    name: journey.name,
                    version: journey.version || 1,
                    status: journey.status || 'Unknown',
                    modifiedDate: journey.modifiedDate || null,
                    url: `https://${sfmcInstance}.exacttarget.com/cloud/#app/Journey%20Builder/%23${journeyId}`
                };
            });
        } catch (error) {
            console.error('Error searching Journeys:', error);
            return [];
        }
    }
}

