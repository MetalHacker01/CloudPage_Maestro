// handlers/automation/AutomationHandler.js
import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

const debug = false;

/**
 * Handle fetching automation details from SFMC API.
 * This is a placeholder for future enhancement - currently the Automation Viewer
 * extracts data from the DOM, but this could be used to fetch via API if needed.
 * @param {Object} request - Contains automationId and instance
 * @param {Function} sendResponse 
 */
export async function handleFetchAutomationDetails(request, sendResponse) {
    try {
        const { automationId, instance } = request;
        
        if (!automationId) {
            sendResponse({ success: false, error: 'Automation ID is required' });
            return;
        }
        
        // Get SFMC instance if not provided
        const sfmcInstance = instance || await SFMCInstanceService.getInstance();
        
        // Example API endpoint (adjust based on actual SFMC API)
        // Note: This is a placeholder - actual endpoint may vary
        const url = `https://${sfmcInstance}.marketingcloudapps.com/automationStudio/fuelapi/v1/automation/${automationId}`;
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'accept': 'application/json',
                'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        sendResponse({ success: true, data });
        
    } catch (error) {
        if (debug) console.error('Error fetching automation details:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle fetching automation steps/activities from SFMC API.
 * This is a placeholder for future enhancement.
 * @param {Object} request - Contains automationId and instance
 * @param {Function} sendResponse 
 */
export async function handleFetchAutomationSteps(request, sendResponse) {
    try {
        const { automationId, instance } = request;
        
        if (!automationId) {
            sendResponse({ success: false, error: 'Automation ID is required' });
            return;
        }
        
        // Get SFMC instance if not provided
        const sfmcInstance = instance || await SFMCInstanceService.getInstance();
        
        // Example API endpoint (adjust based on actual SFMC API)
        // Note: This is a placeholder - actual endpoint may vary
        const url = `https://${sfmcInstance}.marketingcloudapps.com/automationStudio/fuelapi/v1/automation/${automationId}/steps`;
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'accept': 'application/json',
                'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        sendResponse({ success: true, data });
        
    } catch (error) {
        if (debug) console.error('Error fetching automation steps:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle fetching automation definition from SFMC API.
 * @param {Object} request - Contains automationId
 * @param {Function} sendResponse 
 */
export async function handleFetchAutomationDefinition(request, sendResponse) {
    try {
        const { automationId } = request;
        
        if (!automationId) {
            sendResponse({ success: false, error: 'Automation ID is required' });
            return;
        }
        
        // Get SFMC instance
        const instance = await SFMCInstanceService.getInstance();
        
        // API endpoint for automation definition
        const url = `https://${instance}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/legacy/v1/beta/bulk/automations/automation/definition/${automationId}`;
        
        if (debug) console.log('Fetching automation from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'accept': 'application/json',
                'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (debug) console.log('Automation data received:', data);
        
        sendResponse({ success: true, data });
        
    } catch (error) {
        if (debug) console.error('Error fetching automation definition:', error);
        sendResponse({ success: false, error: error.message });
    }
}

