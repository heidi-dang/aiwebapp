import { ChatCompletionRequest, ChatCompletionResponse, StreamingChatCompletionResponse, ModelInfo } from '../types';
interface CopilotClientConfig {
    timeout: number;
    retryAttempts: number;
}
export declare class CopilotClient {
    private config;
    constructor(config: CopilotClientConfig);
    getAvailableModels(): Promise<ModelInfo[]>;
    createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
    private isCopilotAvailable;
    private selectModel;
    private convertMessages;
    private processCopilotResponse;
    private streamToString;
    private estimateTokenUsage;
    createStreamingChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamingChatCompletionResponse>;
}
export {};
//# sourceMappingURL=CopilotClient.d.ts.map