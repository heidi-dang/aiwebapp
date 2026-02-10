export interface ServerConfig {
  port: number;
  host: string;
  apiKey: string;
  maxConcurrentRequests: number;
  requestTimeout: number;
  retryAttempts: number;
  backendUrl: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: Tool[];
  tool_choice?: 'none' | 'auto' | ToolChoice;
  session_id?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
}

export interface ToolChoice {
  type: 'function';
  function: {
    name: string;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ModelsResponse {
  object: 'list';
  data: Model[];
}

export interface Model {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface ServerStats {
  uptime: number;
  totalRequests: number;
  activeRequests: number;
  queueLength: number;
  averageResponseTime: number;
  errorRate: number;
}

export interface CopilotClientConfig {
  timeout: number;
  retryAttempts: number;
}