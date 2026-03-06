// content.js — SFMC Grep v2
// Copyright (c) 2026 Aldorino Rrushi
// Injected side panel for SFMC — session-based auth, no login form required.

(function() {
'use strict';

if (window.__SGV2_LOADED__) return;
window.__SGV2_LOADED__ = true;

// ============================================================
//  CONFIG
// ============================================================
const SGV2 = {
    PANEL_WIDTH_DEFAULT: 660,
    PANEL_WIDTH_MIN: 440,
    PANEL_WIDTH_MAX: 1100,
    CACHE_TTL_MS: 5 * 60 * 1000,
    TOKEN_POLL_MS: 1500,
    TOKEN_TIMEOUT_MS: 22000,
    DEBUG: false
};
const dbg = (...a) => SGV2.DEBUG && console.log('[SGv2]', ...a);

// ============================================================
//  STACK / INSTANCE
// ============================================================
function getStack() {
    const m = window.location.hostname.match(/\.(s\d+)\.|^mc\.(s\d+)\./);
    return m ? (m[1] || m[2]) : null;
}
const stack = getStack();

function getInstance() {
    const h = window.location.hostname;
    const m1 = h.match(/^mc\.(s\d+)\.exacttarget/);
    if (m1) return 'mc.' + m1[1];
    const m2 = h.match(/^([\w-]+)\.marketingcloudapps/);
    if (m2) return m2[1];
    return stack ? 'mc.' + stack : null;
}
const instance = getInstance();

// ============================================================
//  ICONS (Iconoir SVG)
// ============================================================
const I = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20L17 17"/></svg>',
    automation: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 17.5V14M14 17.5H17.5"/></svg>',
    database: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19C3 20.6569 7.02944 22 12 22C16.9706 22 21 20.6569 21 19V5"/><path d="M3 12C3 13.6569 7.02944 15 12 15C16.9706 15 21 13.6569 21 12"/></svg>',
    snippets: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6L10 18.5"/><path d="M6.5 8.5L3 12L6.5 15.5"/><path d="M17.5 8.5L21 12L17.5 15.5"/></svg>',
    refresh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.168 8A10.003 10.003 0 0012 2C6.477 2 2 6.477 2 12s4.477 10 10 10c4.478 0 8.268-2.943 9.542-7"/><path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.758 17.243L12.001 12M17.244 6.757L12.001 12M12.001 12L6.758 6.757M12.001 12L17.244 17.243"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 11V17"/><path d="M12 7.01L12.01 6.9989"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6L9 12L15 18"/></svg>',
    download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20H18"/><path d="M12 4V16M12 16L15.5 12.5M12 16L8.5 12.5"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 20H9.6C9.26863 20 9 19.7314 9 19.4V9.6C9 9.26863 9.26863 9 9.6 9H19.4C19.7314 9 20 9.26863 20 9.6V19.4C20 19.7314 19.7314 20 19.4 20Z"/><path d="M15 9V4.6C15 4.26863 14.7314 4 14.4 4H4.6C4.26863 4 4 4.26863 4 4.6V14.4C4 14.7314 4.26863 15 4.6 15H9"/></svg>',
    chevDown: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9L12 15L18 9"/></svg>',
    chevRight: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6L15 12L9 18"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3L20 12L6 21V3Z"/></svg>',
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5V19M5 12H19"/></svg>',
    upload: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13V22"/><path d="M9 16L12 13L15 16"/><path d="M20 17.607C21.262 16.534 22 14.938 22 13.173C22 9.826 19.379 7.102 16.098 7.102C15.756 7.102 15.419 7.13 15.09 7.185C14.097 4.712 11.739 3 9 3C5.134 3 2 6.177 2 10.098C2 12.002 2.756 13.735 4 14.985"/></svg>',
    report: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18H5C3.89543 18 3 17.1046 3 16V5C3 3.89543 3.89543 3 5 3H15C16.1046 3 17 3.89543 17 5V8"/><path d="M8 21H20C21.1046 21 22 20.1046 22 19V11C22 9.89543 21.1046 9 20 9H8C6.89543 9 6 9.89543 6 11V19C6 20.1046 6.89543 21 8 21Z"/><path d="M10 14H18M10 17H15"/></svg>',
    spinner: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sgv2-spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13L9 17L19 7"/></svg>'
};

// ============================================================
//  STATE
// ============================================================
const S = {
    open: false,
    tab: 'search',         // search | automations | de | snippets
    pageHookToken: null,
    appcoreToken: null,
    // Search
    searchQuery: '',
    searchFilter: 'all',   // all | de | automation | journey | email | asset
    searchResults: [],
    searchLoading: false,
    // Automations
    autoDetail: null,
    autoDetailLoading: false,
    // DE Tools
    deSubTab: 'search',    // search | create | export | import | report
    deResults: [],
    deLoading: false,
    deCreateFields: [],
    // Snippets
    snippets: [],
    snippetsLoading: false
};

// ============================================================
//  CSS
// ============================================================
function injectStyles() {
    if (document.getElementById('sgv2-styles')) return;
    const style = document.createElement('style');
    style.id = 'sgv2-styles';
    style.textContent = `
/* ---- Reset ---- */
#sgv2-panel *, #sgv2-toggle *, #sgv2-about-overlay * {
    box-sizing: border-box; margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Salesforce Sans', sans-serif;
}

/* ---- Spinner animation ---- */
@keyframes sgv2-spin { to { transform: rotate(360deg); } }
.sgv2-spin { animation: sgv2-spin 0.9s linear infinite; display: inline-block; }

/* ---- Toggle Button (C3 Typeset) ---- */
#sgv2-toggle {
    position: fixed; top: 50%; right: 0;
    transform: translateY(-50%);
    width: 40px; padding: 24px 0;
    background: #ffffff;
    border: 1px solid #dde1ea; border-right: none;
    border-radius: 8px 0 0 8px;
    cursor: pointer; z-index: 999998;
    box-shadow: -4px 2px 18px rgba(0,0,0,0.1);
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    transition: all 0.3s cubic-bezier(0.4,0,0.2,1); overflow: hidden;
}
#sgv2-toggle::before {
    content: ''; position: absolute;
    top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, #0176d3, #0d9dda);
}
#sgv2-toggle:hover { width: 50px; background: #f0f7ff; box-shadow: -6px 3px 26px rgba(1,118,211,0.2); }
.sgv2-toggle-word {
    writing-mode: vertical-rl; transform: rotate(180deg);
    font-family: Georgia, serif; font-style: italic; font-size: 12px;
    color: #1c2b4a; letter-spacing: 1px;
    transition: color 0.2s, letter-spacing 0.2s;
}
.sgv2-toggle-sub {
    writing-mode: vertical-rl; transform: rotate(180deg);
    font-size: 7px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #9ba8bc; transition: color 0.2s;
}
#sgv2-toggle:hover .sgv2-toggle-word { color: #0176d3; letter-spacing: 1.5px; }
#sgv2-toggle:hover .sgv2-toggle-sub { color: #5b7fa6; }

/* ---- Panel ---- */
#sgv2-panel {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 660px; max-width: 95vw;
    background: #f8fafc;
    border-left: 1px solid #dde1ea;
    box-shadow: -8px 0 40px rgba(0,0,0,0.12);
    z-index: 999999;
    display: flex; flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
    overflow: hidden;
}
#sgv2-panel.sgv2-open { transform: translateX(0); }

/* ---- Drag resize handle ---- */
#sgv2-resize-handle {
    position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
    cursor: ew-resize; z-index: 1; background: transparent;
}
#sgv2-resize-handle:hover { background: rgba(1,118,211,0.15); }

/* ---- Header ---- */
.sgv2-header {
    background: #0176d3; color: #fff;
    padding: 0 20px; height: 54px;
    display: flex; align-items: center;
    justify-content: space-between; flex-shrink: 0;
    gap: 12px;
}
.sgv2-header-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.sgv2-logo-text { font-size: 16px; font-weight: 700; letter-spacing: 0.2px; }
.sgv2-logo-badge {
    font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    background: rgba(255,255,255,0.2); color: rgba(255,255,255,0.9);
    padding: 2px 6px; border-radius: 10px;
}

/* ---- Tab nav ---- */
.sgv2-tabs {
    display: flex; gap: 2px; flex: 1; justify-content: center;
}
.sgv2-tab {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 5px; cursor: pointer; border: none;
    background: transparent; color: rgba(255,255,255,0.75);
    font-size: 12px; font-weight: 500; transition: all 0.15s; white-space: nowrap;
}
.sgv2-tab:hover { background: rgba(255,255,255,0.15); color: #fff; }
.sgv2-tab.active { background: rgba(255,255,255,0.2); color: #fff; font-weight: 600; }
.sgv2-tab svg { flex-shrink: 0; }

/* ---- Header action buttons ---- */
.sgv2-header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.sgv2-hbtn {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 10px; border-radius: 5px; cursor: pointer; border: none;
    background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9);
    font-size: 12px; transition: all 0.15s; white-space: nowrap;
}
.sgv2-hbtn:hover { background: rgba(255,255,255,0.22); color: #fff; }

/* ---- Token bar ---- */
.sgv2-token-bar {
    background: #fff; border-bottom: 1px solid #e2e8f0;
    padding: 6px 20px; display: flex; align-items: center; gap: 10px;
    flex-shrink: 0;
}
.sgv2-token-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 12px; font-size: 11px; font-weight: 500;
    border: 1px solid;
}
.sgv2-token-badge.ok { color: #04844b; border-color: #c2e0cb; background: #f3fdf5; }
.sgv2-token-badge.missing { color: #c23934; border-color: #f5c6c5; background: #fdf3f3; }
.sgv2-token-badge.loading { color: #706e6b; border-color: #e2e8f0; background: #f8f9fa; }
.sgv2-token-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.sgv2-stack-label { margin-left: auto; font-size: 11px; color: #706e6b; }

/* ---- Content area ---- */
.sgv2-content {
    flex: 1; overflow-y: auto; padding: 20px;
}
.sgv2-content::-webkit-scrollbar { width: 6px; }
.sgv2-content::-webkit-scrollbar-track { background: transparent; }
.sgv2-content::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }

/* ---- Search input ---- */
.sgv2-search-wrap {
    position: relative; margin-bottom: 14px;
}
.sgv2-search-input {
    width: 100%; padding: 10px 14px 10px 38px;
    border: 1.5px solid #dde1ea; border-radius: 8px;
    background: #fff; font-size: 14px; color: #1c2b4a;
    outline: none; transition: border-color 0.15s;
}
.sgv2-search-input:focus { border-color: #0176d3; box-shadow: 0 0 0 3px rgba(1,118,211,0.1); }
.sgv2-search-icon {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
    color: #9ba8bc; pointer-events: none;
}

/* ---- Filter chips ---- */
.sgv2-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.sgv2-chip {
    padding: 4px 12px; border-radius: 14px; font-size: 12px; font-weight: 500;
    border: 1px solid #dde1ea; background: #fff; color: #3e3e3c; cursor: pointer;
    transition: all 0.15s;
}
.sgv2-chip:hover { border-color: #0176d3; color: #0176d3; background: #f0f7ff; }
.sgv2-chip.active { background: #0176d3; color: #fff; border-color: #0176d3; }

/* ---- Result cards ---- */
.sgv2-results { display: flex; flex-direction: column; gap: 8px; }
.sgv2-result-card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 12px 16px; cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
    display: flex; align-items: flex-start; gap: 12px;
}
.sgv2-result-card:hover { border-color: #0176d3; box-shadow: 0 2px 8px rgba(1,118,211,0.1); }
.sgv2-result-body { flex: 1; min-width: 0; }
.sgv2-result-name { font-size: 13px; font-weight: 600; color: #1c2b4a; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sgv2-result-meta { font-size: 11px; color: #706e6b; display: flex; gap: 10px; flex-wrap: wrap; }

/* ---- Type badges ---- */
.sgv2-type-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
    white-space: nowrap; flex-shrink: 0;
}
.sgv2-type-de       { background: #eaf4ff; color: #0176d3; }
.sgv2-type-automation { background: #fdf3f3; color: #c23934; }
.sgv2-type-journey  { background: #f3fdf5; color: #04844b; }
.sgv2-type-email    { background: #fff8ee; color: #c87c00; }
.sgv2-type-asset    { background: #f5f0ff; color: #6b40c4; }
.sgv2-type-snippet  { background: #f0f7ff; color: #0176d3; }
.sgv2-type-query    { background: #eaf4ff; color: #0067b8; }
.sgv2-type-script   { background: #fff8ee; color: #c87c00; }
.sgv2-type-other    { background: #f5f5f5; color: #706e6b; }

/* ---- Section title ---- */
.sgv2-section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: #706e6b; margin-bottom: 10px;
}

/* ---- Automation detail ---- */
.sgv2-detail-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
}
.sgv2-back-btn {
    display: flex; align-items: center; gap: 6px; padding: 6px 12px;
    background: none; border: 1px solid #dde1ea; border-radius: 6px;
    color: #0176d3; font-size: 12px; cursor: pointer; transition: all 0.15s;
}
.sgv2-back-btn:hover { background: #f0f7ff; border-color: #0176d3; }

.sgv2-overview-card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 16px 20px; margin-bottom: 14px;
}
.sgv2-overview-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-top: 10px;
}
.sgv2-overview-item label {
    display: block; font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.6px; color: #9ba8bc; margin-bottom: 2px;
}
.sgv2-overview-item span { font-size: 12px; color: #1c2b4a; }

/* ---- Steps accordion ---- */
.sgv2-steps { display: flex; flex-direction: column; gap: 6px; }
.sgv2-step {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
}
.sgv2-step-header {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    cursor: pointer; user-select: none;
    transition: background 0.15s;
}
.sgv2-step-header:hover { background: #f8fafc; }
.sgv2-step-num {
    width: 22px; height: 22px; border-radius: 50%;
    background: #0176d3; color: #fff; font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sgv2-step-name { font-size: 13px; font-weight: 600; color: #1c2b4a; flex: 1; }
.sgv2-step-type { font-size: 11px; color: #706e6b; flex-shrink: 0; }
.sgv2-step-chevron { margin-left: auto; color: #9ba8bc; transition: transform 0.2s; flex-shrink: 0; }
.sgv2-step.expanded .sgv2-step-chevron { transform: rotate(90deg); }

.sgv2-step-body {
    display: none; padding: 0 14px 14px; border-top: 1px solid #f1f3f5;
}
.sgv2-step.expanded .sgv2-step-body { display: block; }

.sgv2-code-block {
    background: #0f1117; color: #e2e8f0; border-radius: 6px;
    padding: 12px 14px; font-family: 'Consolas', 'Fira Mono', monospace;
    font-size: 12px; line-height: 1.6; overflow-x: auto; white-space: pre;
    position: relative; margin-top: 8px;
}
.sgv2-code-copy {
    position: absolute; top: 8px; right: 8px;
    background: rgba(255,255,255,0.1); border: none; border-radius: 4px;
    color: rgba(255,255,255,0.7); cursor: pointer; padding: 4px 8px; font-size: 11px;
    display: flex; align-items: center; gap: 4px;
}
.sgv2-code-copy:hover { background: rgba(255,255,255,0.2); color: #fff; }

/* ---- SQL syntax highlighting ---- */
.sgv2-sql-kw { color: #569cd6; font-weight: 600; }
.sgv2-sql-fn { color: #dcdcaa; }
.sgv2-sql-str { color: #ce9178; }

/* ---- DE Tools sub-nav ---- */
.sgv2-subnav {
    display: flex; gap: 2px; padding: 3px; background: #f1f3f5;
    border-radius: 8px; margin-bottom: 16px;
}
.sgv2-subnav-btn {
    flex: 1; padding: 7px 10px; border: none; background: transparent;
    border-radius: 6px; font-size: 12px; font-weight: 500; color: #706e6b;
    cursor: pointer; transition: all 0.15s; display: flex; align-items: center;
    justify-content: center; gap: 5px; white-space: nowrap;
}
.sgv2-subnav-btn:hover { color: #1c2b4a; }
.sgv2-subnav-btn.active { background: #fff; color: #0176d3; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

/* ---- Form elements ---- */
.sgv2-form-row { margin-bottom: 12px; }
.sgv2-form-row label { display: block; font-size: 12px; font-weight: 600; color: #3e3e3c; margin-bottom: 4px; }
.sgv2-input, .sgv2-select, .sgv2-textarea {
    width: 100%; padding: 8px 12px;
    border: 1.5px solid #dde1ea; border-radius: 6px;
    background: #fff; font-size: 13px; color: #1c2b4a;
    outline: none; transition: border-color 0.15s;
}
.sgv2-input:focus, .sgv2-select:focus, .sgv2-textarea:focus {
    border-color: #0176d3; box-shadow: 0 0 0 3px rgba(1,118,211,0.1);
}
.sgv2-textarea { resize: vertical; min-height: 80px; font-family: monospace; font-size: 12px; }

/* ---- Buttons ---- */
.sgv2-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px;
    border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;
    border: 1px solid transparent; transition: all 0.15s;
}
.sgv2-btn-primary { background: #0176d3; color: #fff; border-color: #0176d3; }
.sgv2-btn-primary:hover { background: #0164b3; }
.sgv2-btn-secondary { background: #fff; color: #0176d3; border-color: #dde1ea; }
.sgv2-btn-secondary:hover { background: #f0f7ff; border-color: #0176d3; }
.sgv2-btn-danger { background: #fdf3f3; color: #c23934; border-color: #f5c6c5; }
.sgv2-btn-danger:hover { background: #fbe5e4; }
.sgv2-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---- Card (white box) ---- */
.sgv2-card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 16px; margin-bottom: 12px;
}
.sgv2-card-title { font-size: 13px; font-weight: 700; color: #1c2b4a; margin-bottom: 10px; display: flex; align-items: center; gap: 7px; }

/* ---- Snippet cards ---- */
.sgv2-snippet-card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 8px; transition: border-color 0.15s;
}
.sgv2-snippet-card:hover { border-color: #0176d3; }
.sgv2-snippet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.sgv2-snippet-name { font-size: 13px; font-weight: 600; color: #1c2b4a; }
.sgv2-snippet-lang {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
    padding: 2px 7px; border-radius: 8px; background: #eaf4ff; color: #0176d3;
}
.sgv2-snippet-desc { font-size: 12px; color: #706e6b; margin-bottom: 8px; }

/* ---- Empty state ---- */
.sgv2-empty {
    text-align: center; padding: 40px 20px; color: #9ba8bc;
}
.sgv2-empty-icon { font-size: 32px; margin-bottom: 8px; }
.sgv2-empty p { font-size: 13px; }

/* ---- Spinner state ---- */
.sgv2-loading-state {
    display: flex; align-items: center; justify-content: center;
    gap: 10px; padding: 40px; color: #706e6b; font-size: 13px;
}

/* ---- About overlay ---- */
#sgv2-about-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.45); z-index: 1000001;
    align-items: center; justify-content: center;
}
#sgv2-about-overlay.open { display: flex; }
.sgv2-about-modal {
    background: #fff; border-radius: 12px; width: 340px;
    overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.sgv2-about-header {
    background: #0176d3; padding: 18px 22px;
    display: flex; align-items: center; gap: 10px;
}
.sgv2-about-header-text h2 { color: #fff; font-size: 15px; font-weight: 700; margin-bottom: 2px; }
.sgv2-about-header-text p { color: rgba(255,255,255,0.75); font-size: 12px; }
.sgv2-about-body { padding: 20px 22px 22px; }
.sgv2-about-body p { font-size: 13px; color: #3e3e3c; margin-bottom: 14px; line-height: 1.5; }
.sgv2-about-links { display: flex; flex-direction: column; gap: 8px; }
.sgv2-about-link {
    display: flex; align-items: center; gap: 8px; padding: 9px 14px;
    border-radius: 6px; border: 1px solid #dddbda; color: #0176d3;
    text-decoration: none; font-size: 13px; font-weight: 500;
    transition: background 0.15s, border-color 0.15s;
}
.sgv2-about-link:hover { background: #f3f7fd; border-color: #0176d3; }
.sgv2-about-close {
    display: block; width: 100%; margin-top: 14px; padding: 9px;
    background: none; border: 1px solid #dddbda; border-radius: 6px;
    color: #706e6b; font-size: 13px; cursor: pointer; transition: background 0.15s;
}
.sgv2-about-close:hover { background: #f3f3f3; }

/* ---- Status badge ---- */
.sgv2-status-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
}
.sgv2-status-active, .sgv2-status-running, .sgv2-status-scheduled { background: #f3fdf5; color: #04844b; }
.sgv2-status-error, .sgv2-status-inactive { background: #fdf3f3; color: #c23934; }
.sgv2-status-paused, .sgv2-status-draft { background: #fff8ee; color: #c87c00; }

/* ---- Notification toast ---- */
.sgv2-toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 1000002;
    padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18); display: flex; align-items: center; gap: 8px;
    animation: sgv2-toastIn 0.25s ease;
    max-width: 340px;
}
@keyframes sgv2-toastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.sgv2-toast.success { background: #04844b; color: #fff; }
.sgv2-toast.error   { background: #c23934; color: #fff; }
.sgv2-toast.warning { background: #c87c00; color: #fff; }
.sgv2-toast.info    { background: #1c2b4a; color: #fff; }

/* ---- Field editor table ---- */
.sgv2-field-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
.sgv2-field-table th { background: #f8fafc; padding: 7px 10px; text-align: left; font-weight: 600; color: #706e6b; border-bottom: 1px solid #e2e8f0; }
.sgv2-field-table td { padding: 6px 10px; border-bottom: 1px solid #f1f3f5; color: #1c2b4a; }
.sgv2-field-table tr:last-child td { border-bottom: none; }
.sgv2-field-table tr:hover td { background: #f8fafc; }

/* ---- DE create fields ---- */
.sgv2-field-row {
    display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px;
    align-items: center; margin-bottom: 6px; padding: 8px 10px;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
}
.sgv2-remove-field {
    background: none; border: none; color: #c23934; cursor: pointer;
    padding: 4px; border-radius: 4px; display: flex; align-items: center;
}
.sgv2-remove-field:hover { background: #fdf3f3; }
    `;
    document.head.appendChild(style);
}

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================
function toast(msg, type = 'info', duration = 3500) {
    const t = document.createElement('div');
    t.className = 'sgv2-toast ' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration);
}

// ============================================================
//  TOKEN CAPTURE (CPM pattern)
// ============================================================
function captureTokensFromDOM() {
    const origFetch = window.fetch;
    window.fetch = function(...args) {
        return origFetch.apply(this, args).then(res => {
            const tok = res.headers.get('x-csrf-token') || res.headers.get('X-CSRF-Token');
            if (tok && tok.length > 20) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                const type = url.includes('content-builder') || url.includes('asset/v1') ? 'pageHook' : 'appcore';
                chrome.runtime.sendMessage({ type: 'TOKEN_CAPTURED', tokenType: type, token: tok }).catch(() => {});
            }
            return res;
        });
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.__sgv2_url = url;
        return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (String(header).toLowerCase() === 'x-csrf-token' && value && value.length > 20) {
            const url = this.__sgv2_url || '';
            const type = url.includes('content-builder') || url.includes('asset/v1') ? 'pageHook' : 'appcore';
            chrome.runtime.sendMessage({ type: 'TOKEN_CAPTURED', tokenType: type, token: value }).catch(() => {});
        }
        return origSetHeader.apply(this, arguments);
    };
}

function injectTokenCaptureIframes(onComplete) {
    if (!stack) { if (onComplete) onComplete(null, null); return; }
    document.querySelectorAll('.sgv2-token-iframe').forEach(f => f.remove());
    const urls = [
        'https://mc.' + stack + '.exacttarget.com/cloud/#app/Content%20Builder',
        'https://mc.' + stack + '.exacttarget.com/cloud/#app/CloudPages/'
    ];
    urls.forEach(url => {
        const iframe = document.createElement('iframe');
        iframe.className = 'sgv2-token-iframe';
        iframe.src = url;
        iframe.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:none;top:-9999px;left:-9999px;';
        document.body.appendChild(iframe);
    });
    let elapsed = 0;
    const poll = setInterval(() => {
        elapsed += SGV2.TOKEN_POLL_MS;
        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, res => {
            if (!res || !res.success) return;
            const ph = res.tokens.pageHookToken;
            const ac = res.tokens.appcoreToken;
            if ((ph && ac) || elapsed >= SGV2.TOKEN_TIMEOUT_MS) {
                clearInterval(poll);
                document.querySelectorAll('.sgv2-token-iframe').forEach(f => f.remove());
                S.pageHookToken = ph;
                S.appcoreToken = ac;
                updateTokenBadges();
                if (onComplete) onComplete(ph, ac);
            }
        });
    }, SGV2.TOKEN_POLL_MS);
}

function loadTokens(cb) {
    chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, res => {
        if (res && res.success) {
            S.pageHookToken = res.tokens.pageHookToken;
            S.appcoreToken = res.tokens.appcoreToken;
        }
        updateTokenBadges();
        if (cb) cb();
    });
}

function updateTokenBadges() {
    const ph = document.getElementById('sgv2-badge-ph');
    const ac = document.getElementById('sgv2-badge-ac');
    if (ph) {
        ph.className = 'sgv2-token-badge ' + (S.pageHookToken ? 'ok' : 'missing');
        ph.innerHTML = '<span class="sgv2-token-dot"></span> Search: ' + (S.pageHookToken ? 'Ready' : 'Capturing…');
    }
    if (ac) {
        ac.className = 'sgv2-token-badge ' + (S.appcoreToken ? 'ok' : 'missing');
        ac.innerHTML = '<span class="sgv2-token-dot"></span> Publish: ' + (S.appcoreToken ? 'Ready' : 'Capturing…');
    }
}

// ============================================================
//  API HELPER (via background CORS proxy)
// ============================================================
function sfmcFetch(url, method, extraHeaders, body) {
    const headers = { 'accept': 'application/json', 'content-type': 'application/json', ...extraHeaders };
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'MAKE_REQUEST', url, method: method || 'GET', headers, body: body || null }, res => {
            if (!res) return reject(new Error('No response from background'));
            if (!res.ok) return reject(new Error(res.error || ('HTTP ' + res.status)));
            resolve(res.data);
        });
    });
}

// ============================================================
//  PANEL HTML BUILDER
// ============================================================
function buildPanelHTML() {
    return `
<div id="sgv2-resize-handle"></div>
<div class="sgv2-header">
    <div class="sgv2-header-left">
        <span class="sgv2-logo-text">SFMC Grep</span>
        <span class="sgv2-logo-badge">v2</span>
    </div>
    <div class="sgv2-tabs">
        <button class="sgv2-tab active" data-tab="search">${I.search} Search</button>
        <button class="sgv2-tab" data-tab="automations">${I.automation} Automations</button>
        <button class="sgv2-tab" data-tab="de">${I.database} DE Tools</button>
        <button class="sgv2-tab" data-tab="snippets">${I.snippets} Snippets</button>
    </div>
    <div class="sgv2-header-actions">
        <button class="sgv2-hbtn" id="sgv2-about-btn">${I.info} About</button>
        <button class="sgv2-hbtn" id="sgv2-close-btn">${I.close}</button>
    </div>
</div>
<div class="sgv2-token-bar">
    <span id="sgv2-badge-ph" class="sgv2-token-badge loading"><span class="sgv2-token-dot"></span> Search: Loading…</span>
    <span id="sgv2-badge-ac" class="sgv2-token-badge loading"><span class="sgv2-token-dot"></span> Publish: Loading…</span>
    <button class="sgv2-hbtn" id="sgv2-recapture-btn" style="padding:3px 9px;font-size:11px;background:transparent;border:1px solid #dde1ea;color:#706e6b;border-radius:12px;">${I.refresh} Re-capture</button>
    <span class="sgv2-stack-label">${stack ? 'Stack: ' + stack : 'Stack: unknown'}</span>
</div>
<div class="sgv2-content" id="sgv2-content"></div>`;
}

// ============================================================
//  ABOUT MODAL
// ============================================================
function buildAboutModal() {
    const el = document.createElement('div');
    el.id = 'sgv2-about-overlay';
    el.innerHTML = `
<div class="sgv2-about-modal">
    <div class="sgv2-about-header">
        <div class="sgv2-about-header-text">
            <h2>SFMC Grep</h2>
            <p>v2.0.0 &mdash; SFMC Search &amp; Management Tool</p>
        </div>
    </div>
    <div class="sgv2-about-body">
        <p>Built by <strong>Aldorino Rrushi</strong> &copy; 2026. A unified panel for searching, viewing, and managing Salesforce Marketing Cloud resources.</p>
        <div class="sgv2-about-links">
            <a href="https://www.linkedin.com/in/aldorino-rrushi/" target="_blank" class="sgv2-about-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V16C21 18.7614 18.7614 21 16 21H8C5.23858 21 3 18.7614 3 16V8C3 5.23858 5.23858 3 8 3H16C18.7614 3 21 5.23858 21 8Z"/><path d="M7 17V13.5V10"/><path d="M11 17V13.75M11 10V13.75M11 13.75C11 10 17 10 17 13.75V17"/><path d="M7 7.01L7.01 6.9989"/></svg>
                LinkedIn &mdash; Aldorino Rrushi
            </a>
            <a href="https://martech-maestro-folio-sroh.vercel.app/" target="_blank" class="sgv2-about-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/><path d="M2.5 12.5L8 11L10 14L8 17L9 22"/><path d="M17 21.5L16 17.5L13 16V13L17 12L21.5 13"/><path d="M15 2.5L14 6L10 7V10L14 9L15.5 7L19 8"/></svg>
                Portfolio &mdash; MarTech Maestro
            </a>
            <a href="https://github.com/MetalHacker01" target="_blank" class="sgv2-about-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 22.0268V19.1568C16.0375 18.68 15.9731 18.2006 15.811 17.7506C15.6489 17.3006 15.3929 16.8902 15.06 16.5468C18.2 16.1968 21.5 15.0068 21.5 9.51677C21.4997 8.1 20.9627 6.7383 20 5.71677C20.4558 4.48066 20.4236 3.11337 19.91 1.89677C19.91 1.89677 18.73 1.54677 16 3.48677C13.708 2.88561 11.292 2.88561 9 3.48677C6.27 1.54677 5.09 1.89677 5.09 1.89677C4.57638 3.11338 4.54414 4.48066 5 5.71677C4.03013 6.74544 3.49252 8.11607 3.5 9.54677C3.5 15.0068 6.8 16.1968 9.94 16.5768C9.611 16.9168 9.35726 17.3222 9.19531 17.7667C9.03335 18.2112 8.96681 18.6849 9 19.1568V22.0268"/><path d="M9 20.0267C6 20.9999 3.5 20.0267 2 17.0267"/></svg>
                GitHub &mdash; MetalHacker01
            </a>
        </div>
        <button class="sgv2-about-close" id="sgv2-about-close">Close</button>
    </div>
</div>`;
    return el;
}

// ============================================================
//  VIEW RENDERERS
// ============================================================

// --- SEARCH VIEW ---
function renderSearchView() {
    const cont = document.getElementById('sgv2-content');
    if (!cont) return;
    const chips = [
        { id: 'all', label: 'All' },
        { id: 'de', label: 'Data Extensions' },
        { id: 'automation', label: 'Automations' },
        { id: 'journey', label: 'Journeys' },
        { id: 'email', label: 'Emails' },
        { id: 'asset', label: 'Assets' },
        { id: 'snippet', label: 'Snippets' }
    ];
    cont.innerHTML = `
<div class="sgv2-search-wrap">
    <span class="sgv2-search-icon">${I.search}</span>
    <input class="sgv2-search-input" id="sgv2-search-input"
        placeholder="Search DEs, Automations, Journeys, Emails…"
        value="${escHtml(S.searchQuery)}">
</div>
<div class="sgv2-chips">
    ${chips.map(c => `<button class="sgv2-chip${S.searchFilter === c.id ? ' active' : ''}" data-filter="${c.id}">${c.label}</button>`).join('')}
</div>
<div id="sgv2-search-results">
    ${renderSearchResults()}
</div>`;

    const input = document.getElementById('sgv2-search-input');
    if (input) {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { S.searchQuery = input.value.trim(); runSearch(); }
        });
        input.addEventListener('input', e => { S.searchQuery = e.target.value; });
        // Focus
        setTimeout(() => input.focus && input.focus(), 50);
    }
    cont.querySelectorAll('.sgv2-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            S.searchFilter = btn.dataset.filter;
            cont.querySelectorAll('.sgv2-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (S.searchQuery) runSearch();
        });
    });
}

function renderSearchResults() {
    if (S.searchLoading) return `<div class="sgv2-loading-state">${I.spinner} Searching…</div>`;
    if (!S.searchResults.length && S.searchQuery) {
        return `<div class="sgv2-empty"><div class="sgv2-empty-icon">&#128269;</div><p>No results for "${escHtml(S.searchQuery)}"</p></div>`;
    }
    if (!S.searchResults.length) {
        return `<div class="sgv2-empty"><div class="sgv2-empty-icon">&#128269;</div><p>Enter a search term and press Enter</p></div>`;
    }
    const typeClass = { de: 'sgv2-type-de', automation: 'sgv2-type-automation', journey: 'sgv2-type-journey', email: 'sgv2-type-email', asset: 'sgv2-type-asset', snippet: 'sgv2-type-snippet', query: 'sgv2-type-query', script: 'sgv2-type-script' };
    const typeLabel = { de: 'DE', automation: 'Automation', journey: 'Journey', email: 'Email', asset: 'Asset', snippet: 'Snippet', query: 'Query', script: 'Script' };
    return `<div class="sgv2-results">` +
        S.searchResults.map((r, idx) => {
            const tc = typeClass[r.type] || 'sgv2-type-other';
            const tl = typeLabel[r.type] || r.type || 'Object';
            return `<div class="sgv2-result-card" data-idx="${idx}">
                <div class="sgv2-type-badge ${tc}">${tl}</div>
                <div class="sgv2-result-body">
                    <div class="sgv2-result-name">${escHtml(r.name || r.Name || 'Unnamed')}</div>
                    <div class="sgv2-result-meta">
                        ${r.path ? '<span>' + escHtml(r.path) + '</span>' : ''}
                        ${r.modifiedDate ? '<span>' + formatDate(r.modifiedDate) + '</span>' : ''}
                    </div>
                </div>
            </div>`;
        }).join('') + `</div>`;
}

function runSearch() {
    if (!S.searchQuery) return;
    S.searchLoading = true;
    const resultsDiv = document.getElementById('sgv2-search-results');
    if (resultsDiv) resultsDiv.innerHTML = `<div class="sgv2-loading-state">${I.spinner} Searching…</div>`;

    chrome.runtime.sendMessage({
        action: 'universalSearch',
        searchTerm: S.searchQuery,
        filter: S.searchFilter,
        instance: instance
    }, res => {
        S.searchLoading = false;
        if (res && res.success && res.results) {
            let results = res.results;
            if (S.searchFilter !== 'all') {
                results = results.filter(r => r.type === S.searchFilter);
            }
            S.searchResults = results;
        } else {
            S.searchResults = [];
            if (res && res.error) toast('Search error: ' + res.error, 'error');
        }
        if (resultsDiv) {
            resultsDiv.innerHTML = renderSearchResults();
            bindSearchResultClicks(resultsDiv);
        }
    });
}

function bindSearchResultClicks(container) {
    container.querySelectorAll('.sgv2-result-card').forEach(card => {
        card.addEventListener('click', () => {
            const idx = parseInt(card.dataset.idx, 10);
            const item = S.searchResults[idx];
            if (!item) return;
            if (item.type === 'automation') {
                S.tab = 'automations';
                updateTabUI();
                openAutomationDetail(item.id || item.ID, item.name || item.Name);
            } else {
                toast('Opened: ' + (item.name || item.Name), 'info');
            }
        });
    });
}

// --- AUTOMATIONS VIEW ---
function renderAutomationsView() {
    const cont = document.getElementById('sgv2-content');
    if (!cont) return;
    if (S.autoDetail) {
        renderAutomationDetail(cont);
        return;
    }
    cont.innerHTML = `
<div class="sgv2-search-wrap">
    <span class="sgv2-search-icon">${I.search}</span>
    <input class="sgv2-search-input" id="sgv2-auto-search"
        placeholder="Search automations by name…">
</div>
<div id="sgv2-auto-results">
    <div class="sgv2-empty"><div class="sgv2-empty-icon">&#9881;</div><p>Enter a name to search automations</p></div>
</div>`;

    const inp = document.getElementById('sgv2-auto-search');
    if (inp) inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') searchAutomations(inp.value.trim());
    });
}

function searchAutomations(query) {
    if (!query) return;
    const res = document.getElementById('sgv2-auto-results');
    if (res) res.innerHTML = `<div class="sgv2-loading-state">${I.spinner} Searching automations…</div>`;
    chrome.runtime.sendMessage({
        action: 'universalSearch', searchTerm: query, filter: 'automation', instance: instance
    }, resp => {
        if (!res) return;
        if (resp && resp.success && resp.results && resp.results.length) {
            const autos = resp.results.filter(r => r.type === 'automation');
            res.innerHTML = `<div class="sgv2-results">` +
                autos.map((a, i) => `<div class="sgv2-result-card" data-idx="${i}" data-id="${escHtml(a.id || a.ID || '')}">
                    <div class="sgv2-type-badge sgv2-type-automation">${I.automation} Auto</div>
                    <div class="sgv2-result-body">
                        <div class="sgv2-result-name">${escHtml(a.name || a.Name || 'Unnamed')}</div>
                        <div class="sgv2-result-meta">
                            ${a.path ? '<span>' + escHtml(a.path) + '</span>' : ''}
                            ${a.status ? '<span>' + escHtml(a.status) + '</span>' : ''}
                        </div>
                    </div>
                    <span style="color:#0176d3;font-size:11px;margin-left:auto;padding-left:8px;">View →</span>
                </div>`).join('') + `</div>`;
            res.querySelectorAll('.sgv2-result-card').forEach(card => {
                card.addEventListener('click', () => {
                    const id = card.dataset.id;
                    const name = card.querySelector('.sgv2-result-name')?.textContent || '';
                    openAutomationDetail(id, name);
                });
            });
        } else {
            res.innerHTML = `<div class="sgv2-empty"><p>No automations found for "${escHtml(query)}"</p></div>`;
        }
    });
}

function openAutomationDetail(automationId, name) {
    if (!automationId) { toast('No automation ID found', 'error'); return; }
    S.autoDetail = { id: automationId, name: name || 'Automation', steps: [], loading: true };
    S.autoDetailLoading = true;
    renderCurrentView();

    chrome.runtime.sendMessage({ action: 'fetchAutomationDefinition', automationId, instance }, res => {
        S.autoDetailLoading = false;
        if (!res || !res.success || !res.data) {
            toast('Failed to load automation details', 'error');
            S.autoDetail.loading = false;
            S.autoDetail.error = (res && res.error) || 'Unknown error';
            renderCurrentView();
            return;
        }
        const data = res.data;
        S.autoDetail = {
            id: automationId,
            name: data.name || name,
            status: data.status || '',
            schedule: data.schedule ? JSON.stringify(data.schedule) : null,
            lastRunTime: data.lastRunTime || data.lastRun || null,
            createdDate: data.createdDate || null,
            modifiedDate: data.modifiedDate || null,
            createdBy: data.createdBy || null,
            folderPath: data.categoryPath || data.folderPath || null,
            automationKey: data.key || data.automationKey || null,
            steps: [],
            loading: false
        };

        // Parse steps from definition
        const processes = data.steps || data.automationProcesses || [];
        processes.forEach((proc, pi) => {
            const activities = proc.step?.stepActivities || proc.stepActivities || proc.activities || [];
            activities.forEach((act, ai) => {
                S.autoDetail.steps.push({
                    num: S.autoDetail.steps.length + 1,
                    name: act.name || act.activityName || 'Step ' + (pi + 1) + '.' + (ai + 1),
                    type: mapActivityType(act.objectTypeId || act.activityTypeId),
                    objectTypeId: act.objectTypeId || act.activityTypeId,
                    activityObjectId: act.activityObjectId || act.id || act.objectId || null,
                    code: null,
                    loadingCode: true,
                    expanded: false
                });
            });
        });

        renderCurrentView();

        // Fetch activity codes in background
        S.autoDetail.steps.forEach((step, idx) => {
            if (!step.activityObjectId) {
                step.loadingCode = false;
                return;
            }
            chrome.runtime.sendMessage({
                action: 'fetchActivityCode',
                activityObjectId: step.activityObjectId,
                objectTypeId: step.objectTypeId,
                instance
            }, codeRes => {
                if (codeRes && codeRes.success && codeRes.code) {
                    S.autoDetail.steps[idx].code = codeRes.code;
                }
                S.autoDetail.steps[idx].loadingCode = false;
                // Update just that step's code block if expanded
                const codeBlock = document.getElementById('sgv2-code-' + idx);
                if (codeBlock) {
                    codeBlock.innerHTML = renderCodeContent(S.autoDetail.steps[idx]);
                }
            });
        });
    });
}

function mapActivityType(typeId) {
    const map = {
        42: 'Send Email', 43: 'Import', 300: 'SQL Query', 423: 'Script (SSJS)',
        427: 'Build Audience', 440: 'Data Extract', 457: 'File Transfer',
        771: 'SF Send', 1018: 'Verification', 3014: 'Push Notification'
    };
    return map[typeId] || ('Activity #' + typeId);
}

function renderAutomationDetail(cont) {
    if (!S.autoDetail) return;
    if (S.autoDetail.loading) {
        cont.innerHTML = `<div class="sgv2-detail-header">
            <button class="sgv2-back-btn" id="sgv2-back-auto">${I.back} Automations</button>
            <span style="font-size:13px;color:#706e6b;">${escHtml(S.autoDetail.name)}</span>
        </div>
        <div class="sgv2-loading-state">${I.spinner} Loading automation definition…</div>`;
        cont.querySelector('#sgv2-back-auto').addEventListener('click', () => {
            S.autoDetail = null; renderCurrentView();
        });
        return;
    }

    const d = S.autoDetail;
    const statusClass = statusToClass(d.status);

    cont.innerHTML = `
<div class="sgv2-detail-header">
    <button class="sgv2-back-btn" id="sgv2-back-auto">${I.back} Automations</button>
    <span style="font-size:14px;font-weight:600;color:#1c2b4a;">${escHtml(d.name)}</span>
    ${d.status ? `<span class="sgv2-status-badge ${statusClass}">${escHtml(d.status)}</span>` : ''}
</div>

<div class="sgv2-overview-card">
    <div class="sgv2-section-title">Overview</div>
    <div class="sgv2-overview-grid">
        ${d.lastRunTime ? `<div class="sgv2-overview-item"><label>Last Run</label><span>${formatDate(d.lastRunTime)}</span></div>` : ''}
        ${d.createdDate ? `<div class="sgv2-overview-item"><label>Created</label><span>${formatDate(d.createdDate)}</span></div>` : ''}
        ${d.modifiedDate ? `<div class="sgv2-overview-item"><label>Modified</label><span>${formatDate(d.modifiedDate)}</span></div>` : ''}
        ${d.folderPath ? `<div class="sgv2-overview-item"><label>Folder</label><span>${escHtml(d.folderPath)}</span></div>` : ''}
        ${d.automationKey ? `<div class="sgv2-overview-item"><label>Key</label><span style="font-family:monospace;font-size:11px;">${escHtml(d.automationKey)}</span></div>` : ''}
        <div class="sgv2-overview-item"><label>Steps</label><span>${d.steps.length}</span></div>
    </div>
</div>

${d.steps.length ? `
<div class="sgv2-section-title" style="margin-bottom:8px;">Steps &amp; Activities</div>
<div class="sgv2-steps" id="sgv2-steps-list">
    ${d.steps.map((step, idx) => `
    <div class="sgv2-step" id="sgv2-step-${idx}">
        <div class="sgv2-step-header" data-step="${idx}">
            <span class="sgv2-step-num">${step.num}</span>
            <span class="sgv2-step-name">${escHtml(step.name)}</span>
            <span class="sgv2-step-type">${escHtml(step.type)}</span>
            <span class="sgv2-step-chevron">${I.chevRight}</span>
        </div>
        <div class="sgv2-step-body">
            <div id="sgv2-code-${idx}">${renderCodeContent(step)}</div>
        </div>
    </div>`).join('')}
</div>` : `<div class="sgv2-empty"><p>No steps found in this automation.</p></div>`}`;

    cont.querySelector('#sgv2-back-auto')?.addEventListener('click', () => {
        S.autoDetail = null; renderCurrentView();
    });

    // Step accordion toggle
    cont.querySelectorAll('.sgv2-step-header').forEach(hdr => {
        hdr.addEventListener('click', () => {
            const idx = parseInt(hdr.dataset.step, 10);
            const stepEl = document.getElementById('sgv2-step-' + idx);
            if (!stepEl) return;
            const isExp = stepEl.classList.contains('expanded');
            stepEl.classList.toggle('expanded', !isExp);
            S.autoDetail.steps[idx].expanded = !isExp;
        });
    });

    // Copy buttons (delegated)
    cont.addEventListener('click', e => {
        if (e.target.closest('.sgv2-code-copy')) {
            const btn = e.target.closest('.sgv2-code-copy');
            const block = btn.closest('.sgv2-code-block');
            const code = block?.querySelector('.sgv2-code-text')?.textContent || '';
            navigator.clipboard.writeText(code).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.innerHTML = I.copy + ' Copy'; }, 1500);
            }).catch(() => toast('Copy failed', 'error'));
        }
    });
}

function renderCodeContent(step) {
    if (step.loadingCode) {
        return `<div style="padding:8px 0;color:#9ba8bc;font-size:12px;display:flex;align-items:center;gap:8px;">${I.spinner} Loading code…</div>`;
    }
    if (!step.code) {
        return `<div style="padding:8px 0;color:#9ba8bc;font-size:12px;">No code found for this activity type.</div>`;
    }
    const highlighted = step.objectTypeId === 300
        ? highlightSQL(step.code) : escHtml(step.code);
    return `<div class="sgv2-code-block">
        <button class="sgv2-code-copy">${I.copy} Copy</button>
        <span class="sgv2-code-text" style="display:none;">${escHtml(step.code)}</span>
        <div class="sgv2-code-highlighted">${highlighted}</div>
    </div>`;
}

function highlightSQL(sql) {
    const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|EXISTS|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|INSERT|INTO|UPDATE|SET|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|AS|DISTINCT|UNION|ALL|CASE|WHEN|THEN|ELSE|END|NULL|IS|LIKE|BETWEEN|COUNT|SUM|AVG|MIN|MAX|TOP|WITH|CTE|FULL)\b/gi;
    const strings = /'[^']*'/g;
    return escHtml(sql)
        .replace(strings, m => `<span class="sgv2-sql-str">${m}</span>`)
        .replace(keywords, m => `<span class="sgv2-sql-kw">${m}</span>`);
}

// --- DE TOOLS VIEW ---
function renderDEToolsView() {
    const cont = document.getElementById('sgv2-content');
    if (!cont) return;

    const subTabs = [
        { id: 'search', icon: I.search, label: 'Search' },
        { id: 'create', icon: I.plus, label: 'Create' },
        { id: 'export', icon: I.download, label: 'Export' },
        { id: 'import', icon: I.upload, label: 'Import' },
        { id: 'report', icon: I.report, label: 'Report' }
    ];

    cont.innerHTML = `
<div class="sgv2-subnav">
    ${subTabs.map(t => `<button class="sgv2-subnav-btn${S.deSubTab === t.id ? ' active' : ''}" data-subtab="${t.id}">${t.icon} ${t.label}</button>`).join('')}
</div>
<div id="sgv2-de-body"></div>`;

    cont.querySelectorAll('.sgv2-subnav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            S.deSubTab = btn.dataset.subtab;
            cont.querySelectorAll('.sgv2-subnav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDESubView(document.getElementById('sgv2-de-body'));
        });
    });

    renderDESubView(document.getElementById('sgv2-de-body'));
}

function renderDESubView(container) {
    if (!container) return;
    switch (S.deSubTab) {
        case 'search': renderDESearch(container); break;
        case 'create': renderDECreate(container); break;
        case 'export': renderDEExport(container); break;
        case 'import': renderDEImport(container); break;
        case 'report': renderDEReport(container); break;
    }
}

function renderDESearch(container) {
    container.innerHTML = `
<div class="sgv2-search-wrap">
    <span class="sgv2-search-icon">${I.search}</span>
    <input class="sgv2-search-input" id="sgv2-de-search-input" placeholder="Search Data Extensions by name…">
</div>
<div id="sgv2-de-search-results">
    <div class="sgv2-empty"><p>Enter a name and press Enter to search</p></div>
</div>`;
    document.getElementById('sgv2-de-search-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const q = e.target.value.trim();
            if (!q) return;
            const res = document.getElementById('sgv2-de-search-results');
            res.innerHTML = `<div class="sgv2-loading-state">${I.spinner} Searching DEs…</div>`;
            chrome.runtime.sendMessage({ action: 'deSearch', searchTerm: q, instance }, resp => {
                if (resp && resp.success && resp.results && resp.results.length) {
                    res.innerHTML = `<div class="sgv2-results">` + resp.results.map(de => `
                        <div class="sgv2-result-card">
                            <div class="sgv2-type-badge sgv2-type-de">DE</div>
                            <div class="sgv2-result-body">
                                <div class="sgv2-result-name">${escHtml(de.name || de.Name)}</div>
                                <div class="sgv2-result-meta">
                                    ${de.customerKey ? '<span>Key: ' + escHtml(de.customerKey) + '</span>' : ''}
                                    ${de.rowCount != null ? '<span>' + de.rowCount + ' rows</span>' : ''}
                                    ${de.folderPath ? '<span>' + escHtml(de.folderPath) + '</span>' : ''}
                                </div>
                            </div>
                        </div>`).join('') + `</div>`;
                } else {
                    res.innerHTML = `<div class="sgv2-empty"><p>${resp && resp.error ? escHtml(resp.error) : 'No DEs found'}</p></div>`;
                }
            });
        }
    });
}

function renderDECreate(container) {
    if (!S.deCreateFields) S.deCreateFields = [];
    container.innerHTML = `
<div class="sgv2-card">
    <div class="sgv2-card-title">${I.plus} Create Data Extension</div>
    <div class="sgv2-form-row"><label>Name</label><input class="sgv2-input" id="sgv2-de-name" placeholder="DE Name"></div>
    <div class="sgv2-form-row"><label>External Key (optional)</label><input class="sgv2-input" id="sgv2-de-key" placeholder="Auto-generated if blank"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span class="sgv2-section-title" style="margin-bottom:0;">Fields</span>
        <button class="sgv2-btn sgv2-btn-secondary" id="sgv2-add-field" style="padding:5px 10px;font-size:12px;">${I.plus} Add Field</button>
    </div>
    <div id="sgv2-fields-list"></div>
    <button class="sgv2-btn sgv2-btn-primary" id="sgv2-create-de-btn" style="margin-top:12px;width:100%;">${I.plus} Create DE</button>
</div>`;
    renderFieldsList();
    document.getElementById('sgv2-add-field')?.addEventListener('click', () => {
        S.deCreateFields.push({ name: '', type: 'Text', length: '50', required: false });
        renderFieldsList();
    });
    document.getElementById('sgv2-create-de-btn')?.addEventListener('click', () => {
        const name = document.getElementById('sgv2-de-name')?.value.trim();
        const key = document.getElementById('sgv2-de-key')?.value.trim() || null;
        if (!name) { toast('DE name is required', 'warning'); return; }
        if (!S.deCreateFields.length) { toast('Add at least one field', 'warning'); return; }
        const fields = S.deCreateFields.map((f, i) => {
            const row = document.querySelectorAll('.sgv2-field-row')[i];
            return {
                name: row?.querySelector('.sgv2-field-name')?.value || f.name,
                type: row?.querySelector('.sgv2-field-type')?.value || f.type,
                length: row?.querySelector('.sgv2-field-len')?.value || f.length,
                isPrimaryKey: false, isRequired: false
            };
        }).filter(f => f.name);
        chrome.runtime.sendMessage({ action: 'createDE', name, customerKey: key, fields, instance }, res => {
            if (res && res.success) {
                toast('DE "' + name + '" created!', 'success');
                S.deCreateFields = [];
                renderDECreate(container);
            } else {
                toast('Create failed: ' + ((res && res.error) || 'Unknown error'), 'error');
            }
        });
    });
}

function renderFieldsList() {
    const list = document.getElementById('sgv2-fields-list');
    if (!list) return;
    list.innerHTML = S.deCreateFields.map((f, idx) => `
<div class="sgv2-field-row" data-idx="${idx}">
    <input class="sgv2-input sgv2-field-name" placeholder="Field name" value="${escHtml(f.name)}">
    <select class="sgv2-select sgv2-field-type">
        ${['Text','Number','Date','Boolean','Email','Phone','Decimal','Locale'].map(t => `<option${f.type===t?' selected':''}>${t}</option>`).join('')}
    </select>
    <input class="sgv2-input sgv2-field-len" placeholder="Length" value="${escHtml(String(f.length))}">
    <button class="sgv2-remove-field" data-idx="${idx}">${I.close}</button>
</div>`).join('');
    list.querySelectorAll('.sgv2-remove-field').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            S.deCreateFields.splice(idx, 1);
            renderFieldsList();
        });
    });
}

function renderDEExport(container) {
    container.innerHTML = `
<div class="sgv2-card">
    <div class="sgv2-card-title">${I.download} Export Data Extension</div>
    <div class="sgv2-form-row"><label>DE Name or Key</label><input class="sgv2-input" id="sgv2-export-de-name" placeholder="Enter DE name or customer key"></div>
    <div class="sgv2-form-row"><label>Format</label>
        <select class="sgv2-select" id="sgv2-export-format">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
        </select>
    </div>
    <button class="sgv2-btn sgv2-btn-primary" id="sgv2-export-btn" style="width:100%;">${I.download} Export</button>
    <div id="sgv2-export-status" style="margin-top:10px;"></div>
</div>`;
    document.getElementById('sgv2-export-btn')?.addEventListener('click', () => {
        const name = document.getElementById('sgv2-export-de-name')?.value.trim();
        const format = document.getElementById('sgv2-export-format')?.value;
        if (!name) { toast('Enter a DE name', 'warning'); return; }
        document.getElementById('sgv2-export-status').innerHTML = `<div class="sgv2-loading-state" style="padding:12px 0;">${I.spinner} Exporting…</div>`;
        chrome.runtime.sendMessage({ action: 'exportDE', deName: name, format, instance }, res => {
            const statusDiv = document.getElementById('sgv2-export-status');
            if (res && res.success && res.data) {
                const blob = new Blob([format === 'json' ? JSON.stringify(res.data, null, 2) : res.data], { type: format === 'json' ? 'application/json' : 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = name + '-export.' + format; a.click();
                URL.revokeObjectURL(url);
                if (statusDiv) statusDiv.innerHTML = `<span style="color:#04844b;font-size:13px;">${I.check} Export complete.</span>`;
                toast('Export complete: ' + name, 'success');
            } else {
                if (statusDiv) statusDiv.innerHTML = `<span style="color:#c23934;font-size:13px;">Export failed: ${escHtml((res && res.error) || 'Unknown')}</span>`;
                toast('Export failed', 'error');
            }
        });
    });
}

function renderDEImport(container) {
    container.innerHTML = `
<div class="sgv2-card">
    <div class="sgv2-card-title">${I.upload} Import into Data Extension</div>
    <div class="sgv2-form-row"><label>Target DE Name or Key</label><input class="sgv2-input" id="sgv2-import-de-name" placeholder="Target DE name"></div>
    <div class="sgv2-form-row"><label>CSV Data</label>
        <textarea class="sgv2-textarea" id="sgv2-import-data" rows="6" placeholder="Paste CSV data here (first row = headers)"></textarea>
    </div>
    <button class="sgv2-btn sgv2-btn-primary" id="sgv2-import-btn" style="width:100%;">${I.upload} Import</button>
    <div id="sgv2-import-status" style="margin-top:10px;"></div>
</div>`;
    document.getElementById('sgv2-import-btn')?.addEventListener('click', () => {
        const name = document.getElementById('sgv2-import-de-name')?.value.trim();
        const data = document.getElementById('sgv2-import-data')?.value.trim();
        if (!name || !data) { toast('Fill in all fields', 'warning'); return; }
        const statusDiv = document.getElementById('sgv2-import-status');
        if (statusDiv) statusDiv.innerHTML = `<div class="sgv2-loading-state" style="padding:12px 0;">${I.spinner} Importing…</div>`;
        chrome.runtime.sendMessage({ action: 'importDE', deName: name, importData: data, instance }, res => {
            if (res && res.success) {
                if (statusDiv) statusDiv.innerHTML = `<span style="color:#04844b;font-size:13px;">${I.check} Import complete. ${res.recordCount || ''} records imported.</span>`;
                toast('Import complete', 'success');
            } else {
                if (statusDiv) statusDiv.innerHTML = `<span style="color:#c23934;font-size:13px;">Import failed: ${escHtml((res && res.error) || 'Unknown')}</span>`;
                toast('Import failed', 'error');
            }
        });
    });
}

function renderDEReport(container) {
    container.innerHTML = `
<div class="sgv2-card">
    <div class="sgv2-card-title">${I.report} Generate DE Report</div>
    <div class="sgv2-form-row"><label>DE Name (leave blank for all DEs)</label>
        <input class="sgv2-input" id="sgv2-report-de-name" placeholder="Optional — filter by DE name">
    </div>
    <button class="sgv2-btn sgv2-btn-primary" id="sgv2-report-btn" style="width:100%;">${I.report} Generate</button>
    <div id="sgv2-report-status" style="margin-top:10px;"></div>
</div>`;
    document.getElementById('sgv2-report-btn')?.addEventListener('click', () => {
        const name = document.getElementById('sgv2-report-de-name')?.value.trim() || null;
        const statusDiv = document.getElementById('sgv2-report-status');
        if (statusDiv) statusDiv.innerHTML = `<div class="sgv2-loading-state" style="padding:12px 0;">${I.spinner} Generating report…</div>`;
        chrome.runtime.sendMessage({ action: 'generateReport', deName: name, instance }, res => {
            if (res && res.success && res.data) {
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'de-report.json'; a.click();
                URL.revokeObjectURL(url);
                if (statusDiv) statusDiv.innerHTML = `<span style="color:#04844b;font-size:13px;">${I.check} Report downloaded.</span>`;
                toast('Report generated', 'success');
            } else {
                if (statusDiv) statusDiv.innerHTML = `<span style="color:#c23934;font-size:13px;">Failed: ${escHtml((res && res.error) || 'Unknown')}</span>`;
                toast('Report failed', 'error');
            }
        });
    });
}

// --- SNIPPETS VIEW ---
function renderSnippetsView() {
    const cont = document.getElementById('sgv2-content');
    if (!cont) return;
    if (S.snippetsLoading) {
        cont.innerHTML = `<div class="sgv2-loading-state">${I.spinner} Loading snippets…</div>`;
        return;
    }
    if (!S.snippets.length) {
        cont.innerHTML = `<div class="sgv2-empty"><div class="sgv2-empty-icon">&#128221;</div><p>No snippets found. Add them via the SFMC Query Studio or custom snippets.</p></div>`;
        return;
    }
    const langMap = { sql: 'SQL', js: 'JS', ssjs: 'SSJS', ampscript: 'AMPscript', html: 'HTML' };
    cont.innerHTML = `
<div class="sgv2-section-title" style="margin-bottom:12px;">${S.snippets.length} Snippet${S.snippets.length !== 1 ? 's' : ''}</div>
${S.snippets.map((s, idx) => `
<div class="sgv2-snippet-card">
    <div class="sgv2-snippet-header">
        <span class="sgv2-snippet-name">${escHtml(s.name || 'Snippet ' + (idx+1))}</span>
        <span class="sgv2-snippet-lang">${langMap[s.language?.toLowerCase()] || s.language || 'Code'}</span>
    </div>
    ${s.description ? `<div class="sgv2-snippet-desc">${escHtml(s.description)}</div>` : ''}
    <div style="display:flex;gap:8px;">
        <button class="sgv2-btn sgv2-btn-secondary" data-deploy="${idx}" style="font-size:12px;padding:5px 10px;">${I.play} Deploy to Editor</button>
        <button class="sgv2-btn sgv2-btn-secondary" data-copy-snippet="${idx}" style="font-size:12px;padding:5px 10px;">${I.copy} Copy</button>
    </div>
</div>`).join('')}`;

    cont.querySelectorAll('[data-deploy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.deploy, 10);
            const snippet = S.snippets[idx];
            window.postMessage({ action: 'insertSnippet', snippet: snippet.code || snippet.content || '' }, '*');
            toast('Snippet deployed to editor', 'success');
        });
    });
    cont.querySelectorAll('[data-copy-snippet]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.copySnippet, 10);
            const code = S.snippets[idx].code || S.snippets[idx].content || '';
            navigator.clipboard.writeText(code).then(() => toast('Copied!', 'success')).catch(() => toast('Copy failed', 'error'));
        });
    });
}

function loadSnippets() {
    S.snippetsLoading = true;
    chrome.runtime.sendMessage({ action: 'getSnippets' }, res => {
        S.snippetsLoading = false;
        S.snippets = (res && res.snippets) ? res.snippets : [];
        if (S.tab === 'snippets') renderSnippetsView();
    });
}

// ============================================================
//  VIEW CONTROLLER
// ============================================================
function renderCurrentView() {
    switch (S.tab) {
        case 'search':      renderSearchView(); break;
        case 'automations': renderAutomationsView(); break;
        case 'de':          renderDEToolsView(); break;
        case 'snippets':    renderSnippetsView(); break;
    }
}

function updateTabUI() {
    document.querySelectorAll('.sgv2-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === S.tab);
    });
    renderCurrentView();
}

// ============================================================
//  UTILS
// ============================================================
function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatDate(ds) {
    if (!ds) return '';
    try { return new Date(ds).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return String(ds); }
}
function statusToClass(s) {
    const lower = (s || '').toLowerCase();
    if (['active', 'running', 'scheduled'].includes(lower)) return 'sgv2-status-active';
    if (['error', 'inactive', 'stopped'].includes(lower)) return 'sgv2-status-error';
    return 'sgv2-status-paused';
}

// ============================================================
//  PANEL & TOGGLE SETUP
// ============================================================
function createPanel() {
    if (document.getElementById('sgv2-panel')) return;

    const savedWidth = parseInt(localStorage.getItem('sgv2_panel_width') || SGV2.PANEL_WIDTH_DEFAULT, 10);

    const panel = document.createElement('div');
    panel.id = 'sgv2-panel';
    panel.style.width = Math.min(Math.max(savedWidth, SGV2.PANEL_WIDTH_MIN), SGV2.PANEL_WIDTH_MAX) + 'px';
    panel.innerHTML = buildPanelHTML();
    document.body.appendChild(panel);

    const aboutOverlay = buildAboutModal();
    document.body.appendChild(aboutOverlay);

    // Toggle button
    const toggle = document.createElement('button');
    toggle.id = 'sgv2-toggle';
    toggle.innerHTML = '<span class="sgv2-toggle-word">Grep</span><span class="sgv2-toggle-sub">SGV2</span>';
    toggle.addEventListener('click', togglePanel);
    document.body.appendChild(toggle);

    // Resize drag
    setupResizeDrag(panel);

    // Header events
    document.getElementById('sgv2-close-btn')?.addEventListener('click', togglePanel);
    document.getElementById('sgv2-about-btn')?.addEventListener('click', () => {
        aboutOverlay.classList.add('open');
    });
    document.getElementById('sgv2-about-close')?.addEventListener('click', () => {
        aboutOverlay.classList.remove('open');
    });
    aboutOverlay.addEventListener('click', e => {
        if (e.target === aboutOverlay) aboutOverlay.classList.remove('open');
    });
    document.getElementById('sgv2-recapture-btn')?.addEventListener('click', () => {
        toast('Re-capturing tokens…', 'info');
        injectTokenCaptureIframes((ph, ac) => {
            toast(ph && ac ? 'Both tokens captured' : 'Token capture incomplete — navigate to SFMC pages', ph && ac ? 'success' : 'warning');
        });
    });

    // Tab clicks
    panel.querySelectorAll('.sgv2-tab').forEach(t => {
        t.addEventListener('click', () => {
            if (S.tab === t.dataset.tab) return;
            S.tab = t.dataset.tab;
            if (S.tab === 'automations') S.autoDetail = null;
            updateTabUI();
            if (S.tab === 'snippets' && !S.snippets.length) loadSnippets();
        });
    });

    // Keyboard
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && S.open) togglePanel();
        if (e.ctrlKey && e.shiftKey && e.key === 'F') {
            if (!S.open) togglePanel();
            setTimeout(() => {
                const inp = document.getElementById('sgv2-search-input') || document.getElementById('sgv2-auto-search');
                inp?.focus();
            }, 150);
        }
    });
}

function togglePanel() {
    S.open = !S.open;
    const panel = document.getElementById('sgv2-panel');
    if (!panel) return;
    panel.classList.toggle('sgv2-open', S.open);
    if (S.open) {
        loadTokens(() => {
            renderCurrentView();
            // Auto-inject iframes if tokens missing
            if (!S.pageHookToken || !S.appcoreToken) {
                injectTokenCaptureIframes(null);
            }
        });
    }
}

function setupResizeDrag(panel) {
    const handle = document.getElementById('sgv2-resize-handle');
    if (!handle) return;
    let dragging = false;
    let startX = 0;
    let startW = 0;

    handle.addEventListener('mousedown', e => {
        dragging = true;
        startX = e.clientX;
        startW = panel.offsetWidth;
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        const content = panel.querySelector('.sgv2-content');
        if (content) content.style.pointerEvents = 'none';
        e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const dx = startX - e.clientX;
        const newW = Math.min(Math.max(startW + dx, SGV2.PANEL_WIDTH_MIN), SGV2.PANEL_WIDTH_MAX);
        panel.style.width = newW + 'px';
    });
    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        const content = panel.querySelector('.sgv2-content');
        if (content) content.style.pointerEvents = '';
        localStorage.setItem('sgv2_panel_width', panel.offsetWidth);
    });
}

// ============================================================
//  INJECTED SCRIPT RELAY (for Snippet deployment)
// ============================================================
function injectMainScript() {
    try {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = chrome.runtime.getURL('injected_script.js');
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);
    } catch (e) {
        console.warn('[SGv2] Failed to inject script:', e);
    }
}

// ============================================================
//  INIT
// ============================================================
function init() {
    // Register with background
    chrome.runtime.sendMessage({ action: 'registerContentScript' }).catch(() => {});

    // Token capture hooks
    captureTokensFromDOM();

    // Auto-capture iframes after 2s if tokens missing
    setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, res => {
            if (!res || !res.success) return;
            const ph = res.tokens.pageHookToken;
            const ac = res.tokens.appcoreToken;
            if (!ph || !ac) {
                dbg('Auto pre-load: injecting token capture iframes');
                injectTokenCaptureIframes(null);
            }
        });
    }, 2000);

    // Inject CSS + build panel
    injectStyles();
    createPanel();

    // Inject main script (for Ace editor integration)
    injectMainScript();
}

init();

})(); // end IIFE
