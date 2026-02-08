/**
 * Ollama client for local LLM integration
 */

export interface OllamaConfig {
  baseUrl?: string // e.g., http://127.0.0.1:11434
  model: string // e.g., 'qwen2.5-coder:7b'
  timeout?: number
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OllamaResponse {
  message: {
    role: string
    content: string
  }
  done: boolean
}

export class OllamaClient {
  private baseUrl: string
  private model: string
  private timeout: number

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl ?? 'http://127.0.0.1:11434'
    this.model = config.model
    this.timeout = config.timeout ?? 30000
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Ollama request failed: ${res.status} ${text}`)
      }

      return res.json() as Promise<T>
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async chat(messages: OllamaMessage[]): Promise<string> {
    const response = await this.request<OllamaResponse>('/api/chat', 'POST', {
      model: this.model,
      messages,
      stream: false
    })

    return response.message.content
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('/api/tags', 'GET')
      return true
    } catch {
      return false
    }
  }
}

export function createOllamaClientFromEnv(): OllamaClient | null {
  const baseUrl = process.env.OLLAMA_API_URL
  const model = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b'

  if (!baseUrl) return null

  return new OllamaClient({ baseUrl, model })
}