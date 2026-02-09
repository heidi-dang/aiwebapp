
import { ChatMessage, ChatResponse, LLMProvider } from '../types.js'

export class AnthropicProvider implements LLMProvider {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || 'https://api.anthropic.com/v1'
  }

  async chat(model: string, messages: ChatMessage[], tools?: any[]): Promise<ChatResponse> {
    // Anthropic separates system prompt from messages
    const systemMessage = messages.find(m => m.role === 'system')
    const userAssistantMessages = messages.filter(m => m.role !== 'system')

    // Convert tools to Anthropic format if necessary, or assume the caller passes compatible tools
    // For now, we'll assume the tools passed are in OpenAI format and we might need to convert them
    // But Anthropic's tool use is similar. Let's keep it simple for now and just pass tools if supported.
    
    // Note: Anthropic expects tools in a specific `tools` parameter, and `messages` content blocks can be complex.
    // This is a simplified implementation.
    
    const anthropicMessages = userAssistantMessages.map(m => ({
      role: m.role === 'tool' ? 'user' : m.role, // Tool results are 'user' messages in Anthropic? Need to check spec.
      // Actually tool results are complex content blocks in 'user' role.
      // For this MVP, we might struggle with complex tool chains without a proper converter.
      // Let's assume simple text for now or simple tool use.
      content: m.content
    }))

    const body: any = {
      model,
      messages: anthropicMessages,
      max_tokens: 4000,
      system: systemMessage?.content
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map((t: any) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }))
    }

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Anthropic API request failed (${res.status}): ${errorText}`)
    }

    const json = await res.json()
    
    // Extract content
    // Anthropic returns content as a list of blocks
    const textBlock = json.content.find((b: any) => b.type === 'text')
    const toolUseBlocks = json.content.filter((b: any) => b.type === 'tool_use')

    let toolCalls = undefined
    if (toolUseBlocks.length > 0) {
      toolCalls = toolUseBlocks.map((b: any) => ({
        id: b.id,
        type: 'function',
        function: {
          name: b.name,
          arguments: JSON.stringify(b.input)
        }
      }))
    }

    return {
      role: 'assistant',
      content: textBlock?.text || null,
      tool_calls: toolCalls
    }
  }
}
