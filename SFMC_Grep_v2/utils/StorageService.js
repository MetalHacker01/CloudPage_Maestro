// utils/StorageService.js
// Unified chrome.storage wrapper

export class StorageService {
    /**
     * Get value(s) from chrome.storage.local
     * @param {string|string[]} key - Single key or array of keys
     * @returns {Promise<Object|any>} Storage result
     */
    static async get(key) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(key, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    // If single key, return the value directly
                    if (typeof key === 'string') {
                        resolve(result[key]);
                    } else {
                        resolve(result);
                    }
                }
            });
        });
    }
    
    /**
     * Set value(s) in chrome.storage.local
     * @param {Object|string} key - Key or object with key-value pairs
     * @param {any} value - Value (if key is string)
     * @returns {Promise<void>}
     */
    static async set(key, value) {
        return new Promise((resolve, reject) => {
            const data = typeof key === 'string' ? { [key]: value } : key;
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }
    
    /**
     * Remove key(s) from chrome.storage.local
     * @param {string|string[]} key - Key or array of keys to remove
     * @returns {Promise<void>}
     */
    static async remove(key) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(key, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }
    
    /**
     * Get token from storage
     * @returns {Promise<string|null>} Token or null
     */
    static async getToken() {
        try {
            return await this.get('token');
        } catch (error) {
            console.error('Error getting token:', error);
            return null;
        }
    }
    
    /**
     * Set token in storage
     * @param {string} token - Token to store
     * @returns {Promise<void>}
     */
    static async setToken(token) {
        return this.set('token', token);
    }
    
    /**
     * Remove token from storage
     * @returns {Promise<void>}
     */
    static async removeToken() {
        return this.remove('token');
    }
}

