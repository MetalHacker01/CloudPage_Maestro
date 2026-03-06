// handlers/registration/RegistrationHandler.js

const debug = false;

// Set of registered tabs (if implementing handshake)
const registeredTabs = new Set();

/**
 * Handle content script registration.
 * @param {Object} request 
 * @param {Object} sender 
 * @param {Function} sendResponse 
 */
export function handleRegisterContentScript(request, sender, sendResponse) {
    if (sender.tab && sender.tab.id !== undefined) {
        registeredTabs.add(sender.tab.id);
        if (debug) console.log(`Tab ${sender.tab.id} registered.`);
        sendResponse({ success: true });
    } else {
        sendResponse({ success: false, message: 'No tab information available.' });
    }
}

/**
 * Get registered tabs set (for use in background.js event listeners)
 * @returns {Set} The registered tabs set
 */
export function getRegisteredTabs() {
    return registeredTabs;
}

