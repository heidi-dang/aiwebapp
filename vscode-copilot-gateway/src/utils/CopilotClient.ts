import { CopilotClientConfig, ChatCompletionRequest } from '../types';

export class CopilotClient {
  constructor(config: CopilotClientConfig) {}

  async getAvailableModels(): Promise<any[]> {
    return [];
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<any> {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello from Heidi AI Copilot Dashboard'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  }
}