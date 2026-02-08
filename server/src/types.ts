export type EntityType = 'agent' | 'team'

export interface Model {
  name: string
  model: string
  provider: string
}

export interface AgentDetails {
  id: string
  name?: string
  db_id?: string
  model?: Model
}

export interface TeamDetails {
  id: string
  name?: string
  db_id?: string
  model?: Model
}

export interface ToolDetails {
  name: string
  description: string
  parameters?: any
}

export interface SessionEntry {
  session_id: string
  session_name: string
  created_at: number
  updated_at?: number
  entity_type?: EntityType
  component_id?: string
}

export interface RunRecord {
  run_input?: string
  content?: string | object
  created_at: number
  tools?: unknown[]
  extra_data?: unknown
  images?: unknown
  videos?: unknown
  audio?: unknown
  response_audio?: unknown
}

export enum RunEvent {
  RunStarted = 'RunStarted',
  RunContent = 'RunContent',
  RunCompleted = 'RunCompleted',
  RunError = 'RunError',
  TeamRunStarted = 'TeamRunStarted',
  TeamRunContent = 'TeamRunContent',
  TeamRunCompleted = 'TeamRunCompleted',
  TeamRunError = 'TeamRunError'
}

export interface StreamChunk {
  event: RunEvent
  content_type: 'text'
  created_at: number
  session_id?: string
  agent_id?: string
  team_id?: string
  content?: string
}

export interface User {
  id: string
  email: string
  name?: string
  role: 'admin' | 'user'
  created_at: number
  last_login_at?: number
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  user: User
}

export interface ModelConfig {
  name: string
  model: string
  provider: string
  apiKey?: string
  db_id?: string
}
