/**
 * DE Export Service
 * Shared service for exporting Data Extensions
 * Extracted from popup/assets/data-export.js for reuse
 * Note: Actual ZIP creation requires JSZip/FileSaver which are only available in popup context
 */

import { SFMCInstanceService } from '../utils/SFMCInstanceService.js';
import { CSRFService } from '../utils/CSRFService.js';

// Cache for folder paths
const folderPathCache = new Map();
folderPathCache.set('0', 'Data Extensions');

/**
 * Initialize root folder ID
 * @param {string} instance - SFMC instance
 * @returns {Promise<string>} Root folder ID
 */
export async function initializeRootFolderId(instance) {
    const API_BASE_URL = SFMCInstanceService.getApiBaseUrl(instance);
    
    try {
        const endpoint = `/legacy/v1/beta/folder/0/children?Localization=true&$top=1000`;
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (!response.ok) {
            return '0'; // Fallback to "0"
        }

        const result = await response.json();
        if (result && result.entry && result.entry.length > 0) {
            const dataExtensionsFolder = result.entry.find(folder =>
                folder.name === "Data Extensions" && folder.type === "dataextension"
            );

            if (dataExtensionsFolder && dataExtensionsFolder.id) {
                folderPathCache.set('0', 'Data Extensions');
                return dataExtensionsFolder.id;
            }
        }
    } catch (error) {
        // Fallback to "0"
    }
    return '0';
}

/**
 * Fetch folder children
 * @param {string} parentId - Parent folder ID (null for root)
 * @param {string} instance - SFMC instance
 * @returns {Promise<Array>} Array of folder items
 */
export async function fetchFolderChildren(parentId, instance) {
    const API_BASE_URL = SFMCInstanceService.getApiBaseUrl(instance);
    
    try {
        let apiUrl;
        let isRootLevel = false;
        
        if (parentId) {
            apiUrl = `${API_BASE_URL}/legacy/v1/beta/folder/${parentId}/children?Localization=true&$top=1000`;
        } else {
            apiUrl = `${API_BASE_URL}/legacy/v1/beta/folder?$where=allowedtypes%20in%20(%20%27dataextension%27)&Localization=true`;
            isRootLevel = true;
        }
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch folders: ${response.status}`);
        }
        
        const data = await response.json();
        let folders = [];
        
        if (isRootLevel) {
            // For root level, find the "Data Extensions" folder and return its children
            if (data && data.entry && data.entry.length > 0) {
                const dataExtensionsFolder = data.entry.find(folder =>
                    folder.name === "Data Extensions" && folder.type === "dataextension"
                );
                
                if (dataExtensionsFolder && dataExtensionsFolder.id) {
                    // Recursively fetch children of the Data Extensions folder
                    return await fetchFolderChildren(dataExtensionsFolder.id, instance);
                }
            }
            // Fallback: return root folders if Data Extensions folder not found
            if (data && data.items && data.items.length > 0) {
                folders = data.items.filter(item => 
                    item.type === 'dataextension' || item.iconType === 'folder'
                );
            } else if (data && data.entry && data.entry.length > 0) {
                folders = data.entry.filter(item => 
                    item.type === 'dataextension' || item.iconType === 'folder'
                );
            }
        } else {
            if (data && data.entry && data.entry.length > 0) {
                folders = data.entry.filter(item => 
                    item.type === 'dataextension' || item.iconType === 'folder'
                );
            }
        }
        
        return folders;
    } catch (error) {
        console.error('Error fetching folder children:', error);
        throw error;
    }
}

/**
 * Fetch a single folder's details
 * @param {string} categoryId - Folder category ID
 * @param {string} instance - SFMC instance
 * @returns {Promise<Object|null>} Folder object
 */
async function fetchFolder(categoryId, instance) {
    if (!categoryId || categoryId === '0') return null;
    if (folderPathCache.has(`folder_${categoryId}`)) {
        return folderPathCache.get(`folder_${categoryId}`);
    }

    try {
        const API_BASE_URL = SFMCInstanceService.getApiBaseUrl(instance);
        const response = await fetch(`${API_BASE_URL}/legacy/v1/beta/folder/${categoryId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch folder: ${response.status}`);
        }

        const folder = await response.json();
        folderPathCache.set(`folder_${categoryId}`, folder);
        return folder;
    } catch (error) {
        folderPathCache.set(`folder_${categoryId}`, { error: true, name: '[Error Fetching Folder]' });
        return folderPathCache.get(`folder_${categoryId}`);
    }
}

/**
 * Fetch full folder path for a DE
 * @param {string} categoryId - Folder category ID
 * @param {string} instance - SFMC instance
 * @returns {Promise<string>} Full folder path
 */
export async function fetchFolderPath(categoryId, instance) {
    if (!categoryId || categoryId === '0') return folderPathCache.get('0');
    if (folderPathCache.has(categoryId)) {
        return folderPathCache.get(categoryId);
    }

    let pathSegments = [];
    let currentCategoryId = categoryId;
    let safetyBreak = 0;

    while (currentCategoryId && currentCategoryId !== '0' && safetyBreak < 20) {
        if (folderPathCache.has(currentCategoryId)) {
            const cachedPath = folderPathCache.get(currentCategoryId);
            pathSegments.unshift(cachedPath);
            currentCategoryId = null;
            break;
        }

        const folder = await fetchFolder(currentCategoryId, instance);
        if (folder && !folder.error) {
            pathSegments.unshift(folder.name);
            currentCategoryId = folder.parentId;
        } else {
            pathSegments.unshift(folder?.name || '[Unknown Folder]');
            break;
        }
        safetyBreak++;
    }

    if (currentCategoryId === '0' && !pathSegments[0]?.startsWith(folderPathCache.get('0'))) {
        pathSegments.unshift(folderPathCache.get('0'));
    }

    const fullPath = pathSegments.join('/');
    folderPathCache.set(categoryId, fullPath);
    return fullPath;
}

/**
 * Fetch basic details for all DEs (paginated)
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array>} Array of DE basic info
 */
export async function fetchAllDeBasics(instance, progressCallback = null) {
    let allDes = [];
    let currentPage = 1;
    const pageSize = 200;
    let totalCount = 0;
    let fetchedCount = 0;
    let hasMorePages = true;

    const API_BASE_URL = SFMCInstanceService.getApiBaseUrl(instance);

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
                responseData = { rawText: responseText };
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

    if (progressCallback) progressCallback(`Fetching list of Data Extensions (page ${currentPage})...`);

    while (hasMorePages) {
        try {
            const endpoint = `/data-internal/v1/customobjects/category/0?retrievalType=1&$page=${currentPage}&$pagesize=${pageSize}`;
            const data = await sfmcApiFetch(endpoint);

            if (data && data.items) {
                allDes = allDes.concat(data.items.map(item => ({
                    id: item.id,
                    name: item.name,
                    customerKey: item.key,
                    categoryId: item.categoryId,
                    isSendable: item.isSendable || false,
                    isTestable: item.isTestable || false,
                    fieldCount: item.fieldCount || 0,
                    rowCount: item.rowCount || 0,
                    createdDate: item.createdDate,
                    modifiedDate: item.modifiedDate,
                    ownerName: item.ownerName,
                    sendableCustomObjectField: item.sendableCustomObjectField,
                    sendableSubscriberField: item.sendableSubscriberField
                })));
                fetchedCount += data.items.length;

                if (currentPage === 1 && data.count) {
                    totalCount = data.count;
                    if (progressCallback) progressCallback(`Found ${totalCount} DEs. Fetching details...`);
                }

                if (progressCallback) progressCallback(`Fetched ${fetchedCount} of ${totalCount || 'many'} DEs... (Page ${currentPage})`);

                if (fetchedCount >= totalCount || data.items.length < pageSize) {
                    hasMorePages = false;
                } else {
                    currentPage++;
                }
            } else {
                hasMorePages = false;
            }

            if (currentPage > 1000) {
                hasMorePages = false;
                if (progressCallback) progressCallback(`Warning: Stopped fetching DE list after 1000 pages (${fetchedCount} DEs). Export may be incomplete.`);
            }
        } catch (error) {
            throw new Error(`Failed to fetch DE basics: ${error.message}`);
        }
    }
    return allDes;
}

/**
 * Fetch detailed info (including fields) for a single DE
 * @param {string} deId - Data Extension ID
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @returns {Promise<Object>} DE details with fields
 */
export async function fetchDeDetails(deId, instance) {
    try {
        const API_BASE_URL = SFMCInstanceService.getApiBaseUrl(instance);
        const response = await fetch(`${API_BASE_URL}/internal/v1/customobjects/${deId}/fields`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch DE details: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        return null;
    }
}

/**
 * Generate file content based on format
 * @param {Object} deInfo - DE basic info
 * @param {Object} deDetails - DE details with fields
 * @param {string} format - 'json' or 'csv'
 * @returns {string} File content
 */
export function generateFileContent(deInfo, deDetails, format) {
    const fields = deDetails.fields || [];

    if (format === 'json') {
        const schema = {
            name: deInfo.name,
            customerKey: deInfo.customerKey,
            folderPath: deInfo.folderPath || 'Data Extensions',
            isSendable: deInfo.isSendable || false,
            isTestable: deInfo.isTestable || false,
            createdDate: deInfo.createdDate,
            modifiedDate: deInfo.modifiedDate,
            owner: deInfo.ownerName,
            rowCount: deInfo.rowCount || 0,
            fieldCount: fields.length,
            sendableAttribute: deInfo.sendableCustomObjectField || null,
            sendableRelation: deInfo.sendableSubscriberField || null,
            fields: fields.map(f => ({
                name: f.name,
                type: f.type,
                length: f.length,
                scale: f.scale || 0,
                isPrimaryKey: f.isPrimaryKey || false,
                isNullable: f.isNullable || !f.isPrimaryKey,
                description: f.description || '',
                defaultValue: f.defaultValue
            }))
        };
        return JSON.stringify(schema, null, 2);
    } else if (format === 'csv') {
        return fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(',');
    }
    return '';
}

