import path from 'node:path'
import { loadMcpConfig, type McpServerConfig } from './config.js'
import { McpStdioClient } from './stdio-client.js'

export class McpRegistry {
  private servers: McpServerConfig[] = []
  private clients = new Map<string, McpStdioClient>()

  constructor(private readonly baseDir: string) {}

  async load(): Promise<void> {
    this.servers = await loadMcpConfig(this.baseDir)
  }

  hasServers(): boolean {
    return this.servers.length > 0
  }

  listServers(): Array<{ id: string; transport: string; command: string }> {
    return this.servers.map(s => ({ id: s.id, transport: s.transport, command: s.command }))
  }

  private getClient(serverId: string): McpStdioClient {
    const cfg = this.servers.find(s => s.id === serverId)
    if (!cfg) throw new Error(`Unknown MCP server: ${serverId}`)

    const existing = this.clients.get(serverId)
    if (existing) return existing

    const cwd = cfg.cwd ? (path.isAbsolute(cfg.cwd) ? cfg.cwd : path.join(this.baseDir, cfg.cwd)) : this.baseDir
    const client = new McpStdioClient({ command: cfg.command, args: cfg.args, env: cfg.env, cwd })
    this.clients.set(serverId, client)
    return client
  }

  async initialize(serverId: string): Promise<unknown> {
    const client = this.getClient(serverId)
    return client.initialize({
      protocolVersion: '1.0',
      clientInfo: { name: 'aiwebapp-runner', version: '0.0.1' },
      capabilities: { tools: {}, resources: {}, prompts: {} },
      roots: [{ uri: `file://${this.baseDir}`, name: 'workspace' }]
    })
  }

  async listTools(serverId: string): Promise<unknown> {
    return this.getClient(serverId).listTools()
  }

  async callTool(serverId: string, toolName: string, args?: Record<string, unknown>): Promise<unknown> {
    return this.getClient(serverId).callTool(toolName, args)
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.clients.values()].map(c => c.close().catch(() => {})))
    this.clients.clear()
  }
}
