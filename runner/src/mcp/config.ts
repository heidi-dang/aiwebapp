import fs from 'node:fs/promises'
import path from 'node:path'

export type McpServerConfig = {
  id: string
  transport: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export type McpConfigFile = {
  servers: McpServerConfig[]
}

export async function loadMcpConfig(baseDir: string): Promise<McpServerConfig[]> {
  const configPath = path.join(baseDir, '.mcp', 'servers.json')
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<McpConfigFile>
    const servers = Array.isArray(parsed.servers) ? parsed.servers : []
    return servers
      .filter(s => s && typeof s === 'object')
      .map((s: any) => ({
        id: String(s.id ?? '').trim(),
        transport: 'stdio' as const,
        command: String(s.command ?? '').trim(),
        args: Array.isArray(s.args) ? s.args.map((a: any) => String(a)) : undefined,
        env: s.env && typeof s.env === 'object' ? Object.fromEntries(Object.entries(s.env).map(([k, v]) => [String(k), String(v)])) : undefined,
        cwd: s.cwd ? String(s.cwd) : undefined
      }))
      .filter(s => s.id && s.command)
  } catch {
    return []
  }
}
