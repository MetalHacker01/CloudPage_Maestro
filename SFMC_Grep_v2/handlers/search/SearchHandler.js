// handlers/search/SearchHandler.js
import { SearchService } from './SearchService.js';

const debug = false;

/**
 * Handle universal search request
 * @param {Object} request - Contains searchTerm
 * @param {Function} sendResponse - Response callback
 */
export async function handleUniversalSearch(request, sendResponse) {
    const { searchTerm } = request;
    
    if (!searchTerm || searchTerm.trim().length === 0) {
        sendResponse({ success: true, total: 0, results: [] });
        return;
    }

    try {
        // Collect all results
        const searchResults = await SearchService.searchAll(searchTerm);
        sendResponse({ 
            success: true, 
            total: searchResults.total, 
            results: searchResults.results 
        });
    } catch (error) {
        if (debug) console.error('Error in universal search:', error);
        sendResponse({ 
            success: false, 
            error: error.message || 'Search failed',
            total: 0,
            results: []
        });
    }
}

/**
 * Handle universal search with streaming (progressive results)
 * @param {Object} request - Contains searchTerm
 * @param {Port} port - Port for streaming results
 */
export async function handleUniversalSearchStream(request, port) {
    const { searchTerm } = request;
    
    if (!searchTerm || searchTerm.trim().length === 0) {
        port.postMessage({ type: 'searchComplete', total: 0 });
        return;
    }

    try {
        let totalFound = 0;

        const onHint = (hint) => {
            port.postMessage({ type: 'searchHint', hint });
        };

        // Use callback to send results as they're found
        await SearchService.searchAll(searchTerm, (result) => {
            totalFound++;
            port.postMessage({
                type: 'searchResult',
                result: result,
                total: totalFound
            });
        }, onHint);

        // Send completion message
        port.postMessage({
            type: 'searchComplete',
            total: totalFound
        });
    } catch (error) {
        if (debug) console.error('Error in universal search stream:', error);
        port.postMessage({
            type: 'searchError',
            error: error.message || 'Search failed'
        });
    }
}

