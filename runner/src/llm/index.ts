
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
    const providersToTry = [config.provider]
    if (config.fallbackOrder) {
      // Add fallbacks, filtering out duplicates
      config.fallbackOrder.forEach(p => {
        if (!providersToTry.includes(p)) providersToTry.push(p)
      })
    }

    let lastError: unknown

    for (const providerName of providersToTry) {
      try {
        // Create a temporary config for this attempt
        const attemptConfig = { ...config, provider: providerName }
        
        // Adjust model if switching to Ollama (fallback usually implies local)
        if (providerName === 'ollama' && !attemptConfig.model.includes(':')) {
             attemptConfig.model = 'qwen2.5-coder:7b' // Default safe local model
        }

        const provider = this.getProvider(attemptConfig)
        console.log(`[LLM] Attempting chat with provider: ${providerName} (model: ${attemptConfig.model})`)
        return await provider.chat(attemptConfig.model, messages, tools)
      } catch (err) {
        console.warn(`[LLM] Provider ${providerName} failed:`, err instanceof Error ? err.message : String(err))
        lastError = err
        
        // If we got a NEEDS_AUTH error from browser-proxy, we should notify but still fallback
        // The calling agent might handle this event if we exposed it, but for now we just log and fallback.
        
        // Continue to next provider
      }
    }

    console.error(`[LLM] All providers failed. Last error:`, lastError)
    throw lastError || new Error('All LLM providers failed')
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
    } else if (config.provider === 'openrouter') {
      const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || ''
      const baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1'
      provider = new OpenAIProvider(apiKey, baseUrl, {
        'HTTP-Referer': 'https://heidiai.com.au', // Required by OpenRouter
        'X-Title': 'HeidiAI Runner'
      })
    } else if (config.provider === 'browser-proxy') {
      // Connect to the internal Browser Proxy service
      const baseUrl = process.env.BROWSER_PROXY_URL || 'http://browser-proxy:3003/v1'
      const apiKey = 'internal' // No auth needed for internal docker network, or could use shared secret
      provider = new OpenAIProvider(apiKey, baseUrl)
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
