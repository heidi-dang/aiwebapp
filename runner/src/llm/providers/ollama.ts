
import { ChatMessage, ChatResponse, LLMProvider } from '../types.js'

export function normalizeOllamaBaseUrl(input: string) {
  let url = input.trim()
  if (!url) return url
  url = url.replace(/\/+$/, '')
  if (url.endsWith('/api')) {
    url = url.slice(0, -4)
    url = url.replace(/\/+$/, '')
  }
  return url
}

export class OllamaProvider implements LLMProvider {
  private baseUrl: string

  constructor(baseUrl?: string) {
    const raw =
      baseUrl || process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434'
    this.baseUrl = normalizeOllamaBaseUrl(raw)
  }

  async chat(model: string, messages: ChatMessage[], tools?: any[]): Promise<ChatResponse> {
    const ollamaMessages = messages.map(m => ({
      role: m.role,
      content: m.content || '',
      // Ollama tool calling format is slightly different, but newer versions support OpenAI compatible tool calls
      // For now, we'll strip tool calls from input messages if Ollama doesn't support them fully yet
      // or assume we are using an OpenAI-compatible proxy layer for Ollama which is common
    }))

    // Check if we are using the native Ollama API or the OpenAI-compatible endpoint provided by Ollama
    // Ollama v0.1.24+ supports /v1/chat/completions which is OpenAI compatible
    // Let's try to use the OpenAI compatible endpoint if possible, otherwise fallback to native
    
    // Strategy: Use OpenAI compatible endpoint for Ollama as it simplifies tool support
    const endpoint = `${this.baseUrl}/v1/chat/completions`
    
    // If the base URL doesn't look like it has /v1, we might append it.
    // However, the user might provide the full path.
    // Let's assume the user provides the base host.
    
    const body: any = {
        model,
        messages: ollamaMessages,
        stream: false,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        })

        if (res.ok) {
            const json = await res.json()
            const message = json.choices?.[0]?.message
            if (!message) throw new Error('Ollama (OpenAI compatible) returned no message')
            return {
                role: 'assistant',
                content: message.content,
                tool_calls: message.tool_calls
            }
        }
    } catch (e) {
        // Fallback to native API if /v1 fails (e.g. older Ollama versions)
        // Native API does not support tools well in this abstraction, so we might warn or fail if tools are required
        console.warn('Ollama OpenAI-compatible endpoint failed, falling back to native /api/chat', e)
    }

    // Native Fallback
    const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages: ollamaMessages,
            stream: false,
            // Native tools support is experimental/different
        })
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Ollama request failed: ${res.status} ${text}`)
    }

    const json = await res.json()
    return {
        role: 'assistant',
        content: json.message.content
        // Native tool calls mapping would go here if needed
    }
  }
}

export function createOllamaClientFromEnv(): OllamaProvider | null {
  // Check if Ollama is configured via env
  const baseUrl = process.env.OLLAMA_API_URL || process.env.AI_API_URL
  if (baseUrl || process.env.OLLAMA_HOST) {
    return new OllamaProvider(baseUrl)
  }
  return null
}
