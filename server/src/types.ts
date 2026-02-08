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

export interface SessionEntry {
  session_id: string
  session_name: string
  created_at: number
  updated_at?: number
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
  password_hash?: string
  name?: string
  avatar_url?: string
  email_verified: boolean
  role: 'admin' | 'user'
  created_at: number
  updated_at: number
  last_login_at?: number
}

export interface UserSession {
  id: string
  user_id: string
  token_hash: string
  expires_at: number
  created_at: number
}

export interface SocialAccount {
  id: string
  user_id: string
  provider: 'google' | 'github' | 'apple' | 'microsoft'
  provider_id: string
  provider_data?: string
  created_at: number
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  user: User
}

export interface RegisterRequest {
  email: string
  password: string
  name?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface OAuthProfile {
  id: string
  email: string
  name?: string
  avatar_url?: string
  provider: 'google' | 'github' | 'apple' | 'microsoft'
}

export interface ModelConfig {
  name: string
  model: string
  provider: string
  apiKey?: string
  db_id?: string
}
