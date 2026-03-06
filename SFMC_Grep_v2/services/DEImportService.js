/**
 * DE Import Service
 * Shared service for importing Data Extensions
 * Extracted from popup/assets/data-export.js for reuse
 */

import { SFMCInstanceService } from '../utils/SFMCInstanceService.js';
import { CSRFService } from '../utils/CSRFService.js';
import { createDataExtension } from './DECreationService.js';

/**
 * Map data type from string to SFMC type ID
 * @param {string} typeString - Data type string
 * @returns {number} SFMC type ID
 */
export function mapDataType(typeString) {
    const typeMap = {
        "Text": 0,
        "Number": 1,
        "Date": 2,
        "Boolean": 3,
        "Email Address": 4,
        "EmailAddress": 4,
        "Phone": 5,
        "Decimal": 6,
        "Locale": 7
    };
    return typeMap[typeString] !== undefined ? typeMap[typeString] : 0;
}

/**
 * Check if a DE exists by name
 * @param {string} deName - Data Extension name
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @returns {Promise<Object|null>} Existing DE or null
 */
export async function checkDeExists(deName, instance) {
    try {
        const API_BASE_URL = SFMCInstanceService.getApiBaseUrl(instance);
        const encodedName = encodeURIComponent(deName);
        const endpoint = `/data-internal/v1/customobjects/category/0?retrievalType=1&$search=${encodedName}`;
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (!response.ok) {
            return null;
        }

        const result = await response.json();
        if (result && result.items && result.items.length > 0) {
            const exactMatch = result.items.find(item =>
                item.name.toLowerCase() === deName.toLowerCase()
            );
            return exactMatch || null;
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Import a single Data Extension
 * @param {Object} deData - DE data from import file
 * @param {string} folderId - Folder ID
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @returns {Promise<Object>} Created DE result
 */
export async function importDataExtension(deData, folderId, instance) {
    // Convert fields from export format to SFMC API format
    const fieldsArray = deData.fields.map((field, index) => ({
        name: field.name,
        ordinal: index,
        type: mapDataType(field.type),
        length: field.length || 50,
        scale: field.scale || 0,
        isPrimaryKey: field.isPrimaryKey || false,
        isNullable: field.isNullable !== undefined ? field.isNullable : !field.isPrimaryKey,
        defaultValue: field.defaultValue,
        isTemplateField: false,
        isHidden: false,
        isReadOnly: false,
        isOverridable: false,
        isInheritable: false,
        updatable: true,
        retrievable: true,
        isActive: true,
        mustOverride: false
    }));

    // Use the shared creation service
    return await createDataExtension(
        deData.name,
        fieldsArray,
        folderId,
        deData.isSendable || false,
        deData.isTestable || false,
        deData.sendableAttribute,
        deData.sendableRelation,
        instance
    );
}

