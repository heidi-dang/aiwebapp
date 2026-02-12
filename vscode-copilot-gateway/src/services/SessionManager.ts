import * as vscode from 'vscode';
import { SessionData, ChatMessage } from '../types';

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private context: vscode.ExtensionContext;
  private maxHistory: number;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    const config = vscode.workspace.getConfiguration('heidi-gateway-proxy.session');
    this.maxHistory = config.get('maxHistory', 100);

    // Load persisted sessions
    this.loadPersistedSessions();
  }

  async createSession(userId?: string): Promise<string> {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    const session: SessionData = {
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

  async getSession(sessionId: string): Promise<SessionData | null> {
    return this.sessions.get(sessionId) || null;
  }

  async updateSession(sessionId: string, messages: ChatMessage[]): Promise<void> {
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

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
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

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    await this.persistSessions();
  }

  async getAllSessions(): Promise<SessionData[]> {
    return Array.from(this.sessions.values());
  }

  async getUserSessions(userId: string): Promise<SessionData[]> {
    return Array.from(this.sessions.values()).filter(session => session.user_id === userId);
  }

  async clearOldSessions(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - maxAge;
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.updated_at < cutoff) {
        toDelete.push(sessionId);
      }
    }

    toDelete.forEach(id => this.sessions.delete(id));
    await this.persistSessions();
  }

  private async persistSessions(): Promise<void> {
    try {
      const sessionsData = Array.from(this.sessions.entries());
      await this.context.globalState.update('aiwebapp-copilot-sessions', sessionsData);
    } catch (error) {
      console.error('Failed to persist sessions:', error);
    }
  }

  private async loadPersistedSessions(): Promise<void> {
    try {
      const sessionsData = this.context.globalState.get('aiwebapp-copilot-sessions') as [string, SessionData][] | undefined;
      if (sessionsData) {
        this.sessions = new Map(sessionsData);
        console.log(`Loaded ${this.sessions.size} persisted sessions`);
      }
    } catch (error) {
      console.error('Failed to load persisted sessions:', error);
    }
  }

  dispose(): void {
    // Clean up resources if needed
  }
}
