// handlers/automation/ActivityCodeHandler.js
import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

const debug = false;

/**
 * Handle fetching activity code/content from SFMC API.
 * @param {Object} request - Contains activityObjectId and objectTypeId
 * @param {Function} sendResponse 
 */
export async function handleFetchActivityCode(request, sendResponse) {
    try {
        const { activityObjectId, objectTypeId } = request;
        
        if (!activityObjectId || !objectTypeId) {
            sendResponse({ success: false, error: 'Activity ID and type are required' });
            return;
        }
        
        // Get SFMC instance
        const instance = await SFMCInstanceService.getInstance();
        
        let code = null;
        
        // Fetch code based on activity type
        if (objectTypeId === 423) {
            // Script activity (SSJS/AMPscript)
            code = await fetchScriptActivity(instance, activityObjectId);
        } else if (objectTypeId === 300) {
            // Query activity (SQL)
            code = await fetchQueryActivity(instance, activityObjectId);
        } else {
            if (debug) console.log(`Activity type ${objectTypeId} not supported for code fetching`);
        }
        
        sendResponse({ success: true, code });
        
    } catch (error) {
        if (debug) console.error('Error fetching activity code:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Fetch script activity content.
 * @param {string} instance - SFMC instance
 * @param {string} activityObjectId - Activity object ID
 * @returns {Promise<string|null>} Script code
 */
async function fetchScriptActivity(instance, activityObjectId) {
    try {
        // Use the correct Automation Studio script endpoint
        const timestamp = Date.now();
        const url = `https://${instance}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/automation/v1/scripts/${activityObjectId}/?view=categoryinfo&_=${timestamp}`;
        
        if (debug) console.log('Fetching script from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'tz': 'accountPreference',
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (debug) console.log('Script activity data:', data);
            
            // The script code is in the 'script' field
            if (data.script) {
                // Add metadata as comments at the top
                let codeWithMetadata = '';
                
                if (data.name) {
                    codeWithMetadata += `// Script Name: ${data.name}\n`;
                }
                if (data.description) {
                    codeWithMetadata += `// Description: ${data.description}\n`;
                }
                if (data.status) {
                    codeWithMetadata += `// Status: ${data.status}\n`;
                }
                if (codeWithMetadata) {
                    codeWithMetadata += '\n';
                }
                
                codeWithMetadata += data.script;
                
                return codeWithMetadata;
            }
            
            return data.ssjsActivitySource || data.code || null;
        }
        
        if (debug) console.log(`Script activity API returned ${response.status}`);
        return null;
        
    } catch (error) {
        if (debug) console.error('Error fetching script activity:', error);
        return null;
    }
}

/**
 * Fetch query activity content.
 * @param {string} instance - SFMC instance
 * @param {string} activityObjectId - Activity object ID
 * @returns {Promise<string|null>} SQL query
 */
async function fetchQueryActivity(instance, activityObjectId) {
    try {
        // Use the correct Automation Studio query endpoint
        const timestamp = Date.now();
        const url = `https://${instance}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/automation/v1/queries/${activityObjectId}/?view=categoryinfo&_=${timestamp}`;
        
        if (debug) console.log('Fetching query from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'tz': 'accountPreference',
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (debug) console.log('Query activity data:', data);
            
            // The query text is in the 'queryText' field
            if (data.queryText) {
                // Return the query text along with useful metadata as comments
                let codeWithMetadata = '';
                
                // Add metadata as SQL comments
                if (data.name) {
                    codeWithMetadata += `-- Query Name: ${data.name}\n`;
                }
                if (data.targetName) {
                    codeWithMetadata += `-- Target DE: ${data.targetName}\n`;
                }
                if (data.targetUpdateTypeName) {
                    codeWithMetadata += `-- Update Type: ${data.targetUpdateTypeName}\n`;
                }
                if (data.description) {
                    codeWithMetadata += `-- Description: ${data.description}\n`;
                }
                if (codeWithMetadata) {
                    codeWithMetadata += '\n';
                }
                
                codeWithMetadata += data.queryText;
                
                return codeWithMetadata;
            }
            
            return data.query || data.sql || null;
        }
        
        if (debug) console.log(`Query activity API returned ${response.status}`);
        return null;
        
    } catch (error) {
        if (debug) console.error('Error fetching query activity:', error);
        return null;
    }
}

