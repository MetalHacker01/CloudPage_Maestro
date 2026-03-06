// injected_script.js — SFMC Grep v2
// Runs in page context (not extension context).
// Handles Ace editor integration and snippet deployment.

import SnippetManager from './core/SnippetManager.js';
import AceEditorHelper from './core/AceEditorHelper.js';

(function() {
    const debug = false;

    const snippetManager = new SnippetManager();
    const aceEditorHelper = new AceEditorHelper();

    // Request snippets on load
    window.postMessage({ action: 'requestSnippets' }, '*');

    // Listen for messages from content script / panel
    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        const { action, snippets, snippet } = event.data;

        switch (action) {
            case 'setSnippets':
                if (Array.isArray(snippets)) snippetManager.setSnippets(snippets);
                break;
            case 'insertSnippet':
                if (snippet) aceEditorHelper.insertCode(snippet);
                break;
            default:
                break;
        }
    });

})();
