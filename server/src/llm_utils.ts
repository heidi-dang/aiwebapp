
export interface LLMOptions {
  model?: string
  provider?: string
  temperature?: number
  maxTokens?: number
}

export async function callSimpleLLM(prompt: string, options: LLMOptions = {}): Promise<string> {
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1'
  const apiKey = process.env.AI_API_KEY
  
  // Auto-detect provider based on URL or env vars
  const isOllama = apiUrl.includes('11434') || process.env.AI_PROVIDER === 'ollama'
  const isLocal = isOllama || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')

  if (!apiKey && !isLocal) {
    throw new Error('API key not configured')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model || process.env.AI_MODEL || 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.3
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM API failed: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}
