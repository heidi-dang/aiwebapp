import { llmService } from './llm/index.js'
import type { ChatMessage } from './llm/types.js'

export interface CompressionOptions {
  enabled: boolean
  tokenThreshold: number
  maxCompressedMessages: number
  summaryModel?: string
  summaryProvider?: string
}

export interface CompressionResult {
  originalCount: number
  compressedCount: number
  summary: string
  savedTokens: number
}

export class ContextCompressor {
  private readonly options: CompressionOptions

  constructor(options: Partial<CompressionOptions> = {}) {
    this.options = {
      enabled: true,
      tokenThreshold: 4000,
      maxCompressedMessages: 10,
      summaryModel: 'gpt-3.5-turbo',
      summaryProvider: 'openai',
      ...options
    }
  }

  async compressMessages(messages: ChatMessage[]): Promise<CompressionResult> {
    if (!this.options.enabled || messages.length === 0) {
      return {
        originalCount: messages.length,
        compressedCount: messages.length,
        summary: '',
        savedTokens: 0
      }
    }

    // Estimate tokens (rough approximation)
    const estimatedTokens = this.estimateTokens(messages)
    
    if (estimatedTokens < this.options.tokenThreshold) {
      return {
        originalCount: messages.length,
        compressedCount: messages.length,
        summary: '',
        savedTokens: 0
      }
    }

    return await this.createSummary(messages)
  }

  private estimateTokens(messages: ChatMessage[]): number {
    // Rough estimation: ~4 characters per token
    let totalChars = 0
    for (const msg of messages) {
      totalChars += JSON.stringify(msg).length
    }
    return Math.ceil(totalChars / 4)
  }

  private async createSummary(messages: ChatMessage[]): Promise<CompressionResult> {
    // Group messages by role and extract key content
    const conversationSummary = this.extractConversationSummary(messages)
    
    const summaryPrompt = `Create a concise summary of this conversation. Focus on:
- Key topics discussed
- Important decisions made
- Action items or next steps
- Any unresolved issues

Keep it under 200 words and make it actionable.

Conversation:
${conversationSummary}

Summary:`

    try {
      const response = await llmService.chat({
        provider: this.options.summaryProvider!,
        model: this.options.summaryModel!,
        apiKey: process.env.AI_API_KEY
      }, [
        { role: 'user', content: summaryPrompt }
      ])

      const summary = response.content || 'Previous conversation summarized'
      const originalCount = messages.length
      const compressedCount = Math.min(this.options.maxCompressedMessages, Math.ceil(messages.length * 0.3))
      
      return {
        originalCount,
        compressedCount,
        summary,
        savedTokens: Math.max(0, this.estimateTokens(messages) - this.estimateTokens([{ role: 'system', content: summary }]))
      }
    } catch (error) {
      console.warn('Failed to create conversation summary:', error)
      return {
        originalCount: messages.length,
        compressedCount: messages.length,
        summary: 'Previous conversation (summary unavailable)',
        savedTokens: 0
      }
    }
  }

  private extractConversationSummary(messages: ChatMessage[]): string {
    const summary: string[] = []
    let currentSpeaker = ''
    
    for (const msg of messages) {
      if (msg.role === 'system') continue
      
      const speaker = msg.role === 'user' ? 'User' : 'Assistant'
      if (speaker !== currentSpeaker) {
        summary.push(`\n${speaker}:`)
        currentSpeaker = speaker
      }
      
      if (msg.content) {
        // Truncate very long messages
        const content = msg.content.length > 200 ? 
          msg.content.substring(0, 200) + '...' : 
          msg.content
        summary.push(content)
      }
      
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        summary.push(`[Used ${msg.tool_calls.length} tool(s)]`)
      }
    }
    
    return summary.join('\n')
  }

  createCompressedMessage(summary: string): ChatMessage {
    return {
      role: 'system',
      content: `Previous conversation summary:\n${summary}`
    }
  }
}

export const contextCompressor = new ContextCompressor()