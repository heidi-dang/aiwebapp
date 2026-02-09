import { ChatMessage } from '../llm/types.js';
import { LLMService } from '../llm/index.js';

export interface CompressionConfig {
  maxTokens: number;
  summarizeThreshold: number;
  preserveLastN: number;
  charsPerToken: number;
}

export class ContextManager {
  private config: CompressionConfig;

  constructor(
    private llmService: LLMService,
    config: Partial<CompressionConfig> = {}
  ) {
    this.config = {
      maxTokens: 16000,
      summarizeThreshold: 12000,
      preserveLastN: 10,
      charsPerToken: 4,
      ...config
    };
  }

  /**
   * Compress the conversation history if it exceeds the token limit
   */
  async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (messages.length === 0) return messages;

    const estimatedTokens = this.estimateTokens(messages);
    
    if (estimatedTokens < this.config.summarizeThreshold) {
      return messages;
    }

    // Identify parts of the conversation
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // Keep the last N messages intact
    const preservedCount = Math.min(this.config.preserveLastN, otherMessages.length);
    const recentMessages = otherMessages.slice(-preservedCount);
    const olderMessages = otherMessages.slice(0, -preservedCount);

    if (olderMessages.length === 0) {
      return messages; // Nothing to summarize
    }

    // Summarize older messages
    const summary = await this.summarizeMessages(olderMessages);

    // Construct new history
    const newHistory: ChatMessage[] = [];
    
    if (systemMessage) {
      newHistory.push(systemMessage);
    }

    // Add summary as a system note or user message context
    newHistory.push({
      role: 'system',
      content: `Previous conversation summary:\n${summary}`
    });

    // Add recent messages
    newHistory.push(...recentMessages);

    return newHistory;
  }

  private estimateTokens(messages: ChatMessage[]): number {
    const text = messages.map(m => m.content || '').join('');
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  private async summarizeMessages(messages: ChatMessage[]): Promise<string> {
    const textToSummarize = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const prompt = `Summarize the following conversation history, preserving key decisions, code snippets, and task progress. Keep it concise.\n\n${textToSummarize}`;

    try {
      // Use a cheap/fast model for summarization if possible
      // For now, we reuse the default provider/model from LLMService config or just use a generic call
      // Since LLMService.chat requires a config, we need to know what to use.
      // We'll assume the caller might want to configure this, but for now we'll use a default config.
      // Ideally, ContextManager should know about the current agent's model config.
      // We'll add a 'modelConfig' parameter to summarizeMessages or constructor.
      // For simplicity, we'll assume LLMService has a default or we pass a generic one.
      
      const response = await this.llmService.chat(
        { provider: 'openai', model: 'gpt-4o-mini' }, // Use a cheaper model for summarization
        [{ role: 'user', content: prompt }]
      );

      return response.content;
    } catch (err) {
      console.warn('Failed to summarize context:', err);
      return 'Context truncated due to length.';
    }
  }
}
