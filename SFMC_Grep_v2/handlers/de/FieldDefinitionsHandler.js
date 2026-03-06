// handlers/de/FieldDefinitionsHandler.js
import { SFMCInstanceService } from '../../utils/SFMCInstanceService.js';
import { CSRFService } from '../../utils/CSRFService.js';
import { TabService } from '../../utils/TabService.js';

const debug = false;

/**
 * Handle fetching field definitions for a Data Extension.
 * @param {Object} request - Contains deId
 * @param {Function} sendResponse 
 */
export async function handleFetchFieldDefinitions(request, sendResponse) {
    const { deId } = request;
    if (!deId) {
        sendResponse({ success: false, error: 'Missing DE ID' });
        return;
    }

    const INSTANCE = await SFMCInstanceService.getInstance();
    const url = `https://${INSTANCE}.marketingcloudapps.com/contactsmeta/fuelapi/internal/v1/customobjects/${deId}/fields`;

    try {
        // Get CSRF token for consistency
        const csrfToken = await CSRFService.getToken(INSTANCE);

        const response = await fetch(url, {
            headers: {
                "accept": "application/json",
                "x-csrf-token": csrfToken
            },
            method: "GET",
            credentials: "include" // Crucial for using browser cookies
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch field definitions: ${response.status}`);
        }

        const data = await response.json();
        sendResponse({ success: true, data: data });
    } catch (error) {
        if (debug) console.error("Error fetching field definitions:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handle updating field definitions for a Data Extension.
 * @param {Object} request - Contains deId, instance, and fields array
 * @param {Function} sendResponse 
 */
export async function handleUpdateFieldDefinitions(request, sendResponse) {
    const { deId, fields } = request;
    if (!deId || !fields || !Array.isArray(fields)) {
        sendResponse({ success: false, error: 'Missing DE ID or fields data' });
        return;
    }

    // Determine SFMC instance and API base URL (adapted from data-handler.js)
    const INSTANCE = await SFMCInstanceService.getInstance();
    const url = `https://${INSTANCE}.marketingcloudapps.com/contactsmeta/fuelapi/data-internal/v1/customobjectsasync/${deId}/fields`;

    try {
        // Get CSRF token
        const csrfToken = await CSRFService.getToken(INSTANCE);

        // Build form data for the PATCH request
        const formData = new URLSearchParams();
        formData.append('id', deId);

        // Type mapping from data-handler.js
        const dataTypeMap = {
            "Text": 0,
            "Number": 1,
            "Date": 2,
            "Boolean": 3,
            "EmailAddress": 4,
            "Phone": 5,
            "Decimal": 6,
            "Locale": 7
        };

        fields.forEach((field, index) => {
            const prefix = `fields[${index}]`;
            const typeCode = dataTypeMap[field.type] !== undefined ? dataTypeMap[field.type] : 0;

            formData.append(`${prefix}[id]`, field.id);
            formData.append(`${prefix}[name]`, field.name);
            formData.append(`${prefix}[type]`, typeCode.toString());
            formData.append(`${prefix}[length]`, field.length.toString());
            formData.append(`${prefix}[defaultValue]`, field.defaultValue || '');
            formData.append(`${prefix}[isPrimaryKey]`, field.isPrimaryKey.toString());
            formData.append(`${prefix}[isNullable]`, field.isNullable.toString());
            formData.append(`${prefix}[storageType]`, '1'); // Plain storage type
            formData.append(`${prefix}[maskType]`, '0'); // None mask type
            formData.append(`${prefix}[isActive]`, field.isActive.toString());

            // Add ordinal if provided
            if (field.ordinal) {
                formData.append(`${prefix}[ordinal]`, field.ordinal.toString());
            }
        });

        if (debug) {
            console.log('Field update form data:', formData.toString());
            console.log('Field update URL:', url);
        }

        let response = await fetch(url, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "accept": "*/*",
                "x-requested-with": "XMLHttpRequest",
                "x-csrf-token": csrfToken
            },
            method: "PATCH",
            credentials: "include", // Crucial for using browser cookies
            body: formData.toString()
        });

        // If 401, try refreshing CSRF token and retry once
        if (response.status === 401) {
            if (debug) console.log('401 error, refreshing CSRF token and retrying...');
            CSRFService.clearCache();
            const newCsrfToken = await CSRFService.getToken(INSTANCE);

            response = await fetch(url, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "accept": "*/*",
                    "x-requested-with": "XMLHttpRequest",
                    "x-csrf-token": newCsrfToken
                },
                method: "PATCH",
                credentials: "include",
                body: formData.toString()
            });
        }

        // 202 Accepted is the expected response for async operations
        if (response.status === 202 || response.ok) {
            // Extract activity ID from response headers or body
            const location = response.headers.get('location');
            let activityId = null;

            if (location) {
                // Extract ID from location header (e.g., /async/activity/12345)
                const match = location.match(/\/async\/activity\/([^\/]+)/);
                if (match) {
                    activityId = match[1];
                }
            }

            // If no location header, try to extract from response body
            if (!activityId) {
                try {
                    const responseText = await response.text();
                    const idMatch = responseText.match(/"([a-f0-9-]{36})"/);
                    if (idMatch) {
                        activityId = idMatch[1];
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }

            sendResponse({
                success: true,
                message: 'Field definitions update initiated',
                activityId: activityId
            });
        } else {
            const errorText = await response.text();
            throw new Error(`Failed to update field definitions: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        if (debug) console.error("Error updating field definitions:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handles creating new field definitions
 */
export async function handleCreateFieldDefinitions(request, sendResponse) {
    const { deId, fields } = request;
    if (!deId || !fields || !Array.isArray(fields)) {
        sendResponse({ success: false, error: 'Missing DE ID or fields data' });
        return;
    }

    // Determine SFMC instance and API base URL
    const INSTANCE = await SFMCInstanceService.getInstance();
    const url = `https://${INSTANCE}.marketingcloudapps.com/contactsmeta/fuelapi/data-internal/v1/customobjectsasync/${deId}/fields`;

    try {
        // Get CSRF token
        const csrfToken = await CSRFService.getToken(INSTANCE);

        // Build JSON payload for the POST request
        const payload = {
            id: deId,
            fields: fields.map(field => ({
                name: field.name,
                storageType: 1, // Plain storage type
                type: field.type.toLowerCase(), // SFMC expects lowercase type names
                maskType: 0, // None mask type
                length: field.length,
                defaultValue: field.defaultValue || '',
                isNullable: field.isNullable,
                isActive: field.isActive !== false,
                isTemplateField: false,
                isHidden: false,
                isReadOnly: false,
                isInheritable: false,
                isOverridable: false,
                isPrimaryKey: field.isPrimaryKey,
                mustOverride: false,
                ordinal: field.ordinal
            }))
        };

        console.log('Field creation payload:', payload);

        if (debug) {
            console.log('Field creation payload:', JSON.stringify(payload, null, 2));
            console.log('Field creation URL:', url);
        }

        let response = await fetch(url, {
            headers: {
                "accept": "application/json, text/javascript, */*; q=0.01",
                "authorization": "Bearer 0073735963",
                "content-type": "application/json",
                "x-csrf-token": csrfToken,
                "x-requested-with": "XMLHttpRequest"
            },
            method: "POST",
            credentials: "include",
            body: JSON.stringify(payload)
        });

        // If 401, try refreshing CSRF token and retry once
        if (response.status === 401) {
            if (debug) console.log('401 error, refreshing CSRF token and retrying...');
            CSRFService.clearCache();
            const newCsrfToken = await CSRFService.getToken(INSTANCE);

            response = await fetch(url, {
                headers: {
                    "accept": "application/json, text/javascript, */*; q=0.01",
                    "authorization": "Bearer 0073735963",
                    "content-type": "application/json",
                    "x-csrf-token": newCsrfToken,
                    "x-requested-with": "XMLHttpRequest"
                },
                method: "POST",
                credentials: "include",
                body: JSON.stringify(payload)
            });
        }

        // 202 Accepted is the expected response for async operations
        if (response.status === 202 || response.ok) {
            // Extract activity ID from response headers or body
            const location = response.headers.get('location');
            let activityId = null;

            if (location) {
                // Extract ID from location header (e.g., /async/activity/12345)
                const match = location.match(/\/async\/activity\/([^\/]+)/);
                if (match) {
                    activityId = match[1];
                }
            }

            // If no location header, try to extract from response body
            if (!activityId) {
                try {
                    const responseText = await response.text();
                    const idMatch = responseText.match(/"([a-f0-9-]{36})"/);
                    if (idMatch) {
                        activityId = idMatch[1];
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }

            sendResponse({
                success: true,
                message: 'Field definitions creation initiated',
                activityId: activityId
            });
        } else {
            const errorText = await response.text();
            throw new Error(`Failed to create field definitions: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        if (debug) console.error("Error creating field definitions:", error);
        sendResponse({ success: false, error: error.message });
    }
}

