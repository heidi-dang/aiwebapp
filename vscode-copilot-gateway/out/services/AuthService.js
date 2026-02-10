"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
class AuthService {
    constructor() {
        const config = vscode.workspace.getConfiguration('aiwebapp-copilot-gateway.auth');
        this.authServiceUrl = config.get('serviceUrl', 'http://localhost:4003');
    }
    async validateToken(token) {
        try {
            const response = await axios_1.default.post(`${this.authServiceUrl}/auth/validate`, {}, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });
            if (response.data && response.data.valid) {
                return {
                    user_id: response.data.user_id,
                    session_id: response.data.session_id || '',
                    permissions: response.data.permissions || [],
                    expires_at: response.data.expires_at || 0
                };
            }
            else {
                throw new Error('Invalid token');
            }
        }
        catch (error) {
            console.error('Auth service validation error:', error);
            throw new Error('Authentication failed');
        }
    }
    async getUserProfile(userId) {
        try {
            const response = await axios_1.default.get(`${this.authServiceUrl}/auth/profile/${userId}`, {
                timeout: 5000
            });
            return response.data;
        }
        catch (error) {
            console.error('Failed to get user profile:', error);
            return null;
        }
    }
    async checkPermission(userId, permission) {
        try {
            const profile = await this.getUserProfile(userId);
            return profile && profile.permissions && profile.permissions.includes(permission);
        }
        catch (error) {
            console.error('Failed to check permission:', error);
            return false;
        }
    }
    dispose() {
        // Clean up any resources if needed
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map