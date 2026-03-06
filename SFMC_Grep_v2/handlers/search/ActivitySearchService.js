// handlers/search/ActivitySearchService.js
// Search service for Activities (Queries and Scripts)

import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

export class ActivitySearchService {
    /**
     * Search Activities (Queries and Scripts) by name
     * @param {string} searchTerm - Search term
     * @param {string} instance - SFMC instance (optional)
     * @returns {Promise<Array>} Array of matching Activities
     */
    static async search(searchTerm, instance = null) {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        try {
            const sfmcInstance = instance || await SFMCInstanceService.getInstance();
            const searchLower = searchTerm.toLowerCase().trim();
            const results = [];

            // Search Queries
            try {
                const queriesUrl = `https://${sfmcInstance}.exacttarget.com/cloud/fuelapi/automation/v1/queries/?$orderBy=modifiedDate%20desc&retrievalType=1&$pageSize=1000&$page=1`;
                const queriesResponse = await fetch(queriesUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: { 'accept': 'application/json' }
                });

                if (queriesResponse.ok) {
                    const queriesData = await queriesResponse.json();
                    const queries = queriesData.items || queriesData.entry || [];

                    // Filter matching queries first
                    const matchingQueries = queries.filter(query => 
                        query.name && query.name.toLowerCase().includes(searchLower)
                    );

                    // Process queries - fetch details to get queryDefinitionId
                    // Limit to first 20 to avoid too many API calls
                    const queriesToProcess = matchingQueries.slice(0, 20);
                    
                    const queryPromises = queriesToProcess.map(async (query) => {
                        try {
                            // Check if queryDefinitionId is already in the list response
                            if (query.queryDefinitionId) {
                                return {
                                    type: 'activity',
                                    activityType: 'query',
                                    id: query.queryDefinitionId,
                                    name: query.name,
                                    description: query.description || '',
                                    modifiedDate: query.modifiedDate || null,
                                    url: `https://${sfmcInstance}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/300/${query.queryDefinitionId}`
                                };
                            }

                            // Get query ID from list response (could be id, key, objectId, or customerKey)
                            // Prefer id or key as they're more likely to be UUIDs
                            const queryId = query.id || query.key || query.objectId || query.customerKey;
                            if (!queryId) {
                                console.warn(`No ID found for query: ${query.name}`);
                                return null;
                            }

                            // Skip if queryId looks like a name (not a UUID)
                            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                            if (!uuidPattern.test(queryId)) {
                                console.warn(`Query ID "${queryId}" for "${query.name}" doesn't look like a UUID, skipping detail fetch`);
                                return null;
                            }

                            // Fetch query details to get queryDefinitionId
                            // Try both endpoints - exacttarget.com and marketingcloudapps.com
                            let detailUrl = `https://${sfmcInstance}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/automation/v1/queries/${queryId}/?view=categoryinfo&_=${Date.now()}`;
                            let detailResponse = await fetch(detailUrl, {
                                method: 'GET',
                                credentials: 'include',
                                headers: {
                                    'accept': 'application/json, text/javascript, */*; q=0.01',
                                    'x-requested-with': 'XMLHttpRequest'
                                }
                            });

                            // If first endpoint fails, try the exacttarget.com endpoint
                            if (!detailResponse.ok) {
                                detailUrl = `https://${sfmcInstance}.exacttarget.com/cloud/fuelapi/automation/v1/queries/${queryId}/?view=categoryinfo&_=${Date.now()}`;
                                detailResponse = await fetch(detailUrl, {
                                    method: 'GET',
                                    credentials: 'include',
                                    headers: {
                                        'accept': 'application/json, text/javascript, */*; q=0.01',
                                        'x-requested-with': 'XMLHttpRequest'
                                    }
                                });
                            }

                            if (detailResponse.ok) {
                                const detailData = await detailResponse.json();
                                const queryDefinitionId = detailData.queryDefinitionId;
                                
                                if (queryDefinitionId) {
                                    // Validate it's a UUID format
                                    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                                    if (uuidPattern.test(queryDefinitionId)) {
                                        // Activity type 300 is for queries
                                        return {
                                            type: 'activity',
                                            activityType: 'query',
                                            id: queryDefinitionId,
                                            name: query.name || detailData.name,
                                            description: query.description || detailData.description || '',
                                            modifiedDate: query.modifiedDate || detailData.modifiedDate || null,
                                            url: `https://${sfmcInstance}.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23ActivityDetails/300/${queryDefinitionId}`
                                        };
                                    } else {
                                        console.warn(`queryDefinitionId "${queryDefinitionId}" for query "${query.name}" is not a valid UUID`);
                                    }
                                } else {
                                    console.warn(`No queryDefinitionId in detail response for query: ${query.name}`, detailData);
                                }
                            } else {
                                console.warn(`Failed to fetch query details for "${query.name}" (ID: ${queryId}): ${detailResponse.status} ${detailResponse.statusText}`);
                            }
                            
                            // Don't return a result if we can't get queryDefinitionId
                            return null;
                        } catch (error) {
                            console.error(`Error fetching query details for ${query.name}:`, error);
                            return null;
                        }
                    });

                    // Wait for all query detail fetches to complete
                    const queryResults = await Promise.all(queryPromises);
                    results.push(...queryResults.filter(result => result !== null));
                }
            } catch (error) {
                console.error('Error searching queries:', error);
            }

            // Search Scripts (limited - we can't easily list all scripts, so we skip for now)
            // Scripts are typically accessed through automations

            return results;
        } catch (error) {
            console.error('Error searching Activities:', error);
            return [];
        }
    }
}

