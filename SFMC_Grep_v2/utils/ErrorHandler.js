// utils/ErrorHandler.js
// Centralized error handling

import { NotificationService } from './NotificationService.js';

export class ErrorHandler {
    /**
     * Handle API errors
     * @param {Error|Response} error - Error object or Response object
     * @param {Object} options - Options for error handling
     * @returns {Promise<string>} Error message
     */
    static async handleError(error, options = {}) {
        const {
            showNotification = true,
            logError = true,
            defaultMessage = 'An error occurred. Please try again.'
        } = options;
        
        let errorMessage = defaultMessage;
        
        // Handle Response objects
        if (error instanceof Response) {
            try {
                const errorData = await error.json();
                errorMessage = errorData.message || errorData.error || `HTTP ${error.status}: ${error.statusText}`;
                
                // Handle specific status codes
                if (error.status === 401) {
                    errorMessage = 'Authentication failed. Please login again.';
                } else if (error.status === 403) {
                    errorMessage = 'Access denied. You do not have permission to perform this action.';
                } else if (error.status === 404) {
                    errorMessage = 'Resource not found.';
                } else if (error.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please try again later.';
                } else if (error.status >= 500) {
                    errorMessage = 'Server error. Please try again later.';
                }
            } catch (e) {
                errorMessage = `HTTP ${error.status}: ${error.statusText}`;
            }
        }
        // Handle Error objects
        else if (error instanceof Error) {
            errorMessage = error.message || defaultMessage;
        }
        // Handle string errors
        else if (typeof error === 'string') {
            errorMessage = error;
        }
        
        // Log error if enabled
        if (logError) {
            console.error('Error handled:', errorMessage, error);
        }
        
        // Show notification if enabled
        if (showNotification) {
            await NotificationService.error(errorMessage);
        }
        
        return errorMessage;
    }
    
    /**
     * Handle API response and extract error if needed
     * @param {Response} response - Fetch response
     * @returns {Promise<Object>} Parsed response data or throws error
     */
    static async handleResponse(response) {
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
            }
            
            const error = new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = errorData;
            throw error;
        }
        
        try {
            return await response.json();
        } catch (e) {
            // If response is not JSON, return text
            return { text: await response.text() };
        }
    }
    
    /**
     * Wrap async function with error handling
     * @param {Function} fn - Async function to wrap
     * @param {Object} options - Error handling options
     * @returns {Function} Wrapped function
     */
    static wrapAsync(fn, options = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                return await this.handleError(error, options);
            }
        };
    }
}

