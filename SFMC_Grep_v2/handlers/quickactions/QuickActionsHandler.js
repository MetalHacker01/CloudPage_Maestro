/**
 * Quick Actions Handler
 * Handles all Quick Actions API calls through background script to avoid CORS
 * Uses shared services to avoid code duplication
 */

import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';
import { CSRFService } from '../../utils/CSRFService.js';
import { TokenService } from '../../utils/TokenService.js';
import { ConfigService } from '../../utils/ConfigService.js';
import { searchDataExtensions } from '../../services/DESearchService.js';
import { createDataExtension } from '../../services/DECreationService.js';
import { fetchAllDeData, generateReportHtml } from '../../services/DEReportService.js';
import { fetchAllDeBasics, fetchDeDetails, fetchFolderPath, generateFileContent, initializeRootFolderId, fetchFolderChildren } from '../../services/DEExportService.js';
import { checkDeExists, importDataExtension } from '../../services/DEImportService.js';

const debug = false; // Enable for debugging

/**
 * Handle DE Search from Quick Actions
 */
export async function handleDESearch(request, sendResponse) {
    const { searchTerm, instance } = request;
    
    if (debug) console.log('[QuickActions] handleDESearch called:', { searchTerm, instance });
    
    if (!searchTerm) {
        sendResponse({ success: false, error: 'Search term is required' });
        return;
    }

    try {
        const results = await searchDataExtensions(searchTerm, instance);
        sendResponse({ success: true, results: results });
    } catch (error) {
        if (debug) console.error('Error in DE search:', error);
        sendResponse({ success: false, error: error.message || 'Search failed' });
    }
}

/**
 * Handle DE Creation from Quick Actions
 */
export async function handleCreateDE(request, sendResponse) {
    const { deName, fields, folderId, isSendable, isTestable, sendableField, subscriberField, instance } = request;
    
    if (!deName || !fields || !Array.isArray(fields) || fields.length === 0) {
        sendResponse({ success: false, error: 'DE name and fields are required' });
        return;
    }

    try {
        const result = await createDataExtension(
            deName,
            fields,
            folderId || "0",
            isSendable || false,
            isTestable || false,
            sendableField,
            subscriberField,
            instance
        );
        
        if (result.id) {
            sendResponse({ success: true, deId: result.id });
        } else {
            sendResponse({ success: false, error: result.message || result.error || 'Failed to create DE' });
        }
    } catch (error) {
        if (debug) console.error('Error creating DE:', error);
        sendResponse({ success: false, error: error.message || 'Failed to create DE' });
    }
}

/**
 * Handle Test Data Generation from Quick Actions
 */
export async function handleGenerateTestData(request, sendResponse) {
    const { deId, deName, recordCount, fields, instance } = request;
    
    if (!deId || !fields || !Array.isArray(fields)) {
        sendResponse({ success: false, error: 'DE ID and fields are required' });
        return;
    }

    try {
        // Get token for test data generation API
        const token = await TokenService.getToken();
        if (!token) {
            throw new Error('Failed to get authentication token');
        }
        
        // Call the test data generation API
        const testDataResponse = await fetch(ConfigService.getApiUrl('/data/generate-test-data'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fields: fields,
                count: parseInt(recordCount) || 10
            })
        });

        if (!testDataResponse.ok) {
            const errorData = await testDataResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${testDataResponse.status}`);
        }

        const testDataResult = await testDataResponse.json();
        
        // Get full instance format (mc.s50)
        let fullInstance = instance;
        if (!fullInstance || !fullInstance.includes('mc.')) {
            const serviceInstance = await SFMCInstanceService.getInstance();
            fullInstance = serviceInstance || 'mc.s51';
        }
        // Ensure we have mc. prefix
        if (!fullInstance.startsWith('mc.')) {
            fullInstance = `mc.${fullInstance}`;
        }
        
        if (debug) console.log('[QuickActions] Using instance for testData:', fullInstance);
        
        // Get CSRF token - pass full instance (mc.s50) as getTokenSimple expects it
        const csrfToken = await CSRFService.getTokenSimple(fullInstance);
        
        const primaryKeyFields = fields.filter(f => f.isPrimaryKey).map(f => f.name);
        const apiUrl = `https://${fullInstance}.marketingcloudapps.com/contactsmeta/fuelapi/hub/v1/dataevents/${deId}/rowset?method=${primaryKeyFields.length > 0 ? 'update' : 'insert'}`;

        const payloadRows = testDataResult.map(row => {
            const keys = {};
            primaryKeyFields.forEach(pkName => {
                if (row.hasOwnProperty(pkName)) {
                    keys[pkName] = row[pkName];
                }
            });
            return { keys: keys, values: row };
        });

        const insertResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify(payloadRows)
        });

        if (!insertResponse.ok) {
            const errorData = await insertResponse.json().catch(() => ({}));
            throw new Error(errorData.message || `Insert failed. Status: ${insertResponse.status}`);
        }

        sendResponse({ success: true });
    } catch (error) {
        if (debug) console.error('Error generating test data:', error);
        sendResponse({ success: false, error: error.message || 'Test data generation failed' });
    }
}

/**
 * Handle DE Export from Quick Actions
 * Returns export data structure - ZIP creation should be handled in content script
 */
export async function handleExportDE(request, sendResponse) {
    const { format, filter, instance } = request;
    
    try {
        // Get full instance format (mc.s50)
        let fullInstance = instance;
        if (!fullInstance || !fullInstance.includes('mc.')) {
            const serviceInstance = await SFMCInstanceService.getInstance();
            fullInstance = serviceInstance || 'mc.s51';
        }
        if (!fullInstance.startsWith('mc.')) {
            fullInstance = `mc.${fullInstance}`;
        }

        if (debug) console.log('[QuickActions] Starting export...', { format, filter });

        // Initialize root folder ID
        await initializeRootFolderId(fullInstance);

        // Fetch all DE basics
        const allDeBasics = await fetchAllDeBasics(fullInstance, (message) => {
            if (debug) console.log('[QuickActions]', message);
        });

        if (!allDeBasics || allDeBasics.length === 0) {
            sendResponse({ success: false, error: 'No Data Extensions found' });
            return;
        }

        // Filter based on filter option
        const filteredDeList = allDeBasics.filter(de => {
            if (filter === 'all') return true;
            if (filter === 'sendable') return de.isSendable;
            if (filter === 'nonsendable') return !de.isSendable;
            return true;
        });

        if (debug) console.log(`[QuickActions] Processing ${filteredDeList.length} DEs...`);

        // Fetch details and paths for each DE
        const allProcessedDEs = [];
        const concurrencyLimit = 5;
        let processedCount = 0;

        for (let i = 0; i < filteredDeList.length; i += concurrencyLimit) {
            const batch = filteredDeList.slice(i, i + concurrencyLimit);

            const batchPromises = batch.map(async (deBasic) => {
                try {
                    const [details, folderPath] = await Promise.all([
                        fetchDeDetails(deBasic.id, fullInstance),
                        fetchFolderPath(deBasic.categoryId, fullInstance)
                    ]);

                    processedCount++;
                    if (debug && processedCount % 10 === 0) {
                        console.log(`[QuickActions] Processed ${processedCount} of ${filteredDeList.length}...`);
                    }

                    if (!details) {
                        return null;
                    }

                    deBasic.folderPath = folderPath || 'Data Extensions';
                    const content = generateFileContent(deBasic, details, format);

                    if (content) {
                        const deObject = format === 'json' ? JSON.parse(content) : {
                            name: deBasic.name,
                            id: deBasic.id,
                            customerKey: deBasic.customerKey,
                            folderPath: deBasic.folderPath,
                            isSendable: deBasic.isSendable,
                            isTestable: deBasic.isTestable,
                            createdDate: deBasic.createdDate,
                            modifiedDate: deBasic.modifiedDate,
                            owner: deBasic.ownerName,
                            fields: details.fields || []
                        };

                        allProcessedDEs.push({
                            ...deObject,
                            id: deBasic.id,
                            content: content,
                            fileName: `${deBasic.name.replace(/[\/\?<>\\:\*\|":]/g, '_')}.${format}`,
                            folderPath: deBasic.folderPath
                        });
                    }

                    return true;
                } catch (err) {
                    if (debug) console.error(`[QuickActions] Error processing ${deBasic.name}:`, err);
                    return null;
                }
            });

            await Promise.all(batchPromises);
        }

        // Create comprehensive export object
        const folderPaths = {};
        allProcessedDEs.forEach(de => {
            if (de.folderPath) {
                folderPaths[de.folderPath] = true;
            }
        });

        const fullExport = {
            exportInfo: {
                timestamp: new Date().toISOString(),
                instance: fullInstance,
                filter: filter,
                totalCount: allProcessedDEs.length
            },
            folders: Object.keys(folderPaths).map(path => ({
                path: path,
                segments: path.split('/')
            })),
            dataExtensions: allProcessedDEs.map(de => {
                const { content, fileName, ...deData } = de;
                return deData;
            }),
            // Include file contents for ZIP creation
            files: allProcessedDEs.map(de => ({
                path: `${de.folderPath}/${de.fileName}`,
                content: de.content
            }))
        };

        // Add comprehensive export file
        fullExport.files.push({
            path: `SFMC_All_DataExtensions_${filter}.json`,
            content: JSON.stringify({
                exportInfo: fullExport.exportInfo,
                folders: fullExport.folders,
                dataExtensions: fullExport.dataExtensions
            }, null, 2)
        });

        if (debug) console.log(`[QuickActions] Export data prepared: ${allProcessedDEs.length} DEs`);

        sendResponse({
            success: true,
            exportData: fullExport,
            message: `Export data prepared: ${allProcessedDEs.length} DEs. ZIP creation should be handled in content script.`
        });
    } catch (error) {
        if (debug) console.error('Error in DE export:', error);
        sendResponse({ success: false, error: error.message || 'Export failed' });
    }
}

/**
 * Handle DE Import from Quick Actions
 * Imports Data Extensions from JSON data
 */
export async function handleImportDE(request, sendResponse) {
    const { importData, createFolders, skipExisting, instance } = request;
    
    if (!importData || !importData.dataExtensions || !Array.isArray(importData.dataExtensions)) {
        sendResponse({ success: false, error: 'Invalid import data structure. Missing dataExtensions array.' });
        return;
    }

    try {
        // Get full instance format (mc.s50)
        let fullInstance = instance;
        if (!fullInstance || !fullInstance.includes('mc.')) {
            const serviceInstance = await SFMCInstanceService.getInstance();
            fullInstance = serviceInstance || 'mc.s51';
        }
        if (!fullInstance.startsWith('mc.')) {
            fullInstance = `mc.${fullInstance}`;
        }

        if (debug) console.log('[QuickActions] Starting import...', { count: importData.dataExtensions.length, createFolders, skipExisting });

        // Initialize root folder ID
        const rootFolderId = await initializeRootFolderId(fullInstance);

        const dataExtensions = importData.dataExtensions;
        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const errors = [];

        // Simple folder path to ID cache (for createFolders option)
        const folderPathCache = new Map();
        folderPathCache.set('Data Extensions', rootFolderId);

        // Simple folder creation function (simplified version)
        const getOrCreateFolder = async (folderPath) => {
            if (!createFolders) {
                return rootFolderId; // Return root if not creating folders
            }

            if (folderPathCache.has(folderPath)) {
                return folderPathCache.get(folderPath);
            }

            // For now, return root folder ID
            // Full folder creation logic would go here (similar to data-export.js)
            folderPathCache.set(folderPath, rootFolderId);
            return rootFolderId;
        };

        // Process each DE
        for (let i = 0; i < dataExtensions.length; i++) {
            const de = dataExtensions[i];

            if (debug && (i + 1) % 10 === 0) {
                console.log(`[QuickActions] Processing DE ${i + 1} of ${dataExtensions.length}...`);
            }

            try {
                // Check if DE already exists
                if (skipExisting) {
                    const existingDE = await checkDeExists(de.name, fullInstance);
                    if (existingDE) {
                        skippedCount++;
                        continue;
                    }
                }

                // Get folder ID
                let folderId = rootFolderId;
                if (createFolders && de.folderPath) {
                    folderId = await getOrCreateFolder(de.folderPath);
                }

                // Validate fields
                if (!de.fields || !Array.isArray(de.fields) || de.fields.length === 0) {
                    errors.push({ de: de.name, error: "DE has no fields" });
                    errorCount++;
                    continue;
                }

                // Import the DE
                try {
                    const result = await importDataExtension(de, folderId, fullInstance);
                    if (result && result.id) {
                        successCount++;
                    } else {
                        errors.push({ de: de.name, error: "API returned no Data Extension ID" });
                        errorCount++;
                    }
                } catch (deError) {
                    errors.push({ de: de.name, error: `DE creation failed: ${deError.message}` });
                    errorCount++;
                }
            } catch (error) {
                errors.push({ de: de.name, error: error.message });
                errorCount++;
            }
        }

        let statusMessage = `Import completed: ${successCount} created`;
        if (skippedCount > 0) statusMessage += `, ${skippedCount} skipped`;
        if (errorCount > 0) statusMessage += `, ${errorCount} failed`;

        if (debug) console.log('[QuickActions]', statusMessage);

        sendResponse({
            success: errorCount === 0,
            message: statusMessage,
            stats: {
                success: successCount,
                skipped: skippedCount,
                failed: errorCount,
                total: dataExtensions.length
            },
            errors: errors.length > 0 ? errors.slice(0, 10) : [] // Limit errors returned
        });
    } catch (error) {
        if (debug) console.error('Error in DE import:', error);
        sendResponse({ success: false, error: error.message || 'Import failed' });
    }
}

/**
 * Handle Report Generation from Quick Actions
 */
export async function handleGenerateReport(request, sendResponse) {
    try {
        // Get full instance format (mc.s50)
        let fullInstance = request.instance;
        if (!fullInstance || !fullInstance.includes('mc.')) {
            const serviceInstance = await SFMCInstanceService.getInstance();
            fullInstance = serviceInstance || 'mc.s51';
        }
        // Ensure we have mc. prefix
        if (!fullInstance.startsWith('mc.')) {
            fullInstance = `mc.${fullInstance}`;
        }
        
        if (debug) console.log('[QuickActions] Starting report generation...');

        // Fetch all DE data using shared service
        const allDeData = await fetchAllDeData(fullInstance, (message) => {
            if (debug) console.log('[QuickActions]', message);
        });
        
        if (!allDeData || allDeData.length === 0) {
            sendResponse({ success: false, error: 'No Data Extensions found in this account.' });
            return;
        }

        if (debug) console.log(`[QuickActions] Fetched ${allDeData.length} DEs, generating HTML...`);

        // Generate HTML Report using shared service
        const reportHtml = generateReportHtml(allDeData, fullInstance);

        // Create data URL (works in background scripts, unlike blob URLs)
        const reportDataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(reportHtml);

        // Use chrome.tabs.create to open the new tab (available in background script)
        chrome.tabs.create({ 
            url: reportDataUrl,
            active: true
        }, (tab) => {
            // Update tab title immediately by modifying the HTML before opening
            const htmlWithTitle = reportHtml.replace(
                '<title>SFMC Grep Data Extension Report (' + fullInstance + ')</title>',
                '<title>SFMC Grep Data Extension Report (' + fullInstance + ')</title>'
            );
            // The title is already in the HTML, so it should show correctly
            // If not, update after a short delay
            if (tab && tab.id) {
                setTimeout(() => {
                    chrome.tabs.executeScript(tab.id, {
                        code: 'if (document.title === "" || document.title.includes("Untitled")) { document.title = "SFMC Grep Data Extension Report (' + fullInstance + ')"; }'
                    });
                }, 100);
            }
        });

        if (debug) console.log('[QuickActions] Report opened in new tab');

        sendResponse({ success: true, count: allDeData.length });
    } catch (error) {
        if (debug) console.error('Error generating report:', error);
        sendResponse({ success: false, error: error.message || 'Report generation failed' });
    }
}

/**
 * Handle Folder Children Fetch from Quick Actions
 */
export async function handleFetchFolderChildren(request, sendResponse) {
    const { parentId, instance } = request;
    
    if (debug) console.log('[QuickActions] handleFetchFolderChildren called:', { parentId, instance });
    
    if (!instance) {
        sendResponse({ success: false, error: 'Instance is required' });
        return;
    }

    try {
        const folders = await fetchFolderChildren(parentId || null, instance);
        sendResponse({ success: true, folders: folders });
    } catch (error) {
        if (debug) console.error('Error fetching folder children:', error);
        sendResponse({ success: false, error: error.message || 'Failed to fetch folders' });
    }
}

