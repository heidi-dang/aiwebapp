
import { Store } from '../storage.js'
import { callSimpleLLM } from '../llm_utils.js'

export class Summarizer {
  constructor(private store: Store) {}

  async summarizeSession(sessionId: string): Promise<string> {
    const runs = await this.store.getRuns({ sessionId })
    if (runs.length === 0) return ''

    // Convert runs to text format
    const conversation = runs.map(r => {
      const input = r.run_input ? `User: ${r.run_input}` : ''
      let output = ''
      if (typeof r.content === 'string') {
        output = `Assistant: ${r.content}`
      } else if (r.content) {
        output = `Assistant: ${JSON.stringify(r.content)}`
      }
      return `${input}\n${output}`
    }).join('\n\n')

    return await this.callLLM(conversation)
  }

  private async callLLM(conversation: string): Promise<string> {
    const prompt = `Summarize the following conversation in 3-5 sentences, capturing the key technical decisions, progress, and current state.

Conversation:
${conversation.slice(0, 15000)} // Limit context to avoid overflow

Summary:`

    return await callSimpleLLM(prompt, {
        maxTokens: 300,
        temperature: 0.3
    })
  }
}
