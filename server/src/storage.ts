import { AgentDetails, EntityType, RunRecord, SessionEntry, TeamDetails, User, ModelConfig } from './types.js'
import path from 'node:path'

import sqlite3 from 'sqlite3'
import { open, type Database } from 'sqlite'

type SessionKey = string

interface StoredSession {
  entry: SessionEntry
  runs: RunRecord[]
}

export interface Store {
  readonly agents: AgentDetails[]
  readonly teams: TeamDetails[]

  listSessions(args: {
    dbId: string
    entityType: EntityType
    componentId: string
  }): Promise<SessionEntry[]>

  getOrCreateSession(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId?: string
    sessionName: string
  }): Promise<{ sessionId: string; entry: SessionEntry }>

  appendRun(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
    run: RunRecord
  }): Promise<void>

  getRuns(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
  }): Promise<RunRecord[]>

  deleteSession(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
  }): Promise<boolean>

  // User management
  createUser(email: string, name: string, hashedPassword: string): Promise<User>
  getUserByEmail(email: string): Promise<User | null>
  getUserById(id: string): Promise<User | null>
  updateUserLastLogin(id: string): Promise<void>
  getUserCount(): Promise<number>

  // Model configuration
  saveModelConfig(agentId: string, modelConfig: ModelConfig): Promise<void>
  getModelConfig(agentId: string): Promise<ModelConfig | null>
  validateModelConfig(modelConfig: ModelConfig): Promise<boolean>
  deleteModelConfig(agentId: string): Promise<void>
}

function makeSessionKey(args: {
  dbId: string
  entityType: EntityType
  componentId: string
  sessionId: string
}): SessionKey {
  return `${args.dbId}::${args.entityType}::${args.componentId}::${args.sessionId}`
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export class InMemoryStore implements Store {
  readonly agents: AgentDetails[]
  readonly teams: TeamDetails[]

  private readonly sessionsByListKey: Map<string, SessionEntry[]> = new Map()
  private readonly sessionsByKey: Map<SessionKey, StoredSession> = new Map()

  private users: User[] = []

  constructor() {
    const rootDir = path.resolve(process.cwd(), '..')
    this.agents = [
      {
        id: 'agent_echo',
        name: 'Echo Agent',
        db_id: 'db_echo',
        model: { provider: 'mock', model: 'echo', name: 'Mock Echo' },
        base_dir: rootDir
      },
      {
        id: 'agent_ui',
        name: 'UI Agent',
        db_id: 'db_ui',
        model: { provider: 'mock', model: 'echo', name: 'Mock Echo' },
        base_dir: path.join(rootDir, 'ui')
      },
      {
        id: 'agent_server',
        name: 'Server Agent',
        db_id: 'db_server',
        model: { provider: 'mock', model: 'echo', name: 'Mock Echo' },
        base_dir: path.join(rootDir, 'server')
      },
      {
        id: 'agent_runner',
        name: 'Runner Agent',
        db_id: 'db_runner',
        model: { provider: 'mock', model: 'echo', name: 'Mock Echo' },
        base_dir: path.join(rootDir, 'runner')
      }
    ]

    this.teams = [
      {
        id: 'team_echo',
        name: 'Echo Team',
        db_id: 'db_team_echo',
        model: { provider: 'mock', model: 'echo', name: 'Mock Echo' }
      }
    ]
  }

  async listSessions(args: {
    dbId: string
    entityType: EntityType
    componentId: string
  }): Promise<SessionEntry[]> {
    const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`
    return this.sessionsByListKey.get(listKey) ?? []
  }

  async getOrCreateSession(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId?: string
    sessionName: string
  }): Promise<{ sessionId: string; entry: SessionEntry }> {
    const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`

    const sessionId = (args.sessionId && args.sessionId.trim()) || `s_${Date.now()}`
    const key = makeSessionKey({
      dbId: args.dbId,
      entityType: args.entityType,
      componentId: args.componentId,
      sessionId
    })

    const existing = this.sessionsByKey.get(key)
    if (existing) return { sessionId, entry: existing.entry }

    const entry: SessionEntry = {
      session_id: sessionId,
      session_name: args.sessionName,
      created_at: nowSeconds()
    }

    this.sessionsByKey.set(key, { entry, runs: [] })

    const current = this.sessionsByListKey.get(listKey) ?? []
    this.sessionsByListKey.set(listKey, [entry, ...current])

    return { sessionId, entry }
  }

  async appendRun(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
    run: RunRecord
  }): Promise<void> {
    const key = makeSessionKey({
      dbId: args.dbId,
      entityType: args.entityType,
      componentId: args.componentId,
      sessionId: args.sessionId
    })

    const session = this.sessionsByKey.get(key)
    if (!session) {
      // Session not found: create a minimal placeholder so UI doesn't break
      const entry: SessionEntry = {
        session_id: args.sessionId,
        session_name: 'Session',
        created_at: nowSeconds()
      }
      this.sessionsByKey.set(key, { entry, runs: [args.run] })
      return
    }

    session.runs.push(args.run)
    session.entry.updated_at = nowSeconds()
  }

  async getRuns(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
  }): Promise<RunRecord[]> {
    const key = makeSessionKey({
      dbId: args.dbId,
      entityType: args.entityType,
      componentId: args.componentId,
      sessionId: args.sessionId
    })
    return this.sessionsByKey.get(key)?.runs ?? []
  }

  async deleteSession(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
  }): Promise<boolean> {
    const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`
    const key = makeSessionKey({
      dbId: args.dbId,
      entityType: args.entityType,
      componentId: args.componentId,
      sessionId: args.sessionId
    })

    const existed = this.sessionsByKey.delete(key)
    if (!existed) return false

    const current = this.sessionsByListKey.get(listKey) ?? []
    this.sessionsByListKey.set(
      listKey,
      current.filter((s) => s.session_id !== args.sessionId)
    )
    return true
  }

  async createUser(email: string, name: string, hashedPassword: string): Promise<User> {
    const createdAt = nowSeconds();
    const role = (await this.getUserCount()) === 0 ? 'admin' : 'user';
    const id = (this.users.length + 1).toString();
    const user: User = { id, email, name, role, created_at: createdAt };
    this.users.push(user);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.users.find(user => user.email === email) || null;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.find(user => user.id === id) || null;
  }

  async updateUserLastLogin(id: string): Promise<void> {
    const user = this.users.find(user => user.id === id);
    if (user) {
      user.last_login_at = nowSeconds();
    }
  }

  async getUserCount(): Promise<number> {
    return this.users.length;
  }

  async saveModelConfig(agentId: string, modelConfig: ModelConfig): Promise<void> {
    // No-op in InMemoryStore
  }

  async getModelConfig(agentId: string): Promise<ModelConfig | null> {
    return null
  }

  async validateModelConfig(modelConfig: ModelConfig): Promise<boolean> {
    // Example validation logic, can be extended as needed
    if (!modelConfig.provider || !modelConfig.model || !modelConfig.name) {
      return false;
    }
    return true;
  }

  async deleteModelConfig(agentId: string): Promise<void> {
    // No-op in InMemoryStore
  }
}

export class SqliteStore implements Store {
  readonly agents: AgentDetails[]
  readonly teams: TeamDetails[]

  private readonly db: Database

  private constructor(db: Database) {
    this.db = db

    this.agents = [
      {
        id: 'agent_echo',
        name: 'Echo Agent',
        db_id: 'db_echo',
        model: { provider: 'mock', model: 'echo', name: 'Mock Echo' }
      }
    ]

    this.teams = [
      {
        id: 'team_echo',
        name: 'Echo Team',
        db_id: 'db_team_echo',
        model: { provider: 'mock', model: 'echo', name: 'Mock Echo' }
      }
    ]
  }

  static async create(sqlitePath: string): Promise<SqliteStore> {
    const db = await open({
      filename: sqlitePath,
      driver: sqlite3.Database
    })

    await db.exec(
      [
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
        'CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);',
        'CREATE TABLE IF NOT EXISTS agents (',
        '  id TEXT PRIMARY KEY,',
        '  name TEXT NOT NULL,',
        '  db_id TEXT NOT NULL,',
        '  model_provider TEXT NOT NULL,',
        '  model_name TEXT NOT NULL,',
        '  model TEXT NOT NULL',
        ');',
        'CREATE INDEX IF NOT EXISTS agents_name_idx ON agents (name);'
      ].join('\n')
    )

    return new SqliteStore(db)
  }

  async listSessions(args: {
    dbId: string
    entityType: EntityType
    componentId: string
  }): Promise<SessionEntry[]> {
    const rows = await this.db.all<
      Array<{ session_id: string; session_name: string; created_at: number; updated_at: number | null }>
    >(
      'SELECT session_id, session_name, created_at, updated_at FROM sessions WHERE db_id = ? AND entity_type = ? AND component_id = ? ORDER BY created_at DESC',
      args.dbId,
      args.entityType,
      args.componentId
    )

    return rows.map((r: { session_id: string; session_name: string; created_at: number; updated_at: number | null }) => ({
      session_id: r.session_id,
      session_name: r.session_name,
      created_at: r.created_at,
      ...(r.updated_at ? { updated_at: r.updated_at } : {})
    }))
  }

  async getOrCreateSession(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId?: string
    sessionName: string
  }): Promise<{ sessionId: string; entry: SessionEntry }> {
    const sessionId = (args.sessionId && args.sessionId.trim()) || `s_${Date.now()}`

    const existing = await this.db.get<
      { session_id: string; session_name: string; created_at: number; updated_at: number | null } | undefined
    >(
      'SELECT session_id, session_name, created_at, updated_at FROM sessions WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?',
      args.dbId,
      args.entityType,
      args.componentId,
      sessionId
    )

    if (existing) {
      return {
        sessionId,
        entry: {
          session_id: existing.session_id,
          session_name: existing.session_name,
          created_at: existing.created_at,
          ...(existing.updated_at ? { updated_at: existing.updated_at } : {})
        }
      }
    }

    const entry: SessionEntry = {
      session_id: sessionId,
      session_name: args.sessionName,
      created_at: nowSeconds()
    }

    await this.db.run(
      'INSERT INTO sessions (db_id, entity_type, component_id, session_id, session_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args.dbId,
      args.entityType,
      args.componentId,
      entry.session_id,
      entry.session_name,
      entry.created_at
    )

    return { sessionId, entry }
  }

  async appendRun(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
    run: RunRecord
  }): Promise<void> {
    const createdAt = args.run.created_at ?? nowSeconds()
    const contentJson = args.run.content === undefined ? null : JSON.stringify(args.run.content)
    const runInput = args.run.run_input ?? null

    await this.db.run(
      'INSERT INTO runs (db_id, entity_type, component_id, session_id, created_at, run_input, content_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args.dbId,
      args.entityType,
      args.componentId,
      args.sessionId,
      createdAt,
      runInput,
      contentJson
    )

    await this.db.run(
      'UPDATE sessions SET updated_at = ? WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?',
      nowSeconds(),
      args.dbId,
      args.entityType,
      args.componentId,
      args.sessionId
    )
  }

  async getRuns(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
  }): Promise<RunRecord[]> {
    const rows = await this.db.all<
      Array<{ created_at: number; run_input: string | null; content_json: string | null }>
    >(
      'SELECT created_at, run_input, content_json FROM runs WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ? ORDER BY created_at ASC, id ASC',
      args.dbId,
      args.entityType,
      args.componentId,
      args.sessionId
    )

    return rows.map((r: { created_at: number; run_input: string | null; content_json: string | null }) => ({
      created_at: r.created_at,
      ...(r.run_input != null ? { run_input: r.run_input } : {}),
      ...(r.content_json != null ? { content: safeJsonParse(r.content_json) as string | object } : {})
    }))
  }

  async deleteSession(args: {
    dbId: string
    entityType: EntityType
    componentId: string
    sessionId: string
  }): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM sessions WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?',
      args.dbId,
      args.entityType,
      args.componentId,
      args.sessionId
    )

    await this.db.run(
      'DELETE FROM runs WHERE db_id = ? AND entity_type = ? AND component_id = ? AND session_id = ?',
      args.dbId,
      args.entityType,
      args.componentId,
      args.sessionId
    )

    return (result.changes ?? 0) > 0
  }

  async createUser(email: string, name: string, hashedPassword: string): Promise<User> {
    const createdAt = nowSeconds()
    const role = (await this.getUserCount()) === 0 ? 'admin' : 'user'
    const result = await this.db.run(
      `INSERT INTO users (email, name, hashed_password, role, created_at) VALUES (?, ?, ?, ?, ?)`,
      email,
      name,
      hashedPassword,
      role,
      createdAt
    )
    return {
      id: result.lastID?.toString() || "0",
      email,
      name,
      role,
      created_at: createdAt
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = await this.db.get<User>(`SELECT * FROM users WHERE email = ?`, email)
    return row || null
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await this.db.get<User>(`SELECT * FROM users WHERE id = ?`, id)
    return row || null
  }

  async updateUserLastLogin(id: string): Promise<void> {
    const lastLoginAt = nowSeconds()
    await this.db.run(`UPDATE users SET last_login_at = ? WHERE id = ?`, lastLoginAt, id)
  }

  async getUserCount(): Promise<number> {
    const row = await this.db.get<{ count: number }>(`SELECT COUNT(*) as count FROM users`)
    return row?.count || 0
  }

  async saveModelConfig(agentId: string, modelConfig: ModelConfig): Promise<void> {
    console.log('saveModelConfig called with:', { agentId, modelConfig });
    try {
        const query = `INSERT INTO agents (id, name, model, provider, apiKey, db_id) VALUES (?, ?, ?, ?, ?, ?)`;
        const params = [agentId, modelConfig.name, modelConfig.model, modelConfig.provider, modelConfig.apiKey, modelConfig.db_id];
        console.log('Executing query:', query, 'with params:', params);
        await this.db.run(query, params);
        console.log('Query executed successfully');
    } catch (error) {
        console.error('Error in saveModelConfig:', error);
        throw error;
    }
  }

  async getModelConfig(agentId: string): Promise<ModelConfig | null> {
    console.log(`Fetching model config for agentId: ${agentId}`);
    const query = `SELECT model FROM agents WHERE id = ?`;
    console.log(`Executing query: ${query}`);
    const row = await this.db.get(query, agentId);
    console.log(`Fetched row:`, row);
    return row ? JSON.parse(row.model) : null;
  }

  async validateModelConfig(modelConfig: ModelConfig): Promise<boolean> {
    console.log(`Validating model config:`, modelConfig);
    // Example validation logic, can be extended as needed
    if (!modelConfig.provider || !modelConfig.model || !modelConfig.name) {
      console.log(`Validation failed: Missing required fields.`);
      return false;
    }
    console.log(`Validation successful.`);
    return true;
  }

  async deleteModelConfig(agentId: string): Promise<void> {
    console.log(`Deleting model config for agentId: ${agentId}`);
    const result = await this.db.run(
      `DELETE FROM agents WHERE id = ?`,
      agentId
    );
    console.log(`Delete result:`, result);
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
