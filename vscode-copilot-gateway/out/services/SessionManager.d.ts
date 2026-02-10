import * as vscode from 'vscode';
import { SessionData, ChatMessage } from '../types';
export declare class SessionManager {
    private sessions;
    private context;
    private maxHistory;
    constructor(context: vscode.ExtensionContext);
    createSession(userId?: string): Promise<string>;
    getSession(sessionId: string): Promise<SessionData | null>;
    updateSession(sessionId: string, messages: ChatMessage[]): Promise<void>;
    addMessage(sessionId: string, message: ChatMessage): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
    getAllSessions(): Promise<SessionData[]>;
    getUserSessions(userId: string): Promise<SessionData[]>;
    clearOldSessions(maxAge?: number): Promise<void>;
    private persistSessions;
    private loadPersistedSessions;
    dispose(): void;
}
//# sourceMappingURL=SessionManager.d.ts.map