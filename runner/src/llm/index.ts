
import { LLMConfig, ChatMessage, ChatResponse, LLMProvider } from './types.js'
import { OpenAIProvider } from './providers/openai.js'

export class LLMService {
  private providers: Map<string, LLMProvider> = new Map()

  constructor() {
    // Pre-register default providers
    // We can also allow dynamic registration
  }

  async chat(config: LLMConfig, messages: ChatMessage[], tools?: any[]): Promise<ChatResponse> {
    const provider = this.getProvider(config)
    
    try {
      return await provider.chat(config.model, messages, tools)
    } catch (err) {
      console.error(`LLM Chat failed with provider ${config.provider}:`, err)
      // Implement fallback logic here if needed
      // For now, rethrow
      throw err
    }
  }

  private getProvider(config: LLMConfig): LLMProvider {
    if (this.providers.has(config.provider)) {
      return this.providers.get(config.provider)!
    }

    if (config.provider === 'openai' || config.provider === 'mock') { // Mock often uses OpenAI compatible API locally
      const apiKey = config.apiKey || process.env.AI_API_KEY || ''
      const provider = new OpenAIProvider(apiKey, config.baseUrl)
      this.providers.set(config.provider, provider)
      return provider
    }

    throw new Error(`Provider ${config.provider} not supported`)
  }
}

export const llmService = new LLMService()
