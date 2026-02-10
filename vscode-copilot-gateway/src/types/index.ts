export interface ServerConfig {
  port: number;
  host: string;
  apiKey?: string;
  maxConcurrentRequests: number;
  requestTimeout: number;
  retryAttempts: number;
  authService?: any;
  sessionManager?: any;
  metricsService?: any;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  user?: string;
  session_id?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: TokenUsage;
  session_id?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface StreamingChatCompletionResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: StreamingChatCompletionChoice[];
  usage?: TokenUsage;
  session_id?: string;
}

export interface StreamingChatCompletionChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

export interface ModelsResponse {
  object: 'list';
  data: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface AuthToken {
  user_id: string;
  session_id: string;
  permissions: string[];
  expires_at: number;
}

export interface SessionData {
  id: string;
  user_id?: string;
  messages: ChatMessage[];
  created_at: number;
  updated_at: number;
  metadata?: Record<string, any>;
}

export interface MetricsData {
  timestamp: number;
  user_id?: string;
  session_id?: string;
  model: string;
  tokens_used: number;
  request_duration: number;
  status: 'success' | 'error';
  error_type?: string;
}

export interface QueueItem {
  id: string;
  request: ChatCompletionRequest;
  responsePromise: {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  };
  timestamp: number;
  priority: number;
}

export interface ServerStats {
  uptime: number;
  totalRequests: number;
  activeRequests: number;
  queueLength: number;
  averageResponseTime: number;
  errorRate: number;
}

export interface WebSocketMessage {
  type: 'subscribe' | 'ping' | 'pong';
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends express.Request {
  userId?: string;
}
