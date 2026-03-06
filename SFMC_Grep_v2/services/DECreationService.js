/**
 * DE Creation Service
 * Shared service for creating Data Extensions
 * Extracted from popup/assets/data-handler.js for reuse
 */

import { SFMCInstanceService } from '../utils/SFMCInstanceService.js';
import { CSRFService } from '../utils/CSRFService.js';

/**
 * Create a Data Extension
 * @param {string} deName - Data Extension name
 * @param {Array} fields - Array of field objects
 * @param {string} folderId - Folder ID (default: "0")
 * @param {boolean} isSendable - Whether DE is sendable
 * @param {boolean} isTestable - Whether DE is testable
 * @param {string} sendableField - Sendable field name (if sendable)
 * @param {string} subscriberField - Subscriber field name (if sendable)
 * @param {string} instance - SFMC instance (e.g., 'mc.s50')
 * @returns {Promise<Object>} Created DE result with id
 */
export async function createDataExtension(deName, fields, folderId = "0", isSendable = false, isTestable = false, sendableField = null, subscriberField = null, instance = null) {
    if (!instance) {
        instance = await SFMCInstanceService.getInstance();
    }
    
    // Ensure full instance format
    if (!instance.startsWith('mc.')) {
        instance = `mc.${instance}`;
    }

    const csrfToken = await CSRFService.getTokenSimple(instance);
    const apiUrl = `https://${instance}.marketingcloudapps.com/contactsmeta/fuelapi/internal/v1/customobjects/`;

    // Normalize fields to match API requirements
    const normalizedFields = fields.map((field, index) => {
        const normalizedField = {
            name: field.name,
            ordinal: field.ordinal !== undefined ? field.ordinal : index,
            type: field.type !== undefined ? field.type : 0,
            length: field.length !== undefined ? field.length : (field.type === 0 ? 50 : 0),
            scale: field.scale !== undefined ? field.scale : 0,
            isPrimaryKey: field.isPrimaryKey || false,
            isTemplateField: false,
            isHidden: false,
            isReadOnly: false,
            isOverridable: false,
            isInheritable: false,
            updatable: true,
            retrievable: true,
            isActive: true,
            mustOverride: false,
            isNullable: field.isNullable !== undefined ? field.isNullable : !field.isPrimaryKey
        };
        
        // Only add defaultValue if it exists and is not empty
        if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
            normalizedField.defaultValue = field.defaultValue;
        }
        
        return normalizedField;
    });

    const payload = {
        importActivity: {},
        name: deName,
        categoryID: folderId || "0",
        isSendable: isSendable || false,
        isTestable: isTestable || false,
        isActive: true,
        status: 0,
        isObjectDeletable: true,
        isFieldAdditionAllowed: true,
        isFieldModificationAllowed: true,
        fields: normalizedFields
    };

    if (isSendable) {
        if (!sendableField || sendableField.trim() === '') {
            throw new Error('SendableCustomObjectField cannot be blank when creating a sendable Data Extension');
        }
        if (!subscriberField || subscriberField.trim() === '') {
            throw new Error('SendableSubscriberField cannot be blank when creating a sendable Data Extension');
        }
        payload.sendableCustomObjectField = sendableField.trim();
        payload.sendableSubscriberField = subscriberField.trim();
        payload.SendAttributeStorageName = sendableField.trim();
        payload.SendContactKeyStorageName = subscriberField.trim();
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Failed to create DE: ${response.status}`);
    }

    const result = await response.json();
    return result;
}

