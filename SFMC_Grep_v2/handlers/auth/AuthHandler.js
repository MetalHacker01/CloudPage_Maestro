// handlers/auth/AuthHandler.js
import { TokenService } from '../../utils/TokenService.js';
import { ConfigService } from '../../utils/ConfigService.js';

const debug = false;

/**
 * Handle get token request
 * @param {Function} sendResponse 
 */
export async function handleGetToken(sendResponse) {
    const token = await TokenService.getToken();
    sendResponse({ token });
}

/**
 * Handle logout.
 * @param {Function} sendResponse 
 */
export async function handleLogout(sendResponse) {
    await TokenService.removeToken();
    if (debug) console.log('Token removed from local storage.');
}


