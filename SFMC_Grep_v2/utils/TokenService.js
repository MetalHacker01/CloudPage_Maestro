// utils/TokenService.js — SGv2 shim
// JWT/session token system removed. Auth is handled by webRequest CSRF capture.
// This shim keeps existing handler imports working without breaking anything.

export class TokenService {
    static async getToken() { return null; }
    static async setToken(token) {}
    static async removeToken() {}
}
