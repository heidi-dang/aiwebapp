"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotClient = void 0;
const vscode = __importStar(require("vscode"));
class CopilotClient {
    constructor(config) {
        this.config = config;
    }
    async getAvailableModels() {
        // Get available models from VS Code's language model API
        const models = [];
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
        }
        catch (error) {
            console.warn('Failed to get Copilot models:', error);
            // Return default models if API fails
            models.push({
                id: 'gpt-4o',
                object: 'model',
                created: Date.now() / 1000,
                owned_by: 'github-copilot'
            }, {
                id: 'gpt-3.5-turbo',
                object: 'model',
                created: Date.now() / 1000,
                owned_by: 'github-copilot'
            });
        }
        return models;
    }
    async createChatCompletion(request) {
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
        const options = {
            justification: 'AIWebApp Copilot Gateway API request'
        };
        // Add temperature if specified
        if (request.temperature !== undefined) {
            // VS Code API doesn't directly support temperature, but we can try to set it
            options.temperature = request.temperature;
        }
        // Add max tokens if specified
        if (request.max_tokens !== undefined) {
            options.maxTokens = request.max_tokens;
        }
        let attempts = 0;
        let lastError = null;
        while (attempts <= this.config.retryAttempts) {
            try {
                // Make the request to Copilot using the correct API
                const cts = new vscode.CancellationTokenSource();
                const timeoutHandle = setTimeout(() => cts.cancel(), this.config.timeout);
                try {
                    const response = await model.sendRequest(messages, options, cts.token);
                    // Convert response back to OpenAI format
                    const completion = await this.processCopilotResponse(response, request);
                    // Add usage information (estimated)
                    const usage = this.estimateTokenUsage(request.messages, completion.choices[0].message.content || '');
                    return {
                        ...completion,
                        usage,
                        session_id: request.session_id
                    };
                }
                finally {
                    clearTimeout(timeoutHandle);
                    cts.dispose();
                }
            }
            catch (error) {
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
    async isCopilotAvailable() {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            return models && models.length > 0;
        }
        catch (error) {
            return false;
        }
    }
    async selectModel(modelName) {
        try {
            // Map common model names to Copilot families
            let family;
            switch (modelName.toLowerCase()) {
                case 'gpt-4':
                case 'gpt-4o':
                    family = 'gpt-4o';
                    break;
                case 'gpt-3.5-turbo':
                    family = 'gpt-3.5-turbo';
                    break;
                default:
                    family = 'gpt-4o'; // Default to GPT-4
            }
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: family
            });
            return models && models.length > 0 ? models[0] : undefined;
        }
        catch (error) {
            console.error('Error selecting model:', error);
            return undefined;
        }
    }
    convertMessages(openaiMessages) {
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
    async processCopilotResponse(response, originalRequest) {
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
    async streamToString(stream) {
        let result = '';
        for await (const part of stream) {
            if (part.type === 'text') {
                result += part.text;
            }
        }
        return result;
    }
    estimateTokenUsage(messages, response) {
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
    async *createStreamingChatCompletion(request) {
        const model = await this.selectModel(request.model);
        if (!model) {
            throw new Error(`Model not found: ${request.model}`);
        }
        const messages = this.convertMessages(request.messages);
        const cts = new vscode.CancellationTokenSource();
        const timeoutHandle = setTimeout(() => cts.cancel(), this.config.timeout);
        try {
            const response = await model.sendRequest(messages, {}, cts.token);
            const responseId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2)}`;
            let responseText = '';
            for await (const part of response.stream) {
                const p = part;
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
        finally {
            clearTimeout(timeoutHandle);
            cts.dispose();
        }
    }
}
exports.CopilotClient = CopilotClient;
//# sourceMappingURL=CopilotClient.js.map