
import { LLMConfig, ChatMessage, ChatResponse, LLMProvider } from './types.js'
import { OpenAIProvider } from './providers/openai.js'
import { OllamaProvider } from './providers/ollama.js'
import { AnthropicProvider } from './providers/anthropic.js'

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
    // Check if we already have an instance for this provider
    // Note: We might need to key by provider+apiKey if different keys are used
    // For simplicity, we assume one global key per provider from env if not passed
    // But config.apiKey might change.
    
    // To support per-request keys, we might need to recreate the provider or pass the key to chat()
    // The current interface assumes provider is configured at creation.
    // Let's create a key for the map that includes the API key hash or similar if we want to cache.
    // Or simpler: just re-instantiate if we have explicit config, or cache the default one.
    
    const cacheKey = `${config.provider}:${config.apiKey || 'default'}`
    
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!
    }

    let provider: LLMProvider | undefined

    if (config.provider === 'openai' || config.provider === 'mock') {
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || ''
      provider = new OpenAIProvider(apiKey, config.baseUrl)
    } else if (config.provider === 'ollama') {
      provider = new OllamaProvider(config.baseUrl)
    } else if (config.provider === 'anthropic') {
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || ''
      provider = new AnthropicProvider(apiKey, config.baseUrl)
    }

    if (provider) {
      this.providers.set(cacheKey, provider)
      return provider
    }

    throw new Error(`Provider ${config.provider} not supported`)
  }
}

export const llmService = new LLMService()
