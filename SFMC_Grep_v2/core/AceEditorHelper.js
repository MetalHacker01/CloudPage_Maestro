// core/AceEditorHelper.js

/**
 * @class AceEditorHelper
 * @classdesc Helps detect, initialize, and interact with an Ace Editor instance on the page.
 */
class AceEditorHelper {
    constructor() {
        /** @type {Object|null} - The Ace editor instance once found. */
        this.aceInstance = null;
        /** @type {Function[]} - Callbacks to run once the Ace editor is ready. */
        this.onReadyCallbacks = [];

        this.waitForAceEditor();
    }

    /**
     * Attempt to locate the Ace Editor instance in the DOM.
     * @returns {Object|null} The Ace editor instance if found, otherwise null.
     */
    findAceEditor() {
        const aceEditorElement = document.querySelector('.ace_editor');
        if (aceEditorElement && aceEditorElement.env && aceEditorElement.env.editor) {
            return aceEditorElement.env.editor;
        }
        return null;
    }

    /**
     * Wait for the Ace Editor to initialize. If not immediately available,
     * observe the DOM and wait until it appears.
     */
    waitForAceEditor() {
        const ace = this.findAceEditor();
        if (ace) {
            this.aceInstance = ace;
            this.onAceEditorReady(ace);
        } else {
            const observer = new MutationObserver(() => {
                const ace = this.findAceEditor();
                if (ace) {
                    observer.disconnect();
                    this.aceInstance = ace;
                    this.onAceEditorReady(ace);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    /**
     * Run registered callbacks once the Ace Editor is ready and set up listeners.
     * @param {Object} aceInstance - The Ace editor instance.
     */
    onAceEditorReady(aceInstance) {
        this.setupListeners(aceInstance);
        this.onReadyCallbacks.forEach(callback => callback(aceInstance));
    }

    /**
     * Register a callback to be executed when the Ace Editor is ready.
     * @param {Function} callback - The function to call when Ace is ready.
     */
    onReady(callback) {
        if (this.aceInstance) {
            callback(this.aceInstance);
        } else {
            this.onReadyCallbacks.push(callback);
        }
    }

    /**
     * Attach event listeners to the Ace Editor instance to handle changes,
     * key commands, and trigger autocomplete events.
     * @param {Object} editor - The Ace editor instance.
     */
    setupListeners(editor) {
        // Listen for content changes in the editor
        editor.on('change', () => {
            const cursor = editor.getCursorPosition();
            const lineContent = editor.session.getLine(cursor.row);

            // Extract the last word being typed
            let lastWord = lineContent.substring(0, cursor.column + 1).match(/[\S]+$/)?.[0] || '';
            this.triggerAutocomplete(cursor, lastWord, editor);
        });

        // Additional keydown listener for specific keys
        editor.container.addEventListener('keydown', (event) => {
            let customEvent = null;
            const isVisible = this.isDropdownVisible();

            if (event.ctrlKey && event.code === 'Space') {
                // Ctrl+Space always triggers a custom event
                event.preventDefault();
                customEvent = new CustomEvent('AceEditorKeyEvents', {
                    detail: { command: "ctrl+space", args: event.args }
                });
            } else if (event.code === 'Tab') {
                 if (isVisible) {
                    // Tab selects suggestion if dropdown is visible
                    event.preventDefault();
                    customEvent = new CustomEvent('AceEditorKeyEvents', {
                        detail: { command: "tab", args: event.args }
                    });
                 }
                 // If dropdown not visible, Tab performs default action (indent/focus change)
            } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
                // Handle up/down arrows only when dropdown is visible
                if (isVisible) {
                    event.preventDefault();
                    event.stopPropagation();
                    customEvent = new CustomEvent('AceEditorKeyEvents', {
                        detail: { command: event.code === 'ArrowUp' ? 'golineup' : 'golinedown', args: event.args }
                    });
                }
                // If dropdown not visible, let normal editor behavior work (move cursor up/down)
            }

            if (customEvent) {
                window.dispatchEvent(customEvent);
            }
        }, true); // Use capture phase to potentially override Ace's own handlers if needed
    }

    /**
     * Trigger the autocomplete process by dispatching a custom event with the current context.
     * @param {Object} cursor - The current cursor position in Ace Editor.
     * @param {string} lastWord - The last typed word before cursor.
     * @param {Object} editor - The Ace editor instance.
     */
    triggerAutocomplete(cursor, lastWord, editor) {
        const event = new CustomEvent('AceEditorAutocomplete', {
            detail: { lastWord, cursor }
        });
        window.dispatchEvent(event);
    }

    /**
     * Check if the autocomplete dropdown is currently visible.
     * @returns {boolean} True if visible, false otherwise.
     */
    isDropdownVisible() {
        const dropdown = document.getElementById('autocomplete-dropdown');
        return dropdown && 
               dropdown.style.display === 'block' &&
               !dropdown.classList.contains('hidden');
    }

    /**
     * Extract additional snippets from the Object Explorer tables.
     * @returns {Array} An array of snippet objects found in the object explorer.
     */
    getSnippetFromObjectExplorer = () => {
        const dataArray = [];

        document.querySelectorAll('article.oe-table-card').forEach((table) => {
            const tableName = table.querySelector('h3.slds-card__header-title')?.innerText.trim();
            if (tableName) {
                dataArray.push({ trigger: tableName, type: 'SQL', content: tableName});
                table.querySelectorAll('li.oe-field').forEach((fieldElement) => {
                    const fieldTitle = fieldElement.getAttribute('title').trim();
                    const fieldName = fieldTitle.split(' - ')[0].trim();
                    dataArray.push({ trigger: fieldName, type: 'SQL', content: fieldName });
                });
            }
        });
        return dataArray;
    }
}

export default AceEditorHelper;
