
import { ChatMessage, ChatResponse, LLMProvider } from '../types.js'

export class OpenAIProvider implements LLMProvider {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || process.env.AI_API_URL || 'https://api.openai.com/v1'
  }

  async chat(model: string, messages: ChatMessage[], tools?: any[]): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(this.apiKey && { 'X-API-Key': this.apiKey }) // For some proxies
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
        temperature: 0.2,
        max_tokens: 4000
      })
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`OpenAI API request failed (${res.status}): ${errorText}`)
    }

    const json = await res.json()
    const choice = json.choices?.[0]
    const message = choice?.message

    if (!message) throw new Error('OpenAI API returned no message')

    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls
    }
  }
}
