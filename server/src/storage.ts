import { AgentDetails, EntityType, RunRecord, SessionEntry, TeamDetails, User, ModelConfig } from './types.js'
import path from 'node:path'

import sqlite3 from 'sqlite3'
import { open, type Database } from 'sqlite'
import { sessionCache } from './session_cache.js'

type SessionKey = string

interface StoredSession {
  entry: SessionEntry
  runs: RunRecord[]
}

export interface Store {
  readonly agents: AgentDetails[]
  readonly teams: TeamDetails[]
  readonly toolbox: ToolDetails[]

  listSessions(args: {
    dbId: string
    entityType: EntityType
    componentId: string
  }): Promise<SessionEntry[]>

  listAllSessions(): Promise<SessionEntry[]>

  getSession(sessionId: string): Promise<SessionEntry | null>

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

  // Session naming
  updateSessionName(sessionId: string, name: string): Promise<void>
  shouldGenerateName(sessionId: string): Promise<boolean>

  // Session state
  getSessionState(sessionId: string): Promise<Record<string, any> | null>
  updateSessionState(sessionId: string, state: Record<string, any>): Promise<void>

  // Knowledge Base
  addKnowledgeDocument(title: string, content: string): Promise<string>
  addKnowledgeChunk(docId: string, content: string, embedding: number[]): Promise<void>
  searchKnowledge(embedding: number[], limit: number): Promise<Array<{ docId: string; content: string; score: number }>>
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
  readonly toolbox: ToolDetails[]

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

    this.toolbox = [
      {
        name: 'read_file',
        description: 'Read a file from the workspace'
      },
      {
        name: 'write_file',
        description: 'Write a file to the workspace'
      },
      {
        name: 'list_files',
        description: 'List files in the workspace'
      },
      {
        name: 'run_command',
        description: 'Run a shell command'
      }
    ]
  }

  async listSessions(args: {
    dbId: string
    entityType: EntityType
    componentId: string
  }): Promise<SessionEntry[]> {
    const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`
    
    // Check cache first
    const cached = sessionCache.getSessionList(listKey)
    if (cached) {
      return cached
    }
    
    const result = this.sessionsByListKey.get(listKey) ?? []
    sessionCache.setSessionList(listKey, result)
    return result
  }

  async listAllSessions(): Promise<SessionEntry[]> {
    const cacheKey = 'all_sessions'
    const cached = sessionCache.getSessionList(cacheKey)
    if (cached) {
      return cached
    }
    
    const allSessions: SessionEntry[] = []
    for (const session of this.sessionsByKey.values()) {
      allSessions.push(session.entry)
    }
    const result = allSessions.sort((a, b) => b.created_at - a.created_at)
    sessionCache.setSessionList(cacheKey, result)
    return result
  }

  async getSession(sessionId: string): Promise<SessionEntry | null> {
    // Check cache first
    const cached = sessionCache.getSession(sessionId)
    if (cached) {
      return cached
    }
    
    for (const session of this.sessionsByKey.values()) {
      if (session.entry.session_id === sessionId) {
        sessionCache.setSession(sessionId, session.entry)
        return session.entry
      }
    }
    return null
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
      created_at: nowSeconds(),
      entity_type: args.entityType,
      component_id: args.componentId
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
        created_at: nowSeconds(),
        entity_type: args.entityType,
        component_id: args.componentId
      }
      this.sessionsByKey.set(key, { entry, runs: [args.run] })
      return
    }

    session.runs.push(args.run)
    session.entry.updated_at = nowSeconds()
    
    // Invalidate cache
    sessionCache.deleteSession(args.sessionId)
    sessionCache.deleteSessionList('all_sessions')
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

  async updateSessionName(sessionId: string, name: string): Promise<void> {
    for (const [key, session] of this.sessionsByKey.entries()) {
      if (session.entry.session_id === sessionId) {
        session.entry.session_name = name
        session.entry.updated_at = nowSeconds()
        break
      }
    }
    
    // Invalidate cache
    sessionCache.deleteSession(sessionId)
    sessionCache.deleteSessionList('all_sessions')
  }

  async shouldGenerateName(sessionId: string): Promise<boolean> {
    for (const session of this.sessionsByKey.values()) {
      if (session.entry.session_id === sessionId) {
        return session.entry.session_name === 'New Session' || session.entry.session_name === ''
      }
    }
    return false
  }

  async addKnowledgeDocument(title: string, content: string): Promise<string> {
    return 'mock_doc_id'
  }

  async addKnowledgeChunk(docId: string, content: string, embedding: number[]): Promise<void> {
    // No-op
  }

  async searchKnowledge(embedding: number[], limit: number): Promise<Array<{ docId: string; content: string; score: number }>> {
    return []
  }

  async getSessionState(sessionId: string): Promise<Record<string, any> | null> {
    // InMemoryStore doesn't persist session state
    return null
  }

  async updateSessionState(sessionId: string, state: Record<string, any>): Promise<void> {
    // No-op in InMemoryStore
  }
}

export class SqliteStore implements Store {
  readonly agents: AgentDetails[]
  readonly teams: TeamDetails[]
  readonly toolbox: ToolDetails[]

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

    this.toolbox = [
      {
        name: 'read_file',
        description: 'Read a file from the workspace'
      },
      {
        name: 'write_file',
        description: 'Write a file to the workspace'
      },
      {
        name: 'list_files',
        description: 'List files in the workspace'
      },
      {
        name: 'run_command',
        description: 'Run a shell command'
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
        'CREATE INDEX IF NOT EXISTS agents_name_idx ON agents (name);',
        'CREATE TABLE IF NOT EXISTS knowledge_documents (',
        '  id TEXT PRIMARY KEY,',
        '  title TEXT NOT NULL,',
        '  content TEXT NOT NULL,',
        '  created_at INTEGER NOT NULL',
        ');',
        'CREATE TABLE IF NOT EXISTS knowledge_chunks (',
        '  id TEXT PRIMARY KEY,',
        '  doc_id TEXT NOT NULL,',
        '  content TEXT NOT NULL,',
        '  embedding TEXT NOT NULL,',
        '  FOREIGN KEY(doc_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE',
        ');',
        'CREATE TABLE IF NOT EXISTS session_state (',
        '  session_id TEXT PRIMARY KEY,',
        '  state_data TEXT NOT NULL,',
        '  updated_at INTEGER NOT NULL',
        ');'
      ].join('\n')
    )

    return new SqliteStore(db)
  }

  async listSessions(args: {
    dbId: string
    entityType: EntityType
    componentId: string
  }): Promise<SessionEntry[]> {
    const listKey = `${args.dbId}::${args.entityType}::${args.componentId}`
    
    // Check cache first
    const cached = sessionCache.getSessionList(listKey)
    if (cached) {
      return cached
    }
    
    const rows = await this.db.all<
      Array<{ session_id: string; session_name: string; created_at: number; updated_at: number | null }>
    >(
      'SELECT session_id, session_name, created_at, updated_at FROM sessions WHERE db_id = ? AND entity_type = ? AND component_id = ? ORDER BY created_at DESC',
      args.dbId,
      args.entityType,
      args.componentId
    )

    const result = rows.map((r: { session_id: string; session_name: string; created_at: number; updated_at: number | null }) => ({
      session_id: r.session_id,
      session_name: r.session_name,
      created_at: r.created_at,
      updated_at: r.updated_at || undefined,
      entity_type: args.entityType,
      component_id: args.componentId
    }))
    
    sessionCache.setSessionList(listKey, result)
    return result
  }

  async listAllSessions(): Promise<SessionEntry[]> {
    const cacheKey = 'all_sessions'
    const cached = sessionCache.getSessionList(cacheKey)
    if (cached) {
      return cached
    }
    
    const rows = await this.db.all<
      Array<{ session_id: string; session_name: string; created_at: number; updated_at: number | null; entity_type: EntityType; component_id: string }>
    >(
      'SELECT session_id, session_name, created_at, updated_at, entity_type, component_id FROM sessions ORDER BY created_at DESC'
    )

    const result = rows.map((r) => ({
      session_id: r.session_id,
      session_name: r.session_name,
      created_at: r.created_at,
      updated_at: r.updated_at || undefined,
      entity_type: r.entity_type,
      component_id: r.component_id
    }))
    
    sessionCache.setSessionList(cacheKey, result)
    return result
  }

  async getSession(sessionId: string): Promise<SessionEntry | null> {
    // Check cache first
    const cached = sessionCache.getSession(sessionId)
    if (cached) {
      return cached
    }
    
    const row = await this.db.get<
      { session_id: string; session_name: string; created_at: number; updated_at: number | null; entity_type: EntityType; component_id: string } | undefined
    >(
      'SELECT session_id, session_name, created_at, updated_at, entity_type, component_id FROM sessions WHERE session_id = ?',
      sessionId
    )

    if (!row) return null

    const result = {
      session_id: row.session_id,
      session_name: row.session_name,
      created_at: row.created_at,
      updated_at: row.updated_at || undefined,
      entity_type: row.entity_type,
      component_id: row.component_id
    }
    
    sessionCache.setSession(sessionId, result)
    return result
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
          updated_at: existing.updated_at || undefined,
          entity_type: args.entityType,
          component_id: args.componentId
        }
      }
    }

    const entry: SessionEntry = {
      session_id: sessionId,
      session_name: args.sessionName,
      created_at: nowSeconds(),
      entity_type: args.entityType,
      component_id: args.componentId
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
    
    // Invalidate cache
    sessionCache.deleteSession(args.sessionId)
    sessionCache.deleteSessionList('all_sessions')
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

  async updateSessionName(sessionId: string, name: string): Promise<void> {
    await this.db.run(
      'UPDATE sessions SET session_name = ?, updated_at = ? WHERE session_id = ?',
      name,
      nowSeconds(),
      sessionId
    )
    
    // Invalidate cache
    sessionCache.deleteSession(sessionId)
    sessionCache.deleteSessionList('all_sessions')
  }

  async shouldGenerateName(sessionId: string): Promise<boolean> {
    const row = await this.db.get<{ session_name: string }>(
      'SELECT session_name FROM sessions WHERE session_id = ?',
      sessionId
    )
    return !row || row.session_name === 'New Session' || row.session_name === ''
  }

  async getSessionState(sessionId: string): Promise<Record<string, any> | null> {
    const row = await this.db.get<{ state_data: string }>(
      'SELECT state_data FROM session_state WHERE session_id = ?',
      sessionId
    )
    
    if (!row) {
      return null
    }
    
    try {
      return JSON.parse(row.state_data)
    } catch (error) {
      console.warn('Failed to parse session state:', error)
      return null
    }
  }

  async updateSessionState(sessionId: string, state: Record<string, any>): Promise<void> {
    const stateData = JSON.stringify(state)
    const updatedAt = nowSeconds()
    
    await this.db.run(
      'INSERT OR REPLACE INTO session_state (session_id, state_data, updated_at) VALUES (?, ?, ?)',
      sessionId,
      stateData,
      updatedAt
    )
  }

  async addKnowledgeDocument(title: string, content: string): Promise<string> {
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`
    await this.db.run(
      'INSERT INTO knowledge_documents (id, title, content, created_at) VALUES (?, ?, ?, ?)',
      id, title, content, Math.floor(Date.now() / 1000)
    )
    return id
  }

  async addKnowledgeChunk(docId: string, content: string, embedding: number[]): Promise<void> {
    const id = `chunk_${Date.now()}_${Math.random().toString(36).slice(2)}`
    await this.db.run(
      'INSERT INTO knowledge_chunks (id, doc_id, content, embedding) VALUES (?, ?, ?, ?)',
      id, docId, content, JSON.stringify(embedding)
    )
  }

  async searchKnowledge(embedding: number[], limit: number): Promise<Array<{ docId: string; content: string; score: number }>> {
    // Fetch all chunks (inefficient for large data, but MVP)
    const chunks = await this.db.all<{ doc_id: string; content: string; embedding: string }[]>(
      'SELECT doc_id, content, embedding FROM knowledge_chunks'
    )

    const results = chunks.map(chunk => {
      const chunkEmbedding = JSON.parse(chunk.embedding) as number[]
      const score = cosineSimilarity(embedding, chunkEmbedding)
      return { docId: chunk.doc_id, content: chunk.content, score }
    })

    // Sort by score descending
    results.sort((a: { score: number }, b: { score: number }) => b.score - a.score)

    return results.slice(0, limit)
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
=======
import { AgentDetails, EntityType, RunRecord, SessionEntry, TeamDetails, User, UserSession, SocialAccount, ModelConfig } from './types.js'

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

  // User sessions
  createUserSession(userId: string, tokenHash: string, expiresAt: number): Promise<UserSession>
  getUserSessionByTokenHash(tokenHash: string): Promise<UserSession | null>
  deleteUserSession(tokenHash: string): Promise<boolean>
  deleteUserSessionsByUserId(userId: string): Promise<boolean>

  // Social accounts
  createSocialAccount(userId: string, provider: string, providerId: string, providerData?: string): Promise<SocialAccount>
  getSocialAccountByProvider(provider: string, providerId: string): Promise<SocialAccount | null>
  getSocialAccountsByUserId(userId: string): Promise<SocialAccount[]>
  deleteSocialAccount(id: string): Promise<boolean>

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
    const user: User = { 
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

  // User sessions
  async createUserSession(userId: string, tokenHash: string, expiresAt: number): Promise<UserSession> {
    const id = (this.userSessions?.length || 0) + 1;
    const session: UserSession = {
      id: id.toString(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: nowSeconds()
    };
    if (!this.userSessions) this.userSessions = [];
    this.userSessions.push(session);
    return session;
  }

  async getUserSessionByTokenHash(tokenHash: string): Promise<UserSession | null> {
    const session = this.userSessions?.find((s) => s.token_hash === tokenHash) || null
    if (!session) return null
    if (session.expires_at <= nowSeconds()) return null
    return session
  }

  async deleteUserSession(tokenHash: string): Promise<boolean> {
    if (!this.userSessions) return false;
    const index = this.userSessions.findIndex(session => session.token_hash === tokenHash);
    if (index >= 0) {
      this.userSessions.splice(index, 1);
      return true;
    }
    return false;
  }

  async deleteUserSessionsByUserId(userId: string): Promise<boolean> {
    if (!this.userSessions) return false;
    const initialLength = this.userSessions.length;
    this.userSessions = this.userSessions.filter(session => session.user_id !== userId);
    return this.userSessions.length < initialLength;
  }

  // Social accounts
  async createSocialAccount(userId: string, provider: string, providerId: string, providerData?: string): Promise<SocialAccount> {
    const id = (this.socialAccounts?.length || 0) + 1;
    const account: SocialAccount = {
      id: id.toString(),
      user_id: userId,
      provider: provider as 'google' | 'github' | 'apple' | 'microsoft',
      provider_id: providerId,
      provider_data: providerData,
      created_at: nowSeconds()
    };
    if (!this.socialAccounts) this.socialAccounts = [];
    this.socialAccounts.push(account);
    return account;
  }

  async getSocialAccountByProvider(provider: string, providerId: string): Promise<SocialAccount | null> {
    return this.socialAccounts?.find(account => account.provider === provider && account.provider_id === providerId) || null;
  }

  async getSocialAccountsByUserId(userId: string): Promise<SocialAccount[]> {
    return this.socialAccounts?.filter(account => account.user_id === userId) || [];
  }

  async deleteSocialAccount(id: string): Promise<boolean> {
    if (!this.socialAccounts) return false;
    const index = this.socialAccounts.findIndex(account => account.id === id);
    if (index >= 0) {
      this.socialAccounts.splice(index, 1);
      return true;
    }
    return false;
  }

  private userSessions: UserSession[] = [];
  private socialAccounts: SocialAccount[] = [];
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
      `INSERT INTO users (email, name, password_hash, role, created_at, updated_at, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      email,
      name,
      hashedPassword,
      role,
      createdAt,
      createdAt,
      false
    )
    return {
      id: result.lastID?.toString() || "0",
      email,
      name,
      password_hash: hashedPassword,
      email_verified: false,
      role,
      created_at: createdAt,
      updated_at: createdAt
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
        const dbId = modelConfig.db_id ?? `db_${agentId}`
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
    } catch (error) {
        console.error('Error in saveModelConfig:', error);
        throw error;
    }
  }

  async getModelConfig(agentId: string): Promise<ModelConfig | null> {
    console.log(`Fetching model config for agentId: ${agentId}`);
    const query = `SELECT model_provider, model_name, model FROM agents WHERE id = ?`;
    console.log(`Executing query: ${query}`);
    const row = await this.db.get(query, agentId);
    console.log(`Fetched row:`, row);
    if (!row) return null
    const modelValue = (row as any).model
    if (typeof modelValue === 'string') {
      try {
        const parsed = JSON.parse(modelValue)
        if (parsed && typeof parsed === 'object') return parsed as ModelConfig
      } catch {
        // fall through
      }
    }
    const provider = (row as any).model_provider
    const name = (row as any).model_name
    const model = modelValue
    if (typeof provider === 'string' && typeof name === 'string' && typeof model === 'string') {
      return { provider, name, model }
    }
    return null
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

  // User sessions
  async createUserSession(userId: string, tokenHash: string, expiresAt: number): Promise<UserSession> {
    const createdAt = nowSeconds()
    const result = await this.db.run(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`,
      userId,
      tokenHash,
      expiresAt,
      createdAt
    )
    return {
      id: result.lastID?.toString() || "0",
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: createdAt
    }
  }

  async getUserSessionByTokenHash(tokenHash: string): Promise<UserSession | null> {
    const row = await this.db.get<UserSession>(
      `SELECT * FROM user_sessions WHERE token_hash = ? AND expires_at > ?`,
      tokenHash,
      nowSeconds()
    )
    return row || null
  }

  async deleteUserSession(tokenHash: string): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM user_sessions WHERE token_hash = ?`,
      tokenHash
    )
    return (result.changes ?? 0) > 0
  }

  async deleteUserSessionsByUserId(userId: string): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM user_sessions WHERE user_id = ?`,
      userId
    )
    return (result.changes ?? 0) > 0
  }

  // Social accounts
  async createSocialAccount(userId: string, provider: string, providerId: string, providerData?: string): Promise<SocialAccount> {
    const createdAt = nowSeconds()
    const result = await this.db.run(
      `INSERT INTO social_accounts (user_id, provider, provider_id, provider_data, created_at) VALUES (?, ?, ?, ?, ?)`,
      userId,
      provider,
      providerId,
      providerData,
      createdAt
    )
    return {
      id: result.lastID?.toString() || "0",
      user_id: userId,
      provider: provider as 'google' | 'github' | 'apple' | 'microsoft',
      provider_id: providerId,
      provider_data: providerData,
      created_at: createdAt
    }
  }

  async getSocialAccountByProvider(provider: string, providerId: string): Promise<SocialAccount | null> {
    const row = await this.db.get<SocialAccount>(
      `SELECT * FROM social_accounts WHERE provider = ? AND provider_id = ?`,
      provider,
      providerId
    )
    return row || null
  }

  async getSocialAccountsByUserId(userId: string): Promise<SocialAccount[]> {
    const rows = await this.db.all<SocialAccount[]>(
      `SELECT * FROM social_accounts WHERE user_id = ? ORDER BY created_at DESC`,
      userId
    )
    return rows || []
  }

  async deleteSocialAccount(id: string): Promise<boolean> {
    const result = await this.db.run(
      `DELETE FROM social_accounts WHERE id = ?`,
      id
    )
    return (result.changes ?? 0) > 0
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
