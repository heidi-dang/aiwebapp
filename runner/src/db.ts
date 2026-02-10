/**
 * Phase 5: SQLite persistence for runner jobs and events
 */
import { open, type Database } from 'sqlite'

export type JobStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'timeout' | 'error'

export type RunnerEventType =
  | 'job.started'
  | 'job.cancelled'
  | 'job.timeout'
  | 'plan'
  | 'plan.update'
  | 'tool.start'
  | 'tool.output'
  | 'tool.end'
  | 'tool.refused'
  | 'approval.request'
  | 'approval.response'
  | 'memory'
  | 'error'
  | 'done'

export type RunnerEvent = {
  id: string
  type: RunnerEventType
  ts: string
  job_id: string
  data?: unknown
}

export type JobRow = {
  id: string
  status: JobStatus
  created_at: string
  started_at: string | null
  finished_at: string | null
  timeout_ms: number | null
  input: string | null
  session_id: string | null
}

export type EventRow = {
  id: string
  job_id: string
  type: string
  ts: string
  data: string | null
}

export interface JobStore {
  createJob(id: string, input?: unknown, timeoutMs?: number): Promise<void>
  getJob(id: string): Promise<JobRow | undefined>
  listJobs(limit?: number): Promise<JobRow[]>
  listJobsBySession(sessionId: string, limit?: number): Promise<JobRow[]>
  updateJobStatus(id: string, status: JobStatus, startedAt?: string, finishedAt?: string): Promise<void>
  addEvent(event: RunnerEvent): Promise<void>
  addEvents(events: RunnerEvent[]): Promise<void>
  getEvents(jobId: string): Promise<RunnerEvent[]>
  deleteJob(id: string): Promise<void>
}

export async function createSqliteStore(dbPath: string): Promise<JobStore> {
  let sqlite3Mod: any
  try {
    sqlite3Mod = await import('sqlite3')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`SQLite driver unavailable (${message})`)
  }
  const sqlite3 = sqlite3Mod?.default ?? sqlite3Mod

  const db: Database = await open({
    filename: dbPath,
    driver: sqlite3.Database
  })

  await db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      timeout_ms INTEGER,
      input TEXT,
      session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      type TEXT NOT NULL,
      ts TEXT NOT NULL,
      data TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_job_id ON events(job_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_session_id ON jobs(session_id);
  `)

  // Migration: Add session_id column if it doesn't exist (for existing databases)
  try {
    await db.exec(`ALTER TABLE jobs ADD COLUMN session_id TEXT`)
  } catch (err) {
    // Ignore error if column already exists
  }

  return {
    async createJob(id: string, input?: unknown, timeoutMs?: number) {
      let sessionId: string | null = null
      if (input && typeof input === 'object' && 'session_id' in input) {
        sessionId = (input as any).session_id
      }

      await db.run(
        `INSERT INTO jobs (id, status, created_at, timeout_ms, input, session_id) VALUES (?, 'pending', ?, ?, ?, ?)`,
        id,
        new Date().toISOString(),
        timeoutMs ?? null,
        input ? JSON.stringify(input) : null,
        sessionId
      )
    },

    async getJob(id: string) {
      return db.get<JobRow>(`SELECT * FROM jobs WHERE id = ?`, id)
    },

    async listJobs(limit = 100) {
      return db.all<JobRow[]>(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`, limit)
    },

    async listJobsBySession(sessionId: string, limit = 20) {
      return db.all<JobRow[]>(`SELECT * FROM jobs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`, sessionId, limit)
    },

    async updateJobStatus(id: string, status: JobStatus, startedAt?: string, finishedAt?: string) {
      await db.run(
        `UPDATE jobs SET status = ?, started_at = COALESCE(?, started_at), finished_at = COALESCE(?, finished_at) WHERE id = ?`,
        status,
        startedAt ?? null,
        finishedAt ?? null,
        id
      )
    },

    async addEvent(event: RunnerEvent) {
      await db.run(
        `INSERT INTO events (id, job_id, type, ts, data) VALUES (?, ?, ?, ?, ?)`,
        event.id,
        event.job_id,
        event.type,
        event.ts,
        event.data ? JSON.stringify(event.data) : null
      )
    },

    async addEvents(events: RunnerEvent[]) {
      if (events.length === 0) return
      await db.run('BEGIN TRANSACTION')
      try {
        const stmt = await db.prepare(
          `INSERT INTO events (id, job_id, type, ts, data) VALUES (?, ?, ?, ?, ?)`
        )
        for (const event of events) {
          await stmt.run(
            event.id,
            event.job_id,
            event.type,
            event.ts,
            event.data ? JSON.stringify(event.data) : null
          )
        }
        await stmt.finalize()
        await db.run('COMMIT')
      } catch (err) {
        await db.run('ROLLBACK')
        throw err
      }
    },

    async getEvents(jobId: string) {
      const rows = await db.all<EventRow[]>(`SELECT * FROM events WHERE job_id = ? ORDER BY ts ASC`, jobId)
      return rows.map((row) => ({
        id: row.id,
        type: row.type as RunnerEventType,
        ts: row.ts,
        job_id: row.job_id,
        data: row.data ? JSON.parse(row.data) : undefined
      }))
    },

    async deleteJob(id: string) {
      await db.run(`DELETE FROM events WHERE job_id = ?`, id)
      await db.run(`DELETE FROM jobs WHERE id = ?`, id)
    }
  }
}

/**
 * In-memory fallback store (for testing or when persistence disabled)
 */
export function createInMemoryStore(): JobStore {
  const jobs = new Map<string, JobRow>()
  const events = new Map<string, RunnerEvent[]>()

  return {
    async createJob(id: string, input?: unknown, timeoutMs?: number) {
      let sessionId: string | null = null
      if (input && typeof input === 'object' && 'session_id' in input) {
        sessionId = (input as any).session_id
      }

      jobs.set(id, {
        id,
        status: 'pending',
        created_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
        timeout_ms: timeoutMs ?? null,
        input: input ? JSON.stringify(input) : null,
        session_id: sessionId
      })
      events.set(id, [])
    },

    async getJob(id: string) {
      return jobs.get(id)
    },

    async listJobs(limit = 100) {
      return Array.from(jobs.values())
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
    },

    async listJobsBySession(sessionId: string, limit = 20) {
      return Array.from(jobs.values())
        .filter(j => j.session_id === sessionId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
    },

    async updateJobStatus(id: string, status: JobStatus, startedAt?: string, finishedAt?: string) {
      const job = jobs.get(id)
      if (job) {
        job.status = status
        if (startedAt) job.started_at = startedAt
        if (finishedAt) job.finished_at = finishedAt
      }
    },

    async addEvent(event: RunnerEvent) {
      const list = events.get(event.job_id) ?? []
      list.push(event)
      events.set(event.job_id, list)
    },

    async addEvents(eventsList: RunnerEvent[]) {
      for (const event of eventsList) {
        const list = events.get(event.job_id) ?? []
        list.push(event)
        events.set(event.job_id, list)
      }
    },

    async getEvents(jobId: string) {
      return events.get(jobId) ?? []
    },

    async deleteJob(id: string) {
      jobs.delete(id)
      events.delete(id)
    }
  }
}
