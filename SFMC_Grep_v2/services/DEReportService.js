/**
 * DE Report Service
 * Shared service for generating Data Extension reports
 * Extracted from popup/assets/data-report.js for reuse
 * 
 * Copyright (c) 2025 Aldorino Rrushi
 */

import { SFMCInstanceService } from '../utils/SFMCInstanceService.js';
import { CSRFService } from '../utils/CSRFService.js';

/**
 * Fetch all Data Extensions with pagination and full path
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array>} Array of all Data Extensions
 */
export async function fetchAllDeData(instance, progressCallback = null) {
    let allDes = [];
    let currentPage = 1;
    const pageSize = 1000;
    let totalCount = 0;
    let fetchedCount = 0;
    let hasMorePages = true;

    const API_BASE_URL = SFMCInstanceService.getApiBaseUrl(instance);

    // Generic API Fetch function
    const sfmcApiFetch = async (endpoint, options = {}) => {
        const url = `${API_BASE_URL}${endpoint}`;
        const defaultOptions = {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        const fetchOptions = { ...defaultOptions, ...options, headers: { ...defaultOptions.headers, ...options.headers } };

        try {
            const response = await fetch(url, fetchOptions);
            const responseText = await response.text();
            let responseData;

            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                return null;
            }

            if (!response.ok) {
                let errorMsg = `API Error ${response.status}: ${response.statusText}`;
                if (responseData) {
                    if (responseData.message) {
                        errorMsg = responseData.message;
                    } else if (responseData.error) {
                        errorMsg = responseData.error;
                    }
                }
                throw new Error(errorMsg);
            }
            return responseData;
        } catch (error) {
            throw error;
        }
    };

    if (progressCallback) progressCallback(`Fetching DE list (page ${currentPage})...`);

    while (hasMorePages) {
        try {
            const endpoint = `/data-internal/v1/customobjects/category/0?retrievalType=1&includeFullPath=true&$page=${currentPage}&$pagesize=${pageSize}`;
            const data = await sfmcApiFetch(endpoint);

            if (data && data.items) {
                allDes = allDes.concat(data.items);
                fetchedCount += data.items.length;

                if (currentPage === 1 && data.count) {
                    totalCount = data.count;
                    if (progressCallback) progressCallback(`Found ${totalCount} DEs. Fetching page ${currentPage}...`);
                }

                const progressMsg = totalCount > 0 ? `Fetched ${fetchedCount} of ${totalCount} DEs...` : `Fetched ${fetchedCount} DEs...`;
                if (progressCallback) progressCallback(progressMsg + ` (Page ${currentPage})`);

                if ((totalCount > 0 && fetchedCount >= totalCount) || data.items.length < pageSize) {
                    hasMorePages = false;
                } else {
                    currentPage++;
                }
            } else {
                hasMorePages = false;
            }

            // Safety break
            if (currentPage > 500) {
                hasMorePages = false;
                if (progressCallback) progressCallback("Reached fetch limit. Report might be incomplete.");
            }
        } catch (error) {
            throw new Error(`Failed to fetch DE data (page ${currentPage}): ${error.message}`);
        }
    }
    return allDes;
}

/**
 * Generate HTML report from Data Extension data
 * @param {Array} allDeData - Array of Data Extension objects
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @returns {string} HTML string
 */
export function generateReportHtml(allDeData, instance) {
    const reportDate = new Date().toLocaleString();

    let tableRows = '';
    if (allDeData && allDeData.length > 0) {
        allDeData.sort((a, b) => {
            const pathA = a.categoryFullPath || '';
            const pathB = b.categoryFullPath || '';
            const nameA = a.name || '';
            const nameB = b.name || '';
            const normPathA = pathA.replace(/\\/g, '/').toLowerCase();
            const normPathB = pathB.replace(/\\/g, '/').toLowerCase();

            if (normPathA < normPathB) return -1;
            if (normPathA > normPathB) return 1;
            if (nameA.toLowerCase() < nameB.toLowerCase()) return -1;
            if (nameA.toLowerCase() > nameB.toLowerCase()) return 1;
            return 0;
        });

        const escapeHtml = (unsafe) => {
            if (!unsafe) return '';
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // Icons for the report
        const ICONS = {
            folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11V4.6C2 4.26863 2.26863 4 2.6 4H8.77805C8.92069 4 9.05679 4.05679 9.15751 4.15751L11.8425 6.84249C11.9432 6.94321 12.0793 7 12.2219 7H21.4C21.7314 7 22 7.26863 22 7.6V11M2 11V19.4C2 19.7314 2.26863 20 2.6 20H21.4C21.7314 20 22 19.7314 22 19.4V11M2 11H22"/></svg>',
            hashtag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L6 21"/><path d="M18 3L14 21"/><path d="M4 8H21"/><path d="M3 16H20"/></svg>',
            externalLink: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L15 3M21 3L12 12M21 3V9"/><path d="M21 13V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H11"/></svg>',
            checkCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5L10 15.5L17 8.5"/><circle cx="12" cy="12" r="10"/></svg>',
            xCircle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9L9 15"/><path d="M9 9L15 15"/></svg>',
            calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2M15 4V6M15 4H10.5M3 10V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V10H3Z"/><path d="M3 10V6C3 4.89543 3.89543 4 5 4H7"/><path d="M7 2V6"/><path d="M21 10V6C21 4.89543 20.1046 4 19 4H18.5"/></svg>',
            user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21"/><circle cx="12" cy="7" r="4"/></svg>'
        };

        tableRows = allDeData.map(de => {
            const created = de.createdDate ? new Date(de.createdDate).toLocaleString() : 'N/A';
            const modified = de.modifiedDate ? new Date(de.modifiedDate).toLocaleString() : 'N/A';
            const sendableText = de.isSendable ?
                `<span class="de-badge de-badge-success">${ICONS.checkCircle} Yes</span><span class="de-sendable-details"> (<b>${escapeHtml(de.sendableCustomObjectField || '?')}</b> → <b>${escapeHtml(de.sendableSubscriberField || '?')}</b>)</span>` :
                `<span class="de-badge de-badge-error">${ICONS.xCircle} No</span>`;
            const folderPath = de.categoryFullPath ? de.categoryFullPath.replace(/\\/g, '/') : 'Data Extensions';
            const createdBy = de.ownerName || 'N/A';
            const modifiedBy = de.modifiedByName || de.ownerName || 'N/A';
            const keyText = escapeHtml(de.key || 'N/A');
            const deUrl = `https://${instance}.marketingcloudapps.com/contactsmeta/admin.html#admin/data-extension/${de.id}/properties/`;

            return `
                <tr>
                    <td>
                        <a href="${deUrl}" target="_blank" rel="noopener noreferrer" class="de-name-link">
                            ${escapeHtml(de.name)} ${ICONS.externalLink}
                        </a>
                    </td>
                    <td>
                        <span class="de-folder-path">${ICONS.folder} ${escapeHtml(folderPath)}</span>
                    </td>
                    <td>
                        <span class="de-id" data-action="copy" data-id="${escapeHtml(de.id || 'N/A')}" title="Click to copy">
                            ${ICONS.hashtag} ${escapeHtml(de.id || 'N/A')}
                        </span>
                    </td>
                    <td>
                        <span class="de-key">${escapeHtml(keyText)}</span>
                    </td>
                    <td class="de-number">${de.rowCount != null ? de.rowCount.toLocaleString() : 'N/A'}</td>
                    <td class="de-number">${de.fieldCount != null ? de.fieldCount : 'N/A'}</td>
                    <td>${sendableText}</td>
                    <td>
                        <span class="de-date">${ICONS.calendar} ${created}</span>
                    </td>
                    <td>
                        <span class="de-user">${ICONS.user} ${escapeHtml(createdBy)}</span>
                    </td>
                    <td>
                        <span class="de-date">${ICONS.calendar} ${modified}</span>
                    </td>
                    <td>
                        <span class="de-user">${ICONS.user} ${escapeHtml(modifiedBy)}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SFMC Grep Data Extension Report (${instance})</title>
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: "Salesforce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    font-size: 14px; 
                    margin: 0;
                    padding: 24px;
                    background-color: #ffffff;
                    color: #080707;
                    line-height: 1.6;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                }
                h1 { 
                    font-size: 24px;
                    font-weight: 700;
                    margin: 0 0 24px 0;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #e5e5e5;
                    color: #080707;
                }
                .summary { 
                    margin-bottom: 24px; 
                    padding: 16px 20px; 
                    background-color: #f3f3f3;
                    border: 1px solid #e5e5e5;
                    border-radius: 8px;
                    color: #080707;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                }
                .summary strong {
                    color: #0176d3;
                    font-weight: 600;
                }
                .table-container {
                    background: #ffffff;
                    border-radius: 8px;
                    overflow-x: auto;
                    border: 1px solid #e5e5e5;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                }
                table { 
                    border-collapse: collapse; 
                    width: 100%; 
                    min-width: 1400px;
                    font-size: 13px;
                    table-layout: auto;
                }
                thead {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                th { 
                    background-color: #f3f3f3;
                    padding: 14px 12px;
                    text-align: left;
                    font-size: 11px;
                    font-weight: 700;
                    color: #706e6b;
                    text-transform: uppercase;
                    letter-spacing: 0.6px;
                    border-bottom: 2px solid #c9c9c9;
                    position: relative;
                    user-select: none;
                    transition: background 0.2s;
                }
                th:hover {
                    background-color: #f1f5f9;
                }
                td { 
                    padding: 12px;
                    border-bottom: 1px solid #e5e5e5;
                    color: #080707;
                    vertical-align: top;
                    transition: background-color 0.15s ease-out;
                }
                tbody tr {
                    background-color: #ffffff;
                    transition: all 0.15s ease-out;
                }
                tbody tr:hover {
                    background-color: #f3f3f3;
                    box-shadow: inset 0 0 0 1px #e2e8f0;
                }
                tbody tr:nth-child(even) {
                    background-color: #fafafa;
                }
                tbody tr:nth-child(even):hover {
                    background-color: #f3f3f3;
                }
                a {
                    color: #0176d3;
                    text-decoration: none;
                    font-weight: 500;
                    transition: color 0.15s ease;
                }
                a:hover {
                    color: #014a8a;
                    text-decoration: underline;
                }
                /* Modern table cell styles with icons */
                .de-name-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #0176d3;
                    text-decoration: none;
                    font-weight: 500;
                    transition: color 0.15s ease;
                }
                .de-name-link:hover {
                    color: #014a8a;
                    text-decoration: underline;
                }
                .de-name-link svg {
                    width: 14px;
                    height: 14px;
                    opacity: 0.7;
                    flex-shrink: 0;
                }
                .de-folder-path {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #706e6b;
                    font-size: 12px;
                    max-width: 300px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .de-folder-path svg {
                    width: 14px;
                    height: 14px;
                    flex-shrink: 0;
                    color: #0176d3;
                }
                .de-id {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-family: 'Courier New', Courier, monospace;
                    font-weight: 600;
                    color: #0176d3;
                    cursor: pointer;
                    font-size: 12px;
                    transition: color 0.15s ease;
                }
                .de-id:hover {
                    color: #014a8a;
                    text-decoration: underline;
                }
                .de-id svg {
                    width: 14px;
                    height: 14px;
                    flex-shrink: 0;
                }
                .de-key {
                    font-family: 'Courier New', Courier, monospace;
                    color: #080707;
                    font-size: 12px;
                }
                .de-number {
                    text-align: right;
                    font-weight: 500;
                    font-variant-numeric: tabular-nums;
                }
                .de-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .de-badge svg {
                    width: 14px;
                    height: 14px;
                    flex-shrink: 0;
                }
                .de-badge-success {
                    background: #e8f4ea;
                    color: #2e844a;
                    border: 1px solid #b8d4be;
                }
                .de-badge-error {
                    background: #fef5f5;
                    color: #c23934;
                    border: 1px solid #e0b4b4;
                }
                .de-sendable-details {
                    margin-left: 8px;
                    font-size: 11px;
                    color: #706e6b;
                }
                .de-date {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #706e6b;
                    font-size: 12px;
                }
                .de-date svg {
                    width: 14px;
                    height: 14px;
                    flex-shrink: 0;
                    opacity: 0.7;
                }
                .de-user {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #706e6b;
                    font-size: 12px;
                }
                .de-user svg {
                    width: 14px;
                    height: 14px;
                    flex-shrink: 0;
                    opacity: 0.7;
                }
                /* Scrollbar styling */
                ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                ::-webkit-scrollbar-track {
                    background: #f3f3f3;
                }
                ::-webkit-scrollbar-thumb {
                    background: #c9d0db;
                    border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: #9faab5;
                }
            </style>
        </head>
        <body>
            <h1>SFMC Grep Data Extension Report</h1>
            <div class="summary">
                <strong>Generated:</strong> ${reportDate}<br>
                <strong>Total Data Extensions Found:</strong> ${allDeData ? allDeData.length : 0}
            </div>
            <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Folder Path</th>
                        <th>ID</th>
                        <th>Key</th>
                        <th>Row Count</th>
                        <th>Field Count</th>
                        <th>Sendable</th>
                        <th>Created Date</th>
                        <th>Created By</th>
                        <th>Modified Date</th>
                        <th>Modified By</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows || '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #706e6b;">No Data Extensions found or error fetching data.</td></tr>'}
                </tbody>
            </table>
            </div>
            <script>
                // Copy to clipboard functionality for DE IDs
                document.addEventListener('click', function(e) {
                    const deId = e.target.closest('.de-id');
                    if (deId && deId.dataset.action === 'copy') {
                        const id = deId.dataset.id;
                        navigator.clipboard.writeText(id).then(() => {
                            const original = deId.textContent.trim();
                            deId.textContent = 'Copied!';
                            deId.style.color = '#2e844a';
                            setTimeout(() => {
                                deId.textContent = original;
                                deId.style.color = '#0176d3';
                            }, 2000);
                        }).catch(() => {
                            alert('Failed to copy ID');
                        });
                    }
                });
            </script>
        </body>
        </html>
    `;
}

