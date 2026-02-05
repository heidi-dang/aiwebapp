import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
function makeSessionKey(args) {
    return `${args.dbId}::${args.entityType}::${args.componentId}::${args.sessionId}`;
}
function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}
export class InMemoryStore {
    agents;
    teams;
    sessionsByListKey = new Map();
    sessionsByKey = new Map();
    users = [];
    constructor() {
        this.agents = [
            {
                id: 'agent_echo',
                name: 'Echo Agent',
                db_id: 'db_echo',
                model: { provider: 'mock', model: 'echo', name: 'Mock Echo' }
            }
        ];
        this.teams = [
            {
                id: 'team_echo',
                name: 'Echo Team',
                db_id: 'db_team_echo',
                model: { provider: 'mock', model: 'echo', name: 'Mock Echo' }
            }
        ];
    }
    async listSessions(args) {
        const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`;
        return this.sessionsByListKey.get(listKey) ?? [];
    }
    async getOrCreateSession(args) {
        const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`;
        const sessionId = (args.sessionId && args.sessionId.trim()) || `s_${Date.now()}`;
        const key = makeSessionKey({
            dbId: args.dbId,
            entityType: args.entityType,
            componentId: args.componentId,
            sessionId
        });
        const existing = this.sessionsByKey.get(key);
        if (existing)
            return { sessionId, entry: existing.entry };
        const entry = {
            session_id: sessionId,
            session_name: args.sessionName,
            created_at: nowSeconds()
        };
        this.sessionsByKey.set(key, { entry, runs: [] });
        const current = this.sessionsByListKey.get(listKey) ?? [];
        this.sessionsByListKey.set(listKey, [entry, ...current]);
        return { sessionId, entry };
    }
    async appendRun(args) {
        const key = makeSessionKey({
            dbId: args.dbId,
            entityType: args.entityType,
            componentId: args.componentId,
            sessionId: args.sessionId
        });
        const session = this.sessionsByKey.get(key);
        if (!session) {
            // Session not found: create a minimal placeholder so UI doesn't break
            const entry = {
                session_id: args.sessionId,
                session_name: 'Session',
                created_at: nowSeconds()
            };
            this.sessionsByKey.set(key, { entry, runs: [args.run] });
            return;
        }
        session.runs.push(args.run);
        session.entry.updated_at = nowSeconds();
    }
    async getRuns(args) {
        const key = makeSessionKey({
            dbId: args.dbId,
            entityType: args.entityType,
            componentId: args.componentId,
            sessionId: args.sessionId
        });
        return this.sessionsByKey.get(key)?.runs ?? [];
    }
    async deleteSession(args) {
        const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`;
        const key = makeSessionKey({
            dbId: args.dbId,
            entityType: args.entityType,
            componentId: args.componentId,
            sessionId: args.sessionId
        });
        const existed = this.sessionsByKey.delete(key);
        if (!existed)
            return false;
        const current = this.sessionsByListKey.get(listKey) ?? [];
        this.sessionsByListKey.set(listKey, current.filter((s) => s.session_id !== args.sessionId));
        return true;
    }
    async createUser(email, name, hashedPassword) {
        const createdAt = nowSeconds();
        const role = (await this.getUserCount()) === 0 ? 'admin' : 'user';
        const id = (this.users.length + 1).toString();
        const user = { id, email, name, role, created_at: createdAt };
        this.users.push(user);
        return user;
    }
    async getUserByEmail(email) {
        return this.users.find(user => user.email === email) || null;
    }
    async getUserById(id) {
        return this.users.find(user => user.id === id) || null;
    }
    async updateUserLastLogin(id) {
        const user = this.users.find(user => user.id === id);
        if (user) {
            user.last_login_at = nowSeconds();
        }
    }
    async getUserCount() {
        return this.users.length;
    }
}
export class SqliteStore {
    agents;
    teams;
    db;
    constructor(db) {
        this.db = db;
        this.agents = [
            {
                id: 'agent_echo',
                name: 'Echo Agent',
                db_id: 'db_echo',
                model: { provider: 'mock', model: 'echo', name: 'Mock Echo' }
            }
        ];
        this.teams = [
            {
                id: 'team_echo',
                name: 'Echo Team',
                db_id: 'db_team_echo',
                model: { provider: 'mock', model: 'echo', name: 'Mock Echo' }
            }
        ];
    }
    static async create(sqlitePath) {
        const db = await open({
            filename: sqlitePath,
            driver: sqlite3.Database
        });
        await db.exec([
            'PRAGMA journal_mode=WAL;',
            'PRAGMA foreign_keys=ON;',
            'CREATE TABLE IF NOT EXISTS sessions (',
            '  db_id TEXT NOT NULL,',
            '  entity_type TEXT NOT NULL,',
            '  component_id TEXT NOT NULL,',
            '  session_id TEXT NOT NULL,',
            '  session_name TEXT NOT NULL,',
            '  created_at INTEGER NOT NULL,',
            '  updated_at INTEGER,',
            '  PRIMARY KEY (db_id, entity_type, component_id, session_id)',
            ');',
            'CREATE INDEX IF NOT EXISTS sessions_list_idx ON sessions (db_id, entity_type, component_id, created_at DESC);',
            'CREATE TABLE IF NOT EXISTS runs (',
            '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
            '  db_id TEXT NOT NULL,',
            '  entity_type TEXT NOT NULL,',
            '  component_id TEXT NOT NULL,',
            '  session_id TEXT NOT NULL,',
            '  created_at INTEGER NOT NULL,',
            '  run_input TEXT,',
            '  content_json TEXT',
            ');',
            'CREATE INDEX IF NOT EXISTS runs_session_idx ON runs (db_id, entity_type, component_id, session_id, created_at ASC);',
            'CREATE TABLE IF NOT EXISTS users (',
            '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
            '  email TEXT NOT NULL UNIQUE,',
            '  name TEXT NOT NULL,',
            '  hashed_password TEXT NOT NULL,',
            '  role TEXT NOT NULL,',
            '  created_at INTEGER NOT NULL,',
            '  last_login_at INTEGER',
            ');',
            'CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);'
        ].join('\n'));
        return new SqliteStore(db);
    }
    async listSessions(args) {
        const rows = await this.db.all('SELECT session_id, session_name, created_at, updated_at FROM sessions WHERE db_id = ? AND entity_type = ? AND component_id = ? ORDER BY created_at DESC', args.dbId, args.entityType, args.componentId);
        return rows.map((r) => ({
            session_id: r.session_id,
            session_name: r.session_name,
            created_at: r.created_at,
            ...(r.updated_at ? { updated_at: r.updated_at } : {})
        }));
    }
    async getOrCreateSession(args) {
        const sessionId = (args.sessionId && args.sessionId.trim()) || `s_${Date.now()}`;
        const existing = await this.db.get('SELECT session_id, session_name, created_at, updated_at FROM sessions WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?', args.dbId, args.entityType, args.componentId, sessionId);
        if (existing) {
            return {
                sessionId,
                entry: {
                    session_id: existing.session_id,
                    session_name: existing.session_name,
                    created_at: existing.created_at,
                    ...(existing.updated_at ? { updated_at: existing.updated_at } : {})
                }
            };
        }
        const entry = {
            session_id: sessionId,
            session_name: args.sessionName,
            created_at: nowSeconds()
        };
        await this.db.run('INSERT INTO sessions (db_id, entity_type, component_id, session_id, session_name, created_at) VALUES (?, ?, ?, ?, ?, ?)', args.dbId, args.entityType, args.componentId, entry.session_id, entry.session_name, entry.created_at);
        return { sessionId, entry };
    }
    async appendRun(args) {
        const createdAt = args.run.created_at ?? nowSeconds();
        const contentJson = args.run.content === undefined ? null : JSON.stringify(args.run.content);
        const runInput = args.run.run_input ?? null;
        await this.db.run('INSERT INTO runs (db_id, entity_type, component_id, session_id, created_at, run_input, content_json) VALUES (?, ?, ?, ?, ?, ?, ?)', args.dbId, args.entityType, args.componentId, args.sessionId, createdAt, runInput, contentJson);
        await this.db.run('UPDATE sessions SET updated_at = ? WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?', nowSeconds(), args.dbId, args.entityType, args.componentId, args.sessionId);
    }
    async getRuns(args) {
        const rows = await this.db.all('SELECT created_at, run_input, content_json FROM runs WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC', args.dbId, args.entityType, args.componentId, args.sessionId);
        return rows.map((r) => ({
            created_at: r.created_at,
            ...(r.run_input != null ? { run_input: r.run_input } : {}),
            ...(r.content_json != null ? { content: safeJsonParse(r.content_json) } : {})
        }));
    }
    async deleteSession(args) {
        const result = await this.db.run('DELETE FROM sessions WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?', args.dbId, args.entityType, args.componentId, args.sessionId);
        await this.db.run('DELETE FROM runs WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?', args.dbId, args.entityType, args.componentId, args.sessionId);
        return (result.changes ?? 0) > 0;
    }
    async createUser(email, name, hashedPassword) {
        const createdAt = nowSeconds();
        const role = (await this.getUserCount()) === 0 ? 'admin' : 'user';
        const result = await this.db.run(`INSERT INTO users (email, name, hashed_password, role, created_at) VALUES (?, ?, ?, ?, ?)`, email, name, hashedPassword, role, createdAt);
        return {
            id: result.lastID?.toString() || "0",
            email,
            name,
            role,
            created_at: createdAt
        };
    }
    async getUserByEmail(email) {
        const row = await this.db.get(`SELECT * FROM users WHERE email = ?`, email);
        return row || null;
    }
    async getUserById(id) {
        const row = await this.db.get(`SELECT * FROM users WHERE id = ?`, id);
        return row || null;
    }
    async updateUserLastLogin(id) {
        const lastLoginAt = nowSeconds();
        await this.db.run(`UPDATE users SET last_login_at = ? WHERE id = ?`, lastLoginAt, id);
    }
    async getUserCount() {
        const row = await this.db.get(`SELECT COUNT(*) as count FROM users`);
        return row?.count || 0;
    }
}
function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
