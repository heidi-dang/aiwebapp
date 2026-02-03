/**
 * Phase 5: SQLite persistence for runner jobs and events
 */
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
export async function createSqliteStore(dbPath) {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
    await db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      timeout_ms INTEGER,
      input TEXT
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
  `);
    return {
        async createJob(id, input, timeoutMs) {
            await db.run(`INSERT INTO jobs (id, status, created_at, timeout_ms, input) VALUES (?, 'pending', ?, ?, ?)`, id, new Date().toISOString(), timeoutMs ?? null, input ? JSON.stringify(input) : null);
        },
        async getJob(id) {
            return db.get(`SELECT * FROM jobs WHERE id = ?`, id);
        },
        async listJobs(limit = 100) {
            return db.all(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`, limit);
        },
        async updateJobStatus(id, status, startedAt, finishedAt) {
            await db.run(`UPDATE jobs SET status = ?, started_at = COALESCE(?, started_at), finished_at = COALESCE(?, finished_at) WHERE id = ?`, status, startedAt ?? null, finishedAt ?? null, id);
        },
        async addEvent(event) {
            await db.run(`INSERT INTO events (id, job_id, type, ts, data) VALUES (?, ?, ?, ?, ?)`, event.id, event.job_id, event.type, event.ts, event.data ? JSON.stringify(event.data) : null);
        },
        async getEvents(jobId) {
            const rows = await db.all(`SELECT * FROM events WHERE job_id = ? ORDER BY ts ASC`, jobId);
            return rows.map((row) => ({
                id: row.id,
                type: row.type,
                ts: row.ts,
                job_id: row.job_id,
                data: row.data ? JSON.parse(row.data) : undefined
            }));
        },
        async deleteJob(id) {
            await db.run(`DELETE FROM events WHERE job_id = ?`, id);
            await db.run(`DELETE FROM jobs WHERE id = ?`, id);
        }
    };
}
/**
 * In-memory fallback store (for testing or when persistence disabled)
 */
export function createInMemoryStore() {
    const jobs = new Map();
    const events = new Map();
    return {
        async createJob(id, input, timeoutMs) {
            jobs.set(id, {
                id,
                status: 'pending',
                created_at: new Date().toISOString(),
                started_at: null,
                finished_at: null,
                timeout_ms: timeoutMs ?? null,
                input: input ? JSON.stringify(input) : null
            });
            events.set(id, []);
        },
        async getJob(id) {
            return jobs.get(id);
        },
        async listJobs(limit = 100) {
            return Array.from(jobs.values())
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, limit);
        },
        async updateJobStatus(id, status, startedAt, finishedAt) {
            const job = jobs.get(id);
            if (job) {
                job.status = status;
                if (startedAt)
                    job.started_at = startedAt;
                if (finishedAt)
                    job.finished_at = finishedAt;
            }
        },
        async addEvent(event) {
            const list = events.get(event.job_id) ?? [];
            list.push(event);
            events.set(event.job_id, list);
        },
        async getEvents(jobId) {
            return events.get(jobId) ?? [];
        },
        async deleteJob(id) {
            jobs.delete(id);
            events.delete(id);
        }
    };
}
