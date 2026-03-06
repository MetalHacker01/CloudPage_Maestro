// utils/TabService.js
// Tab management utilities

export class TabService {
    /**
     * Get active tab(s) in the current window
     * @returns {Promise<Array>} Array of active tabs
     */
    static async getActiveTab() {
        return new Promise((resolve, reject) => {
            if (typeof chrome === 'undefined' || !chrome.tabs) {
                reject(new Error('Chrome tabs API not available.'));
                return;
            }
            
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Error fetching active tab: ${chrome.runtime.lastError.message}`));
                } else if (tabs && tabs.length > 0 && tabs[0].url) {
                    resolve(tabs);
                } else {
                    reject(new Error('Could not get active tab URL.'));
                }
            });
        });
    }
    
    /**
     * Get current tab URL
     * @returns {Promise<string|null>} Current tab URL or null
     */
    static async getCurrentUrl() {
        try {
            const tabs = await this.getActiveTab();
            return tabs[0]?.url || null;
        } catch (error) {
            console.error('Error getting current URL:', error);
            return null;
        }
    }
    
    /**
     * Get all SFMC tabs
     * @returns {Promise<Array>} Array of SFMC tabs
     */
    static async getSFMCTabs() {
        return new Promise((resolve, reject) => {
            if (typeof chrome === 'undefined' || !chrome.tabs) {
                reject(new Error('Chrome tabs API not available.'));
                return;
            }
            
            chrome.tabs.query({ url: "*://*.marketingcloudapps.com/*" }, (tabs) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Error fetching SFMC tabs: ${chrome.runtime.lastError.message}`));
                } else {
                    resolve(tabs || []);
                }
            });
        });
    }
}

