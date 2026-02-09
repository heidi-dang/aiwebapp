import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { promises as fs } from 'node:fs'
import { exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'
import glob from 'glob'
import path from 'node:path'

const exec = promisify(execCb)

async function grepSearchSafe(args: { query: string; includePattern?: string; maxMatches: number }) {
  const query = args.query
  const maxMatches = args.maxMatches
  const include = args.includePattern

  const entries = await new Promise<string[]>((resolve, reject) => {
    const pattern = include || '**/*'
    glob(pattern, { cwd: process.cwd(), nodir: true }, (err: Error | null, matches: string[]) => {
      if (err) reject(err)
      else resolve(matches)
    })
  })

  const matches: Array<{ file: string; line: number; text: string }> = []

  for (const rel of entries) {
    if (matches.length >= maxMatches) break
    if (rel.includes('node_modules') || rel.includes('.git') || rel.includes('dist') || rel.includes('.next')) continue

    const full = path.join(process.cwd(), rel)
    let text = ''
    try {
      text = await fs.readFile(full, 'utf8')
    } catch {
      continue
    }

    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxMatches) break
      if (!lines[i].includes(query)) continue
      matches.push({ file: rel, line: i + 1, text: lines[i] })
    }
  }

  return matches
}

function looksLikeNaturalLanguageCommand(command: string): boolean {
  const lowered = command.toLowerCase()
  if (/\b(run|execute|start|stop|open|close|list|show|find)\b\s+(the|a|an)\b/.test(lowered)) return true
  if (/^[a-z ,]+$/.test(lowered) && lowered.trim().split(/\s+/).length > 3) return true
  return false
}

function isDangerousCommand(command: string): boolean {
  const lowered = command.toLowerCase()
  return /(^|\s)(rm\s+-rf|sudo\b|shutdown\b|reboot\b|mkfs\b|dd\s+if=|:\(\)\s*{\s*:|:;};:|:\s*>\s*\/|>\s*\/)/.test(lowered)
}

async function loadAllowlist(): Promise<string[]> {
  try {
    const content = await fs.readFile(new URL('../../config/allowed-commands.json', import.meta.url), 'utf8')
    return JSON.parse(content) as string[]
  } catch {
    return []
  }
}

function isLocalRequest(req: any): boolean {
  const host = String(req?.headers?.host ?? '')
  const ip = String(req?.ip ?? req?.socket?.remoteAddress ?? req?.connection?.remoteAddress ?? '')
  return host.includes('localhost') || host.includes('127.0.0.1') || ip.includes('127.0.0.1') || ip.includes('::1')
}

const toolboxRate = new Map<string, { windowStart: number; count: number }>()

function getClientKey(req: any): string {
  const ip = String(req?.ip ?? req?.socket?.remoteAddress ?? req?.connection?.remoteAddress ?? 'unknown')
  const ua = String(req?.headers?.['user-agent'] ?? '')
  return `${ip}|${ua.slice(0, 64)}`
}

function enforceRateLimit(req: any, res: any): boolean {
  const maxPerMinute = Number(process.env.TOOLBOX_RATE_LIMIT_PER_MINUTE ?? 60)
  const now = Date.now()
  const key = getClientKey(req)
  const cur = toolboxRate.get(key)
  if (!cur || now - cur.windowStart >= 60_000) {
    toolboxRate.set(key, { windowStart: now, count: 1 })
    return true
  }
  cur.count++
  if (cur.count > maxPerMinute) {
    res.status(429).json({ error: 'Rate limit exceeded' })
    return false
  }
  return true
}

function isRestrictedPath(p: string): boolean {
  const lowered = p.toLowerCase()
  if (lowered === '.env' || lowered.endsWith('/.env') || lowered.endsWith('\\.env')) return true
  if (lowered.includes('/.env.') || lowered.includes('\\.env.')) return true
  if (lowered.includes('logs/') || lowered.includes('logs\\')) return true
  if (lowered.includes('node_modules/') || lowered.includes('node_modules\\')) return true
  if (lowered.includes('.git/') || lowered.includes('.git\\')) return true
  if (lowered.includes('dist/') || lowered.includes('dist\\')) return true
  if (lowered.includes('.next/') || lowered.includes('.next\\')) return true
  if (lowered.endsWith('package-lock.json')) return true
  return false
}

export async function registerToolboxRoutes(app: any, store: Store) {
  app.get('/toolbox', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    if (!process.env.OS_SECURITY_KEY && !isLocalRequest(req)) {
      return res.status(401).json({ error: 'Refused: OS_SECURITY_KEY not set for non-local request' })
    }
    if (!enforceRateLimit(req, res)) return
    res.json(store.toolbox)
  })

  app.post('/internal/toolbox', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    if (!process.env.OS_SECURITY_KEY && !isLocalRequest(req)) {
      return res.status(401).json({ error: 'Refused: OS_SECURITY_KEY not set for non-local request' })
    }
    if (!enforceRateLimit(req, res)) return
    const contentLength = Number(req.headers?.['content-length'] ?? 0)
    if (contentLength > Number(process.env.TOOLBOX_MAX_BODY_BYTES ?? 1_000_000)) {
      return res.status(413).json({ error: 'Payload too large' })
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    const tool = String(body.tool ?? '')
    const params = (body.params ?? {}) as Record<string, unknown>

    try {
      if (tool === 'read_file') {
        const p = String(params.path ?? '')
        if (!p || p.includes('..') || path.isAbsolute(p)) {
          return res.status(400).json({ error: 'Invalid path' })
        }
        if (isRestrictedPath(p)) {
          return res.status(403).json({ error: 'Refused to read suspicious path' })
        }
        try {
          const text = await fs.readFile(p, 'utf8')
          return res.json({ success: true, result: { path: p, text } })
        } catch {
          return res.status(404).json({ error: 'File not found' })
        }
      }

      if (tool === 'write_file') {
        const p = String(params.path ?? '')
        const content = String(params.content ?? '')
        if (!p || p.includes('..') || path.isAbsolute(p)) {
          return res.status(400).json({ error: 'Invalid path' })
        }
        if (isRestrictedPath(p)) {
          return res.status(403).json({ error: 'Refused to write suspicious path' })
        }
        const maxBytes = Number(process.env.TOOLBOX_MAX_WRITE_BYTES ?? 512_000)
        if (Buffer.byteLength(content, 'utf8') > maxBytes) {
          return res.status(413).json({ error: 'Content too large' })
        }
        await fs.writeFile(p, content, 'utf8')
        return res.json({ success: true, result: { path: p } })
      }

      if (tool === 'list_files') {
        const pattern = String(params.glob ?? '**/*')
        const entries = await new Promise<string[]>((resolve, reject) => {
          glob(
            pattern,
            { cwd: process.cwd(), ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.next/**', '**/logs/**'] },
            (err: Error | null, matches: string[]) => {
            if (err) reject(err)
            else resolve(matches)
            }
          )
        })
        return res.json({ success: true, result: { files: entries } })
      }

      if (tool === 'list_dir') {
        const p = String(params.path ?? '.')
        if (!p || p.includes('..') || path.isAbsolute(p)) {
          return res.status(400).json({ error: 'Invalid path' })
        }
        if (isRestrictedPath(p)) {
          return res.status(403).json({ error: 'Refused to list suspicious path' })
        }
        const entries = await fs.readdir(p, { withFileTypes: true })
        const files = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
        return res.json({ success: true, result: { path: p, files } })
      }

      if (tool === 'grep_search') {
        const query = String(params.query ?? '')
        const include = String(params.include_pattern ?? '')
        if (!query) {
          return res.status(400).json({ error: 'Missing query' })
        }
        const matches = await grepSearchSafe({ query, includePattern: include || undefined, maxMatches: 200 })
        return res.json({ success: true, result: { query, matches } })
      }

      if (tool === 'approve_command') {
        const command = String(params.command ?? '')
        if (!command) {
          return res.status(400).json({ error: 'Missing command' })
        }
        if (isDangerousCommand(command)) {
          return res.status(403).json({ error: 'Refused: matches dangerous pattern' })
        }
        try {
          const cfgUrl = new URL('../../config/allowed-commands.json', import.meta.url)
          let allowed: string[] = []
          try {
            const current = await fs.readFile(cfgUrl, 'utf8')
            allowed = JSON.parse(current) as string[]
          } catch {
            // treat as empty list
          }
          if (!allowed.includes(command)) {
            allowed.push(command)
            await fs.writeFile(cfgUrl, JSON.stringify(allowed, null, 2), 'utf8')
          }
          return res.json({ success: true, result: { command } })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return res.status(500).json({ error: message })
        }
      }

      if (tool === 'run_command') {
        const command = String(params.command ?? '')
        if (!command) {
          return res.status(400).json({ error: 'Missing command' })
        }
        const allowed = await loadAllowlist()
        const matchesAllowlist = (cmd: string) => {
          const trimmed = cmd.trim()
          for (const a of allowed) {
            const pick = a.trim()
            if (trimmed === pick) return true
            if (trimmed.startsWith(pick + ' ')) return true
          }
          return false
        }
        if (!matchesAllowlist(command)) {
          return res.status(403).json({ error: 'Refused: command not on allowlist' })
        }
        if (looksLikeNaturalLanguageCommand(command)) {
          return res.status(403).json({ error: 'Refused: looks like natural language' })
        }
        if (isDangerousCommand(command)) {
          return res.status(403).json({ error: 'Refused: matches dangerous pattern' })
        }
        const { stdout, stderr } = await exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 })
        const output = (stdout || '').slice(0, 4000) || (stderr || '').slice(0, 4000) || '(no output)'
        return res.json({ success: true, result: { stdout: output } })
      }

      return res.status(400).json({ error: 'Unsupported tool' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ error: message })
    }
  })
}
