// handlers/search/SnippetSearchService.js
// Search service for Snippets

import { ConfigService } from '../../utils/ConfigService.js';
import { TokenService } from '../../utils/TokenService.js';

export class SnippetSearchService {
    /**
     * Search Snippets by name/trigger
     * @param {string} searchTerm - Search term
     * @returns {Promise<Array>} Array of matching Snippets
     */
    static async search(searchTerm) {
        if (!searchTerm || searchTerm.trim().length === 0) {
            return [];
        }

        try {
            const token = await TokenService.getToken();
            const searchLower = searchTerm.toLowerCase().trim();
            const results = [];

            // Search local snippets from chrome.storage
            const { customSnippets } = await new Promise((resolve) => {
                chrome.storage.local.get(['customSnippets'], resolve);
            });

            if (customSnippets && Array.isArray(customSnippets)) {
                customSnippets.forEach(snippet => {
                    if (snippet.trigger && snippet.trigger.toLowerCase().includes(searchLower)) {
                        results.push({
                            type: 'snippet',
                            id: snippet.id,
                            name: snippet.trigger,
                            content: snippet.content,
                            snippetType: snippet.type,
                            isLocal: true,
                            url: null
                        });
                    }
                });
            }

            // Search server snippets if token exists
            if (token) {
                try {
                    const response = await fetch(ConfigService.getApiUrl('/snippets'), {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && Array.isArray(data.data)) {
                            data.data.forEach(snippet => {
                                if (snippet.trigger && snippet.trigger.toLowerCase().includes(searchLower)) {
                                    // Avoid duplicates
                                    if (!results.find(r => r.id === snippet._id)) {
                                        results.push({
                                            type: 'snippet',
                                            id: snippet._id,
                                            name: snippet.trigger,
                                            content: snippet.content,
                                            snippetType: snippet.type,
                                            isLocal: false,
                                            url: null
                                        });
                                    }
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error('Error fetching server snippets:', error);
                }
            }

            return results;
        } catch (error) {
            console.error('Error searching Snippets:', error);
            return [];
        }
    }
}

