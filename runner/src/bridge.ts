/**
 * Phase 4: Bridge client for VS Code extension communication
 * 
 * The bridge API runs inside VS Code and provides workspace capabilities:
 * - File read/list operations
 * - Apply edits (structured)
 * - Run allowlisted tools
 * - Copilot edit generation
 */

export interface BridgeConfig {
  baseUrl: string // e.g., http://127.0.0.1:3210
  token: string   // X-Bridge-Token header value
  timeout?: number
}

export interface FileEntry {
  path: string
  isDirectory?: boolean
}

export interface FileContent {
  path: string
  text: string
  version?: number
}

export interface EditRange {
  start: number
  end: number
}

export interface FileEdit {
  path: string
  range: EditRange
  text: string
}

export interface ToolResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface CopilotEdit {
  path: string
  range: EditRange
  text: string
}

export interface CopilotResult {
  summary: string
  edits: CopilotEdit[]
}

export interface HealthResponse {
  ok: boolean
  workspaceOpen: boolean
  workspaceFolders: string[]
  copilotAvailable: boolean
}

export class BridgeClient {
  private baseUrl: string
  private token: string
  private timeout: number

  constructor(config: BridgeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
    this.timeout = config.timeout ?? 30000
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': this.token
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Bridge request failed: ${res.status} ${text}`)
      }

      return res.json() as Promise<T>
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Health check - verify bridge is running and workspace is open
   */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health')
  }

  /**
   * List files in workspace matching glob pattern
   */
  async listFiles(glob: string, limit = 1000): Promise<FileEntry[]> {
    const params = new URLSearchParams({ glob, limit: String(limit) })
    const res = await this.request<{ ok: boolean; files: string[] }>('GET', `/workspace/list?${params}`)
    return res.files.map((path) => ({ path }))
  }

  /**
   * Read file content
   */
  async readFile(path: string): Promise<FileContent> {
    const params = new URLSearchParams({ path })
    return this.request<FileContent>('GET', `/workspace/read?${params}`)
  }

  /**
   * Apply structured edits to files
   */
  async applyEdits(edits: FileEdit[]): Promise<{ changedFiles: string[] }> {
    const res = await this.request<{ ok: boolean; changedFiles: string[] }>('POST', '/workspace/applyEdits', { edits })
    return { changedFiles: res.changedFiles }
  }

  /**
   * Run allowlisted tool/command
   */
  async runTool(tool: string, args?: Record<string, unknown>): Promise<ToolResult> {
    return this.request<ToolResult>('POST', '/tools/run', { tool, ...args })
  }

  /**
   * Generate edits via Copilot
   */
  async generateEdits(
    instruction: string,
    files: Array<{ path: string; text: string }>
  ): Promise<CopilotResult> {
    return this.request<CopilotResult>('POST', '/copilot/generateEdits', {
      instruction,
      files,
      output: 'edits'
    })
  }
}

/**
 * Create bridge client from environment variables
 */
export function createBridgeClientFromEnv(): BridgeClient | null {
  const baseUrl = process.env.BRIDGE_URL
  const token = process.env.BRIDGE_TOKEN

  if (!baseUrl || !token) {
    return null
  }

  return new BridgeClient({ baseUrl, token })
}
