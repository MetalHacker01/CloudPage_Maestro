// handlers/search/EmailSearchService.js
// Search service for Emails

import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';

export class EmailSearchService {
    /**
     * Search Emails by name
     * @param {string} searchTerm - Search term
     * @param {string} instance - SFMC instance (optional)
     * @returns {Promise<Array>} Array of matching Emails
     */
    static async search(searchTerm, instance = null) {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        try {
            const sfmcInstance = instance || await SFMCInstanceService.getInstance();
            // Use alternative search method (more reliable)
            return await this.searchAlternative(searchTerm, sfmcInstance);
        } catch (error) {
            console.error('Error searching Emails:', error);
            return [];
        }
    }

    /**
     * Alternative search method if primary fails
     */
    static async searchAlternative(searchTerm, instance) {
        try {
            const url = `https://${instance}.marketingcloudapps.com/contactsmeta/fuelapi/asset/v1/content/assets?$page=1&$pageSize=100`;
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: { 'accept': 'application/json' }
            });

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            const items = data.items || data.entry || [];
            const searchLower = searchTerm.toLowerCase().trim();

            // Filter emails by name
            return items
                .filter(item => item.assetType?.name === 'email' && 
                               item.name && 
                               item.name.toLowerCase().includes(searchLower))
                .map(item => ({
                    type: 'email',
                    id: item.id,
                    name: item.name,
                    subject: item.views?.subjectline || item.subject || '',
                    status: item.status || 'Unknown',
                    modifiedDate: item.modifiedDate || null,
                    url: `https://${instance}.marketingcloudapps.com/contactsmeta/admin.html#app/content/contentBuilder/${item.id}`
                }));
        } catch (error) {
            console.error('Error in alternative email search:', error);
            return [];
        }
    }
}

