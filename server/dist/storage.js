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
        const user = {
            id,
            email,
            name,
            password_hash: hashedPassword,
            email_verified: false,
            role,
            created_at: createdAt,
            updated_at: createdAt
        };
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
    async saveModelConfig(agentId, modelConfig) {
        // No-op in InMemoryStore
    }
    async getModelConfig(agentId) {
        return null;
    }
    async validateModelConfig(modelConfig) {
        // Example validation logic, can be extended as needed
        if (!modelConfig.provider || !modelConfig.model || !modelConfig.name) {
            return false;
        }
        return true;
    }
    async deleteModelConfig(agentId) {
        // No-op in InMemoryStore
    }
    // User sessions
    async createUserSession(userId, tokenHash, expiresAt) {
        const id = (this.userSessions?.length || 0) + 1;
        const session = {
            id: id.toString(),
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
            created_at: nowSeconds()
        };
        if (!this.userSessions)
            this.userSessions = [];
        this.userSessions.push(session);
        return session;
    }
    async getUserSessionByTokenHash(tokenHash) {
        const session = this.userSessions?.find((s) => s.token_hash === tokenHash) || null;
        if (!session)
            return null;
        if (session.expires_at <= nowSeconds())
            return null;
        return session;
    }
    async deleteUserSession(tokenHash) {
        if (!this.userSessions)
            return false;
        const index = this.userSessions.findIndex(session => session.token_hash === tokenHash);
        if (index >= 0) {
            this.userSessions.splice(index, 1);
            return true;
        }
        return false;
    }
    async deleteUserSessionsByUserId(userId) {
        if (!this.userSessions)
            return false;
        const initialLength = this.userSessions.length;
        this.userSessions = this.userSessions.filter(session => session.user_id !== userId);
        return this.userSessions.length < initialLength;
    }
    // Social accounts
    async createSocialAccount(userId, provider, providerId, providerData) {
        const id = (this.socialAccounts?.length || 0) + 1;
        const account = {
            id: id.toString(),
            user_id: userId,
            provider: provider,
            provider_id: providerId,
            provider_data: providerData,
            created_at: nowSeconds()
        };
        if (!this.socialAccounts)
            this.socialAccounts = [];
        this.socialAccounts.push(account);
        return account;
    }
    async getSocialAccountByProvider(provider, providerId) {
        return this.socialAccounts?.find(account => account.provider === provider && account.provider_id === providerId) || null;
    }
    async getSocialAccountsByUserId(userId) {
        return this.socialAccounts?.filter(account => account.user_id === userId) || [];
    }
    async deleteSocialAccount(id) {
        if (!this.socialAccounts)
            return false;
        const index = this.socialAccounts.findIndex(account => account.id === id);
        if (index >= 0) {
            this.socialAccounts.splice(index, 1);
            return true;
        }
        return false;
    }
    userSessions = [];
    socialAccounts = [];
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
            '  password_hash TEXT,',
            '  name TEXT,',
            '  avatar_url TEXT,',
            '  email_verified BOOLEAN DEFAULT FALSE,',
            '  role TEXT NOT NULL DEFAULT "user",',
            '  created_at INTEGER NOT NULL,',
            '  updated_at INTEGER NOT NULL,',
            '  last_login_at INTEGER',
            ');',
            'CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);',
            'CREATE TABLE IF NOT EXISTS user_sessions (',
            '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
            '  user_id INTEGER NOT NULL,',
            '  token_hash TEXT NOT NULL,',
            '  expires_at INTEGER NOT NULL,',
            '  created_at INTEGER NOT NULL,',
            '  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
            ');',
            'CREATE INDEX IF NOT EXISTS user_sessions_token_idx ON user_sessions (token_hash);',
            'CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);',
            'CREATE TABLE IF NOT EXISTS social_accounts (',
            '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
            '  user_id INTEGER NOT NULL,',
            '  provider TEXT NOT NULL,',
            '  provider_id TEXT NOT NULL,',
            '  provider_data TEXT,',
            '  created_at INTEGER NOT NULL,',
            '  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,',
            '  UNIQUE(provider, provider_id)',
            ');',
            'CREATE INDEX IF NOT EXISTS social_accounts_provider_idx ON social_accounts (provider, provider_id);',
            'CREATE INDEX IF NOT EXISTS social_accounts_user_idx ON social_accounts (user_id);',
            'CREATE TABLE IF NOT EXISTS agents (',
            '  id TEXT PRIMARY KEY,',
            '  name TEXT NOT NULL,',
            '  db_id TEXT NOT NULL,',
            '  user_id INTEGER,',
            '  model_provider TEXT NOT NULL,',
            '  model_name TEXT NOT NULL,',
            '  model TEXT NOT NULL',
            ');',
            'CREATE INDEX IF NOT EXISTS agents_name_idx ON agents (name);',
            'CREATE INDEX IF NOT EXISTS agents_user_idx ON agents (user_id);'
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
        const result = await this.db.run(`INSERT INTO users (email, name, password_hash, role, created_at, updated_at, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)`, email, name, hashedPassword, role, createdAt, createdAt, false);
        return {
            id: result.lastID?.toString() || "0",
            email,
            name,
            password_hash: hashedPassword,
            email_verified: false,
            role,
            created_at: createdAt,
            updated_at: createdAt
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
    async saveModelConfig(agentId, modelConfig) {
        console.log('saveModelConfig called with:', { agentId, modelConfig });
        try {
            const dbId = modelConfig.db_id ?? `db_${agentId}`;
            const query = `INSERT INTO agents (id, name, db_id, model_provider, model_name, model) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            db_id=excluded.db_id,
            model_provider=excluded.model_provider,
            model_name=excluded.model_name,
            model=excluded.model`;
            const params = [agentId, agentId, dbId, modelConfig.provider, modelConfig.name, JSON.stringify(modelConfig)];
            console.log('Executing query:', query, 'with params:', params);
            await this.db.run(query, params);
            console.log('Query executed successfully');
        }
        catch (error) {
            console.error('Error in saveModelConfig:', error);
            throw error;
        }
    }
    async getModelConfig(agentId) {
        console.log(`Fetching model config for agentId: ${agentId}`);
        const query = `SELECT model_provider, model_name, model FROM agents WHERE id = ?`;
        console.log(`Executing query: ${query}`);
        const row = await this.db.get(query, agentId);
        console.log(`Fetched row:`, row);
        if (!row)
            return null;
        const modelValue = row.model;
        if (typeof modelValue === 'string') {
            try {
                const parsed = JSON.parse(modelValue);
                if (parsed && typeof parsed === 'object')
                    return parsed;
            }
            catch {
                // fall through
            }
        }
        const provider = row.model_provider;
        const name = row.model_name;
        const model = modelValue;
        if (typeof provider === 'string' && typeof name === 'string' && typeof model === 'string') {
            return { provider, name, model };
        }
        return null;
    }
    async validateModelConfig(modelConfig) {
        console.log(`Validating model config:`, modelConfig);
        // Example validation logic, can be extended as needed
        if (!modelConfig.provider || !modelConfig.model || !modelConfig.name) {
            console.log(`Validation failed: Missing required fields.`);
            return false;
        }
        console.log(`Validation successful.`);
        return true;
    }
    async deleteModelConfig(agentId) {
        console.log(`Deleting model config for agentId: ${agentId}`);
        const result = await this.db.run(`DELETE FROM agents WHERE id = ?`, agentId);
        console.log(`Delete result:`, result);
    }
    // User sessions
    async createUserSession(userId, tokenHash, expiresAt) {
        const createdAt = nowSeconds();
        const result = await this.db.run(`INSERT INTO user_sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`, userId, tokenHash, expiresAt, createdAt);
        return {
            id: result.lastID?.toString() || "0",
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
            created_at: createdAt
        };
    }
    async getUserSessionByTokenHash(tokenHash) {
        const row = await this.db.get(`SELECT * FROM user_sessions WHERE token_hash = ? AND expires_at > ?`, tokenHash, nowSeconds());
        return row || null;
    }
    async deleteUserSession(tokenHash) {
        const result = await this.db.run(`DELETE FROM user_sessions WHERE token_hash = ?`, tokenHash);
        return (result.changes ?? 0) > 0;
    }
    async deleteUserSessionsByUserId(userId) {
        const result = await this.db.run(`DELETE FROM user_sessions WHERE user_id = ?`, userId);
        return (result.changes ?? 0) > 0;
    }
    // Social accounts
    async createSocialAccount(userId, provider, providerId, providerData) {
        const createdAt = nowSeconds();
        const result = await this.db.run(`INSERT INTO social_accounts (user_id, provider, provider_id, provider_data, created_at) VALUES (?, ?, ?, ?, ?)`, userId, provider, providerId, providerData, createdAt);
        return {
            id: result.lastID?.toString() || "0",
            user_id: userId,
            provider: provider,
            provider_id: providerId,
            provider_data: providerData,
            created_at: createdAt
        };
    }
    async getSocialAccountByProvider(provider, providerId) {
        const row = await this.db.get(`SELECT * FROM social_accounts WHERE provider = ? AND provider_id = ?`, provider, providerId);
        return row || null;
    }
    async getSocialAccountsByUserId(userId) {
        const rows = await this.db.all(`SELECT * FROM social_accounts WHERE user_id = ? ORDER BY created_at DESC`, userId);
        return rows || [];
    }
    async deleteSocialAccount(id) {
        const result = await this.db.run(`DELETE FROM social_accounts WHERE id = ?`, id);
        return (result.changes ?? 0) > 0;
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
