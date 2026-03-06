// utils/NotificationService.js
// Unified notification system

export class NotificationService {
    /**
     * Display a notification using SweetAlert
     * @param {string} message - The message to display
     * @param {string} type - Notification type ('success', 'error', 'warning', 'info')
     * @param {number} timer - Duration in milliseconds (0 = no auto-close)
     * @returns {Promise} SweetAlert result
     */
    static notify(message, type = 'info', timer = 2000) {
        // Check if SweetAlert2 is available
        if (typeof Swal === 'undefined') {
            // Fallback to console if SweetAlert is not available
            console.log(`[${type.toUpperCase()}] ${message}`);
            return Promise.resolve();
        }
        
        const config = {
            icon: type,
            title: message,
            showConfirmButton: timer === 0,
            timer: timer > 0 ? timer : undefined
        };
        
        return Swal.fire(config);
    }
    
    /**
     * Show success notification
     * @param {string} message - Success message
     * @param {number} timer - Duration in milliseconds
     * @returns {Promise}
     */
    static success(message, timer = 2000) {
        return this.notify(message, 'success', timer);
    }
    
    /**
     * Show error notification
     * @param {string} message - Error message
     * @param {number} timer - Duration in milliseconds
     * @returns {Promise}
     */
    static error(message, timer = 4000) {
        return this.notify(message, 'error', timer);
    }
    
    /**
     * Show warning notification
     * @param {string} message - Warning message
     * @param {number} timer - Duration in milliseconds
     * @returns {Promise}
     */
    static warning(message, timer = 3000) {
        return this.notify(message, 'warning', timer);
    }
    
    /**
     * Show info notification
     * @param {string} message - Info message
     * @param {number} timer - Duration in milliseconds
     * @returns {Promise}
     */
    static info(message, timer = 2000) {
        return this.notify(message, 'info', timer);
    }
    
    /**
     * Show loading notification
     * @param {string} message - Loading message
     * @returns {Promise}
     */
    static loading(message = 'Loading...') {
        if (typeof Swal === 'undefined') {
            console.log(`[LOADING] ${message}`);
            return Promise.resolve();
        }
        
        return Swal.fire({
            title: message,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    }
    
    /**
     * Close current notification
     */
    static close() {
        if (typeof Swal !== 'undefined') {
            Swal.close();
        }
    }
}

