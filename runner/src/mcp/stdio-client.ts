import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'node:readline'

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  constructor(
    private readonly opts: {
      command: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string
    }
  ) {}

  async connect(): Promise<void> {
    if (this.child) return

    this.child = spawn(this.opts.command, this.opts.args ?? [], {
      stdio: 'pipe',
      cwd: this.opts.cwd,
      env: { ...process.env, ...(this.opts.env ?? {}) }
    })

    const rl = readline.createInterface({ input: this.child.stdout })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let msg: JsonRpcResponse
      try {
        msg = JSON.parse(trimmed)
      } catch {
        return
      }

      if (typeof msg?.id !== 'number') return
      const pending = this.pending.get(msg.id)
      if (!pending) return
      this.pending.delete(msg.id)

      if (msg.error) {
        pending.reject(new Error(msg.error.message))
        return
      }
      pending.resolve(msg.result)
    })

    this.child.on('exit', () => {
      for (const [id, p] of this.pending.entries()) {
        p.reject(new Error('MCP server exited'))
        this.pending.delete(id)
      }
      this.child = null
    })
  }

  async close(): Promise<void> {
    if (!this.child) return
    this.child.kill('SIGTERM')
    this.child = null
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    await this.connect()
    if (!this.child) throw new Error('MCP client not connected')

    const id = this.nextId++
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    const line = JSON.stringify(payload)
    if (line.includes('\n')) throw new Error('Invalid JSON-RPC message framing')

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })

    this.child.stdin.write(line + '\n')
    return promise
  }

  async initialize(params: {
    protocolVersion: string
    clientInfo: { name: string; version: string }
    capabilities: Record<string, unknown>
    roots: Array<{ uri: string; name: string }>
  }): Promise<unknown> {
    return this.request('initialize', params as any)
  }

  async listTools(): Promise<unknown> {
    return this.request('tools/list')
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args ?? {} })
  }
}
