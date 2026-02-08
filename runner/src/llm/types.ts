
export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface ChatResponse {
  role: 'assistant';
  content: string | null;
  tool_calls?: any[];
}

export interface LLMProvider {
  chat(model: string, messages: ChatMessage[], tools?: any[]): Promise<ChatResponse>;
}
