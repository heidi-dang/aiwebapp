
import dotenv from 'dotenv'
dotenv.config()

export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.AI_API_KEY
  if (!apiKey) {
    throw new Error('AI_API_KEY is not configured')
  }

  const response = await fetch(`${process.env.AI_API_URL || 'https://api.openai.com'}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small' // Or configurable
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get embedding: ${error}`)
  }

  const json = await response.json()
  return json.data[0].embedding
}
