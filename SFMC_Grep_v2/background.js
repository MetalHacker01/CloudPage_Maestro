// background.js — SFMC Grep v2
// Copyright (c) 2026 Aldorino Rrushi

import { handleFetchDEUsageQueries, handleFetchDEUsageAutomations, handleFetchDEUsageJourneys, handleFetchJourneyEventDefinition, handleFetchFieldDefinitions, handleUpdateFieldDefinitions, handleCreateFieldDefinitions } from './handlers/de/index.js';
import { handleFetchAutomationDetails, handleFetchAutomationSteps, handleFetchAutomationDefinition, handleFetchActivityCode } from './handlers/automation/index.js';
import { handleGetSnippets, handleUpdateSnippetUsageCount } from './handlers/snippet/index.js';
import { handleUniversalSearch, handleUniversalSearchStream } from './handlers/search/index.js';
import { handleCheckAsyncStatus } from './handlers/async/index.js';
import { handleRegisterContentScript, getRegisteredTabs } from './handlers/registration/index.js';
import { handleDESearch, handleCreateDE, handleGenerateTestData, handleExportDE, handleImportDE, handleGenerateReport, handleFetchFolderChildren } from './handlers/quickactions/index.js';

// ============================================================
//  TOKEN INTERCEPTION (CPM-style webRequest capture)
// ============================================================
// Captures x-csrf-token from outgoing SFMC requests and stores
// in chrome.storage.local. No login form needed — tokens come
// from the active SFMC browser session.

chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
        if (!details.requestHeaders) return;
        const tokenHeader = details.requestHeaders.find(
            h => h.name.toLowerCase() === 'x-csrf-token'
        );
        if (!tokenHeader || !tokenHeader.value || tokenHeader.value.length < 20) return;

        const url = details.url;
        const token = tokenHeader.value;

        // Determine token type by URL
        const isContentBuilder = url.includes('content-builder') || url.includes('asset/v1');
        const storageKey = isContentBuilder ? 'sgv2_pageHookToken' : 'sgv2_appcoreToken';

        chrome.storage.local.set({ [storageKey]: token, [storageKey + '_ts']: Date.now() });
    },
    {
        urls: [
            'https://*.marketingcloudapps.com/*',
            'https://*.exacttarget.com/*'
        ]
    },
    ['requestHeaders']
);

// ============================================================
//  CORS PROXY — makes credentialed SFMC API requests
// ============================================================
async function makeAPIRequest(url, method, headers, body) {
    const opts = {
        method: method || 'GET',
        headers: headers || {},
        credentials: 'include'
    };
    if (body && method !== 'GET') opts.body = typeof body === 'string' ? body : JSON.stringify(body);

    try {
        const res = await fetch(url, opts);
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) { data = text; }
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        return { ok: false, status: 0, error: err.message };
    }
}

// ============================================================
//  MESSAGE HUB
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, type } = request;
    const key = action || type;
    if (!key) return;

    // --- Token messages ---
    if (key === 'GET_TOKENS') {
        chrome.storage.local.get(['sgv2_pageHookToken', 'sgv2_appcoreToken'], (result) => {
            sendResponse({
                success: true,
                tokens: {
                    pageHookToken: result.sgv2_pageHookToken || null,
                    appcoreToken: result.sgv2_appcoreToken || null
                }
            });
        });
        return true;
    }

    if (key === 'TOKEN_CAPTURED') {
        const storageKey = request.tokenType === 'pageHook' ? 'sgv2_pageHookToken' : 'sgv2_appcoreToken';
        chrome.storage.local.set({ [storageKey]: request.token, [storageKey + '_ts']: Date.now() });
        sendResponse({ success: true });
        return true;
    }

    if (key === 'CLEAR_TOKENS') {
        chrome.storage.local.remove(['sgv2_pageHookToken', 'sgv2_appcoreToken',
            'sgv2_pageHookToken_ts', 'sgv2_appcoreToken_ts'], () => {
            sendResponse({ success: true });
        });
        return true;
    }

    // --- CORS proxy ---
    if (key === 'MAKE_REQUEST') {
        makeAPIRequest(request.url, request.method, request.headers, request.body)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    // --- Snippet handlers ---
    if (key === 'getSnippets') {
        handleGetSnippets(request, sendResponse);
        return true;
    }
    if (key === 'updateSnippetUsageCount') {
        handleUpdateSnippetUsageCount(request, sendResponse);
        return true;
    }

    // --- Registration ---
    if (key === 'registerContentScript') {
        handleRegisterContentScript(request, sender, sendResponse);
        return true;
    }

    // --- DE usage handlers ---
    if (key === 'fetchDEUsageQueries') {
        handleFetchDEUsageQueries(request, sendResponse);
        return true;
    }
    if (key === 'fetchDEUsageAutomations') {
        handleFetchDEUsageAutomations(request, sendResponse);
        return true;
    }
    if (key === 'fetchDEUsageJourneys') {
        handleFetchDEUsageJourneys(request, sendResponse);
        return true;
    }
    if (key === 'fetchJourneyEventDefinition') {
        handleFetchJourneyEventDefinition(request, sendResponse);
        return true;
    }
    if (key === 'fetchFieldDefinitions') {
        handleFetchFieldDefinitions(request, sendResponse);
        return true;
    }
    if (key === 'updateFieldDefinitions') {
        handleUpdateFieldDefinitions(request, sendResponse);
        return true;
    }
    if (key === 'createFieldDefinitions') {
        handleCreateFieldDefinitions(request, sendResponse);
        return true;
    }
    if (key === 'checkAsyncStatus') {
        handleCheckAsyncStatus(request, sendResponse);
        return true;
    }

    // --- Automation handlers ---
    if (key === 'fetchAutomationDetails') {
        handleFetchAutomationDetails(request, sendResponse);
        return true;
    }
    if (key === 'fetchAutomationSteps') {
        handleFetchAutomationSteps(request, sendResponse);
        return true;
    }
    if (key === 'fetchAutomationDefinition') {
        handleFetchAutomationDefinition(request, sendResponse);
        return true;
    }
    if (key === 'fetchActivityCode') {
        handleFetchActivityCode(request, sendResponse);
        return true;
    }

    // --- Universal search ---
    if (key === 'universalSearch') {
        handleUniversalSearch(request, sendResponse);
        return true;
    }

    // --- DE quick actions ---
    if (key === 'deSearch') {
        handleDESearch(request, sendResponse).catch(err =>
            sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (key === 'createDE') {
        handleCreateDE(request, sendResponse).catch(err =>
            sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (key === 'generateTestData') {
        handleGenerateTestData(request, sendResponse).catch(err =>
            sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (key === 'exportDE') {
        handleExportDE(request, sendResponse).catch(err =>
            sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (key === 'importDE') {
        handleImportDE(request, sendResponse).catch(err =>
            sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (key === 'generateReport') {
        handleGenerateReport(request, sendResponse).catch(err =>
            sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (key === 'fetchFolderChildren') {
        handleFetchFolderChildren(request, sendResponse).catch(err =>
            sendResponse({ success: false, error: err.message }));
        return true;
    }
});

// Streaming search via port
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'universalSearchStream') {
        port.onMessage.addListener((request) => {
            if (request.action === 'universalSearchStream') {
                handleUniversalSearchStream(request, port);
            }
        });
    }
});

// Cleanup registered tabs on close
chrome.runtime.onInstalled.addListener(() => {});
chrome.tabs.onRemoved.addListener((tabId) => {
    const registeredTabs = getRegisteredTabs();
    if (registeredTabs) registeredTabs.delete(tabId);
});
