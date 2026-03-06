// handlers/de/DEUsageHandler.js
import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

const debug = false;

/**
 * Handle fetching DE usage data from SFMC.
 * @param {Object} request - Contains deId and instance
 * @param {Function} sendResponse 
 */
export async function handleFetchDEUsageQueries(request, sendResponse) {
    const { deId, instance } = request;
    console.log('🔍 Background script received fetchDEUsageQueries request:', { deId, instance });

    if (!deId) {
        console.log('🔍 Missing DE ID, sending error response');
        sendResponse({ success: false, error: 'Missing DE ID' });
        return;
    }

    const sfmcInstance = instance || 's51'; // Default to s51 if no instance provided
    const url = `https://mc.${sfmcInstance}.exacttarget.com/cloud/fuelapi/automation/v1/queries/?$orderBy=modifiedDate%20desc&retrievalType=1&$pageSize=1000&$page=1`;

    console.log('🔍 Making API request to:', url);

    try {
        const response = await fetch(url, {
            headers: {
                "accept": "application/json",
            },
            method: "GET",
            credentials: "include" // Crucial for using browser cookies
        });

        console.log('🔍 API response status:', response.status);

        const data = await response.json();
        console.log('🔍 API response data:', data);

        sendResponse({ success: true, data: data });
    } catch (error) {
        console.log('🔍 API request error:', error);
        if (debug) console.error("Error fetching DE usage:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle fetching automation data from SFMC and checking for DE usage.
 * @param {Object} request - Contains deId and instance
 * @param {Function} sendResponse 
 */
export async function handleFetchDEUsageAutomations(request, sendResponse) {
    const { deId, instance } = request;
    if (!deId) {
        sendResponse({ success: false, error: 'Missing DE ID' });
        return;
    }

    const sfmcInstance = instance || 's51'; // Default to s51 if no instance provided

    try {
        // Step 1: Get all automation IDs
        const automationsUrl = `https://mc.${sfmcInstance}.exacttarget.com/cloud/fuelapi/legacy/v1/beta/automations/automation/definition/?$sort=lastRunTime%20desc&view=gridView`;

        const automationsResponse = await fetch(automationsUrl, {
            headers: {
                "accept": "application/json, text/javascript, */*; q=0.01"
            },
            credentials: "include"
        });

        if (!automationsResponse.ok) {
            throw new Error(`Failed to fetch automations: ${automationsResponse.status}`);
        }

        const automationsData = await automationsResponse.json();
        const automations = automationsData.entry || [];

        // Step 2: For each automation, fetch details and check for DE usage
        const matchingAutomations = [];

        // Process automations in batches to avoid too many parallel requests
        const batchSize = 5;
        for (let i = 0; i < automations.length; i += batchSize) {
            const batch = automations.slice(i, i + batchSize);
            const batchPromises = batch.map(async (automation) => {
                try {
                    // Use the new endpoint format
                    const detailUrl = `https://mc.${sfmcInstance}.exacttarget.com/cloud/fuelapi/automation/v1/automations/${automation.id}`;

                    const detailResponse = await fetch(detailUrl, {
                        headers: {
                            "accept": "application/json, text/javascript, */*; q=0.01"
                        },
                        credentials: "include"
                    });

                    if (!detailResponse.ok) {
                        if (debug) console.log(`Failed to fetch details for automation ${automation.id}: ${detailResponse.status}`);
                        return null;
                    }

                    const detailData = await detailResponse.json();

                    // Check if any activities in this automation use the DE
                    const foundActivity = findDEInNewAutomationFormat(detailData, deId);
                    if (foundActivity) {
                        // Return the full automation data with steps so it can be processed by filterAutomationData
                        return detailData;
                    }

                    return null;
                } catch (error) {
                    if (debug) console.log(`Error processing automation ${automation.id}:`, error);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            matchingAutomations.push(...batchResults.filter(result => result !== null));
        }

        sendResponse({ success: true, data: matchingAutomations });
    } catch (error) {
        if (debug) console.error("Error fetching automation usage data:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Searches through automation details in the new format to find activities that use a specific DE.
 * @param {Object} automation - The automation definition object
 * @param {String} deId - The Data Extension ID to look for
 * @returns {Object|null} - The activity that uses the DE, or null if not found
 */
function findDEInNewAutomationFormat(automation, deId) {
    if (!automation || !automation.steps) {
        return null;
    }

    for (const step of automation.steps) {
        if (!step.activities) continue;

        for (const activity of step.activities) {
            // Check in targetDataExtensions if available
            if (activity.targetDataExtensions && Array.isArray(activity.targetDataExtensions)) {
                for (const de of activity.targetDataExtensions) {
                    if (de.id && de.id.toLowerCase() === deId.toLowerCase()) {
                        return activity;
                    }
                }
            }

            // Check if activity object ID matches DE ID
            if (activity.activityObjectId && activity.activityObjectId.toLowerCase() === deId.toLowerCase()) {
                return activity;
            }
        }
    }

    return null;
}

/**
 * Handle fetching journey data from SFMC and checking for DE usage.
 * @param {Object} request - Contains deId and instance
 * @param {Function} sendResponse 
 */
export async function handleFetchDEUsageJourneys(request, sendResponse) {
    const { deId, instance } = request;
    if (!deId) {
        sendResponse({ success: false, error: 'Missing DE ID' });
        return;
    }

    const INSTANCE = await SFMCInstanceService.getInstance();
    const pageSize = 50; // API returns max 50 items per page
    let currentPage = 1;
    let itemsAll = [];
    let totalCount = 0;

    try {
        do {
            const url = `https://${INSTANCE}.exacttarget.com/cloud/fuelapi/interaction/v1/interactions/?mostRecentVersionOnly=false&mostRecentVersionOrRunningOnly=true&%24page=1&%24pageSize=50&extras=trigger%2Cstats%2Ctag&%24orderBy=modifiedDate%20desc`;
            const response = await fetch(url, {
                headers: { "accept": "application/json" },
                method: "GET",
                credentials: "include"
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch journeys page ${currentPage}: ${response.status}`);
            }
            const data = await response.json();
            // On first page, record total count
            if (currentPage === 1) {
                totalCount = data.count || (Array.isArray(data.items) ? data.items.length : 0);
            }
            // Append items from this page
            if (Array.isArray(data.items)) {
                itemsAll.push(...data.items);
            }
            currentPage++;
        } while (itemsAll.length < totalCount);

        // Return aggregated results
        sendResponse({ success: true, data: { items: itemsAll, count: totalCount, pageSize: pageSize } });
    } catch (error) {
        if (debug) console.error("Error fetching journey data:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle fetching event definition details for a specific journey.
 * @param {Object} request - Contains eventDefinitionId and instance
 * @param {Function} sendResponse 
 */
export async function handleFetchJourneyEventDefinition(request, sendResponse) {
    const { eventDefinitionId, instance } = request;
    if (!eventDefinitionId) {
        sendResponse({ success: false, error: 'Missing Event Definition ID' });
        return;
    }

    const sfmcInstance = instance || 's51'; // Default to s51 if no instance provided
    const url = `https://mc.${sfmcInstance}.exacttarget.com/cloud/fuelapi/interaction/v1/eventDefinitions/${eventDefinitionId}`;

    try {
        const response = await fetch(url, {
            headers: {
                "accept": "application/json",
            },
            method: "GET",
            credentials: "include" // Crucial for using browser cookies
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch event definition: ${response.status}`);
        }

        const data = await response.json();
        sendResponse({ success: true, data: data });
    } catch (error) {
        if (debug) console.error("Error fetching event definition:", error);
        sendResponse({ success: false, error: error.message });
    }
}

