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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const vscode = __importStar(require("vscode"));
class SessionManager {
    constructor(context) {
        this.sessions = new Map();
        this.context = context;
        const config = vscode.workspace.getConfiguration('heidi-gateway-proxy.session');
        this.maxHistory = config.get('maxHistory', 100);
        // Load persisted sessions
        this.loadPersistedSessions();
    }
    async createSession(userId) {
        const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        const session = {
            id: sessionId,
            user_id: userId,
            messages: [],
            created_at: Date.now(),
            updated_at: Date.now(),
            metadata: {}
        };
        this.sessions.set(sessionId, session);
        await this.persistSessions();
        return sessionId;
    }
    async getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    async updateSession(sessionId, messages) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        // Update messages, keeping only the most recent ones
        session.messages = messages.slice(-this.maxHistory);
        session.updated_at = Date.now();
        this.sessions.set(sessionId, session);
        await this.persistSessions();
    }
    async addMessage(sessionId, message) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        session.messages.push(message);
        // Keep only the most recent messages
        if (session.messages.length > this.maxHistory) {
            session.messages = session.messages.slice(-this.maxHistory);
        }
        session.updated_at = Date.now();
        this.sessions.set(sessionId, session);
        await this.persistSessions();
    }
    async deleteSession(sessionId) {
        this.sessions.delete(sessionId);
        await this.persistSessions();
    }
    async getAllSessions() {
        return Array.from(this.sessions.values());
    }
    async getUserSessions(userId) {
        return Array.from(this.sessions.values()).filter(session => session.user_id === userId);
    }
    async clearOldSessions(maxAge = 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAge;
        const toDelete = [];
        for (const [sessionId, session] of this.sessions) {
            if (session.updated_at < cutoff) {
                toDelete.push(sessionId);
            }
        }
        toDelete.forEach(id => this.sessions.delete(id));
        await this.persistSessions();
    }
    async persistSessions() {
        try {
            const sessionsData = Array.from(this.sessions.entries());
            await this.context.globalState.update('aiwebapp-copilot-sessions', sessionsData);
        }
        catch (error) {
            console.error('Failed to persist sessions:', error);
        }
    }
    async loadPersistedSessions() {
        try {
            const sessionsData = this.context.globalState.get('aiwebapp-copilot-sessions');
            if (sessionsData) {
                this.sessions = new Map(sessionsData);
                console.log(`Loaded ${this.sessions.size} persisted sessions`);
            }
        }
        catch (error) {
            console.error('Failed to load persisted sessions:', error);
        }
    }
    dispose() {
        // Clean up resources if needed
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=SessionManager.js.map