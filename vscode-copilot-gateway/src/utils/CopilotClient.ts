import * as vscode from 'vscode';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingChatCompletionResponse,
  ModelInfo
} from '../types';

interface CopilotClientConfig {
  timeout: number;
  retryAttempts: number;
}

export class CopilotClient {
  private config: CopilotClientConfig;

  constructor(config: CopilotClientConfig) {
    this.config = config;
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    // Get available models from VS Code's language model API
    const models: ModelInfo[] = [];

    try {
      // Check if Copilot is available
      const chatModels = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
      });

      if (chatModels && chatModels.length > 0) {
        models.push({
          id: 'gpt-4o',
          object: 'model',
          created: Date.now() / 1000,
          owned_by: 'github-copilot'
        });
      }

      // Add other potential models
      const gpt35Models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-3.5-turbo'
      });

      if (gpt35Models && gpt35Models.length > 0) {
        models.push({
          id: 'gpt-3.5-turbo',
          object: 'model',
          created: Date.now() / 1000,
          owned_by: 'github-copilot'
        });
      }

    } catch (error) {
      console.warn('Failed to get Copilot models:', error);
      // Return default models if API fails
      models.push(
        {
          id: 'gpt-4o',
          object: 'model',
          created: Date.now() / 1000,
          owned_by: 'github-copilot'
        },
        {
          id: 'gpt-3.5-turbo',
          object: 'model',
          created: Date.now() / 1000,
          owned_by: 'github-copilot'
        }
      );
    }

    return models;
  }

  async createChatCompletion(request: ChatCompletionRequest, options?: { signal?: AbortSignal }): Promise<ChatCompletionResponse> {
    // Validate that Copilot is available
    if (!await this.isCopilotAvailable()) {
      throw new Error('GitHub Copilot is not available. Please ensure Copilot Chat extension is installed and you are signed in.');
    }

    // Convert OpenAI format to VS Code LM API format
    const messages = this.convertMessages(request.messages);

    // Select appropriate model
    const model = await this.selectModel(request.model);
    if (!model) {
      throw new Error(`Model ${request.model} is not available`);
    }

    // Prepare request options
    const requestOptions: vscode.LanguageModelChatRequestOptions = {
      justification: 'heidi-gateway-proxy API request'
    };

    // Add temperature if specified
    if (request.temperature !== undefined) {
      (requestOptions as any).temperature = request.temperature;
    }

    // Add max tokens if specified
    if (request.max_tokens !== undefined) {
      (requestOptions as any).maxTokens = request.max_tokens;
    }

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts <= this.config.retryAttempts) {
      if (options?.signal?.aborted) {
        throw new Error('Request aborted');
      }

      try {
        // Make the request to Copilot using the correct API
        const cts = new vscode.CancellationTokenSource();

        // Handle external abort signal
        if (options?.signal) {
          options.signal.onabort = () => cts.cancel();
        }

        const timeoutHandle = setTimeout(() => cts.cancel(), this.config.timeout);

        try {
          const response = await model.sendRequest(messages, requestOptions, cts.token);

          // Convert response back to OpenAI format
          const completion = await this.processCopilotResponse(response, request);

          // Add usage information (estimated)
          const usage = this.estimateTokenUsage(
            request.messages,
            completion.choices[0].message.content || ''
          );

          return {
            ...completion,
            usage,
            session_id: request.session_id
          };
        } finally {
          clearTimeout(timeoutHandle);
          cts.dispose();
          if (options?.signal) {
            options.signal.onabort = null;
          }
        }

      } catch (error) {
        if (error instanceof vscode.CancellationError || options?.signal?.aborted) {
          throw new Error('Request aborted');
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;

        if (attempts <= this.config.retryAttempts) {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to get response from Copilot after retries');
  }

  private async isCopilotAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      return models && models.length > 0;
    } catch (error) {
      return false;
    }
  }

  private async selectModel(modelName: string): Promise<vscode.LanguageModelChat | undefined> {
    try {
      const name = (modelName || 'auto').toLowerCase().trim()

      const candidates: string[] = []
      const push = (v: string) => {
        if (!candidates.includes(v)) candidates.push(v)
      }

      if (name === 'auto' || name === '') {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' })
        return models && models.length > 0 ? models[0] : undefined
      }

      if (name.includes('gpt-3.5')) push('gpt-3.5-turbo')
      if (name.includes('gpt-4o') || name.includes('4o')) push('gpt-4o')
      if (name.includes('gpt-4.1')) push('gpt-4.1')
      if (name === 'gpt-4') push('gpt-4o')

      if (candidates.length === 0) {
        push('gpt-4o')
        push('gpt-3.5-turbo')
      }

      for (const family of candidates) {
        const models = await vscode.lm.selectChatModels({
          vendor: 'copilot',
          family
        })

        if (models && models.length > 0) return models[0]
      }

      return undefined
    } catch (error) {
      console.error('Error selecting model:', error);
      return undefined;
    }
  }

  private convertMessages(openaiMessages: any[]): vscode.LanguageModelChatMessage[] {
    return openaiMessages.map(msg => {
      switch (msg.role) {
        case 'system':
          return vscode.LanguageModelChatMessage.User(msg.content || '');
        case 'user':
          return vscode.LanguageModelChatMessage.User(msg.content || '');
        case 'assistant':
          return vscode.LanguageModelChatMessage.Assistant(msg.content || '');
        case 'tool':
          // Handle tool messages as user messages for now
          return vscode.LanguageModelChatMessage.User(`Tool result: ${msg.content || ''}`);
        default:
          return vscode.LanguageModelChatMessage.User(msg.content || '');
      }
    });
  }

  private async processCopilotResponse(
    response: vscode.LanguageModelChatResponse,
    originalRequest: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const responseText = await this.streamToString(response.stream);

    return {
      id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseText
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0, // Will be estimated
        completion_tokens: 0, // Will be estimated
        total_tokens: 0 // Will be estimated
      }
    };
  }

  private async streamToString(stream: AsyncIterable<any>): Promise<string> {
    let result = '';
    for await (const part of stream) {
      const p = part as any;
      if (p?.type === 'text') {
        const text =
          (typeof p.text === 'string' && p.text) ||
          (typeof p.value === 'string' && p.value) ||
          (typeof p.content === 'string' && p.content) ||
          '';
        result += text;
      }
    }
    return result;
  }

  private estimateTokenUsage(messages: any[], response: string): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
    // Rough estimation: ~4 characters per token
    const promptText = messages.map(m => m.content).join(' ');
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(response.length / 4);

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    };
  }

  // Streaming support
  async *createStreamingChatCompletion(request: ChatCompletionRequest, options?: { signal?: AbortSignal }): AsyncGenerator<StreamingChatCompletionResponse> {
    const model = await this.selectModel(request.model);
    if (!model) {
      throw new Error(`Model not found: ${request.model}`);
    }

    const messages = this.convertMessages(request.messages);
    const cts = new vscode.CancellationTokenSource();

    // Handle external abort signal
    if (options?.signal) {
      options.signal.onabort = () => cts.cancel();
      if (options.signal.aborted) {
        cts.cancel();
      }
    }

    const timeoutHandle = setTimeout(() => cts.cancel(), this.config.timeout);
    try {
      const response = await model.sendRequest(messages, {
        justification: 'heidi-gateway-proxy streaming API request'
      }, cts.token);

      const responseId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2)}`;
      let responseText = '';

      for await (const part of response.stream) {
        if (options?.signal?.aborted) {
          break;
        }

        const p = part as any;
        if (p?.type === 'text' && typeof p.text === 'string') {
          responseText += p.text;
          yield {
            id: responseId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: request.model,
            choices: [{
              index: 0,
              delta: {
                content: p.text
              },
              finish_reason: null
            }],
            session_id: request.session_id
          };
        }
      }

      if (!options?.signal?.aborted) {
        const usage = this.estimateTokenUsage(request.messages, responseText);
        yield {
          id: responseId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }],
          usage,
          session_id: request.session_id
        };
      }
    } catch (error) {
      if (error instanceof vscode.CancellationError || options?.signal?.aborted) {
        // Silent return on cancellation
        return;
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
      cts.dispose();
      if (options?.signal) {
        options.signal.onabort = null;
      }
    }
  }
}
