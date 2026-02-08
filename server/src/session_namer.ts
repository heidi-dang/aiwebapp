import { EventEmitter } from 'events'

export interface SessionNamingOptions {
  enabled: boolean
  model?: string
  provider?: string
  maxLength?: number
}

export class SessionNamer extends EventEmitter {
  private readonly options: SessionNamingOptions

  constructor(options: SessionNamingOptions = { enabled: true }) {
    super()
    this.options = {
      model: 'gpt-3.5-turbo',
      provider: 'openai',
      maxLength: 50,
      ...options
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    if (!this.options.enabled) {
      return this.generateFallbackTitle(firstMessage)
    }

    try {
      const prompt = this.buildNamingPrompt(firstMessage)
      const response = await this.callLLM(prompt)
      return this.cleanTitle(response)
    } catch (error) {
      console.warn('Failed to generate session title:', error)
      return this.generateFallbackTitle(firstMessage)
    }
  }

  private buildNamingPrompt(message: string): string {
    return `Based on this user message, generate a concise, descriptive session title (max 5 words):

Message: "${message}"

Rules:
- Use simple, clear language
- Focus on the main task or topic
- Avoid technical jargon
- Make it user-friendly

Examples:
- "Fix login bug" → "Login Fix"
- "Create API documentation" → "API Docs"
- "Help with React component" → "React Help"

Title:`
  }

  private async callLLM(prompt: string): Promise<string> {
    const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1'
    const apiKey = process.env.AI_API_KEY

    if (!apiKey) {
      throw new Error('API key not configured')
    }

    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 20,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      throw new Error(`LLM API failed: ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || ''
  }

  private cleanTitle(title: string): string {
    // Remove quotes and extra whitespace
    let cleaned = title.replace(/^["']|["']$/g, '').trim()
    
    // Limit length
    if (cleaned.length > this.options.maxLength!) {
      cleaned = cleaned.substring(0, this.options.maxLength).trim()
    }
    
    // Fallback if empty or too generic
    if (!cleaned || cleaned.length < 3) {
      return this.generateFallbackTitle('')
    }
    
    return cleaned
  }

  private generateFallbackTitle(message: string): string {
    // Simple fallback based on message content
    const lowerMessage = message.toLowerCase()
    
    if (lowerMessage.includes('bug') || lowerMessage.includes('fix')) {
      return 'Bug Fix'
    } else if (lowerMessage.includes('api') || lowerMessage.includes('endpoint')) {
      return 'API Work'
    } else if (lowerMessage.includes('ui') || lowerMessage.includes('component')) {
      return 'UI Update'
    } else if (lowerMessage.includes('test')) {
      return 'Testing'
    } else if (lowerMessage.includes('doc')) {
      return 'Documentation'
    } else if (lowerMessage.includes('help') || lowerMessage.includes('?')) {
      return 'Help Request'
    } else if (message.length > 10) {
      // Use first few words
      return message.split(' ').slice(0, 3).join(' ')
    } else {
      return 'New Session'
    }
  }
}

export const sessionNamer = new SessionNamer()