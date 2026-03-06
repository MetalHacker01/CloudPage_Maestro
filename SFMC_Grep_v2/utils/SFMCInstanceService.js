// utils/SFMCInstanceService.js
// SFMC instance detection and management

import { TabService } from './TabService.js';

export class SFMCInstanceService {
    static _instance = null;
    static _initialized = false;
    
    /**
     * Get SFMC instance from URL
     * @param {string} url - URL to extract instance from
     * @returns {string|null} Instance (e.g., 'mc.s51') or null
     */
    static getInstanceFromUrl(url) {
        if (!url) return null;
        
        // Match mc.sX. pattern
        const urlInstanceMatch = url.match(/mc\.(s\d+)\./);
        if (urlInstanceMatch && urlInstanceMatch[1]) {
            return `mc.${urlInstanceMatch[1]}`;
        }
        
        return null;
    }
    
    /**
     * Get SFMC instance from current active tab
     * @returns {Promise<string>} Instance (e.g., 'mc.s51'), defaults to 'mc.s51'
     */
    static async getInstance() {
        if (this._instance && this._initialized) {
            return this._instance;
        }
        
        try {
            const url = await TabService.getCurrentUrl();
            if (url) {
                const instance = this.getInstanceFromUrl(url);
                if (instance) {
                    this._instance = instance;
                    this._initialized = true;
                    return instance;
                }
            }
        } catch (error) {
            console.error('Error getting SFMC instance:', error);
        }
        
        // Fallback to default
        this._instance = 'mc.s51';
        this._initialized = true;
        return this._instance;
    }
    
    /**
     * Initialize SFMC instance (lazy initialization)
     * @returns {Promise<string>} Instance
     */
    static async initialize() {
        return await this.getInstance();
    }
    
    /**
     * Reset cached instance (useful for testing or when instance changes)
     */
    static reset() {
        this._instance = null;
        this._initialized = false;
    }
    
    /**
     * Get API base URL for SFMC instance
     * @param {string} instance - Instance (e.g., 'mc.s51')
     * @returns {string} API base URL
     */
    static getApiBaseUrl(instance) {
        const inst = instance || this._instance || 'mc.s51';
        return `https://${inst}.marketingcloudapps.com/contactsmeta/fuelapi`;
    }
    
    /**
     * Get ExactTarget API base URL for SFMC instance
     * @param {string} instance - Instance (e.g., 'mc.s51')
     * @returns {string} API base URL
     */
    static getExactTargetApiBaseUrl(instance) {
        const inst = instance || this._instance || 'mc.s51';
        return `https://${inst}.exacttarget.com/cloud/fuelapi`;
    }
}

