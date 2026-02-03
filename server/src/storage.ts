import { AgentDetails, EntityType, RunRecord, SessionEntry, TeamDetails } from './types.js'

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
        'CREATE INDEX IF NOT EXISTS runs_session_idx ON runs (db_id, entity_type, component_id, session_id, created_at ASC);'
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
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
