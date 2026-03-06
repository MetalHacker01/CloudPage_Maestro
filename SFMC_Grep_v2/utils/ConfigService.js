// utils/ConfigService.js — SGv2 shim
// External API config (sfmc-intellitype.com) removed.
// Shim provided so existing handlers import without errors.

export class ConfigService {
    static API_BASE_URL = '';

    static getApiUrl(endpoint) {
        // No external API in v2; handlers that call this should use direct SFMC URLs instead
        console.warn('[SGv2] ConfigService.getApiUrl called — external API not configured in v2');
        return endpoint;
    }
}
