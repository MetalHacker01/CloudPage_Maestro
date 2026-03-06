// SnippetManager.js

/**
 * @class SnippetManager
 * @classdesc Manages snippet data, including setting, retrieving, and fetching snippets from the background script.
 */
class SnippetManager {
    constructor() {
        /** @type {Array} - The array of snippets currently managed. */
        this.snippets = [];
    }

    /**
     * Set the internal snippets array and update snippetCount in localStorage.
     * @param {Array} snippets - The array of snippet objects.
     */
    setSnippets(snippets) {
        this.snippets = snippets;
        // Save the number of snippets to localStorage for quick access
        localStorage.setItem('snippetCount', snippets.length);
    }

    /**
     * Retrieve the currently stored snippets.
     * @returns {Array} - The array of snippet objects.
     */
    getSnippets() {
        return this.snippets;
    }

    /**
     * Request snippets from the background script via the content script.
     * If successful, updates the internal snippet array and returns them.
     * @returns {Promise<Array>} - A promise that resolves with the fetched snippets.
     */
    async requestSnippets() {
        return new Promise((resolve, reject) => {
            // Communicate with the background page through the content script
            chrome.runtime.sendMessage({ action: "getSnippets" }, (response) => {
                if (response && response.snippets) {
                    this.setSnippets(response.snippets);
                    resolve(response.snippets);
                } else {
                    if (this.debug) console.log("Failed to fetch snippets from background script.");
                    reject("No snippets received");
                }
            });
        });
    }

    /**
     * Update the usage count of a snippet by sending a request to the content script,
     * which will forward it to the background script and server.
     * @param {string|number} snippetId - The ID of the snippet to update usage for.
     */
    async updateSnippetUsageCount(snippetId) {
        window.postMessage({ action: "updateSnippetUsageCount", snippetId }, "*");
    }

}

export default SnippetManager;
