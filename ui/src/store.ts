import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import {
  AgentDetails,
  SessionEntry,
  TeamDetails,
  type ChatMessage
} from '@/types/os'

import type { RunnerEvent, RunState, RunStatus } from '@/lib/runner/types'

interface Store {
  hydrated: boolean
  setHydrated: () => void
  streamingErrorMessage: string
  setStreamingErrorMessage: (streamingErrorMessage: string) => void
  endpoints: {
    endpoint: string
    id__endpoint: string
  }[]
  setEndpoints: (
    endpoints: {
      endpoint: string
      id__endpoint: string
    }[]
  ) => void
  isStreaming: boolean
  setIsStreaming: (isStreaming: boolean) => void
  isEndpointActive: boolean
  setIsEndpointActive: (isActive: boolean) => void
  isEndpointLoading: boolean
  setIsEndpointLoading: (isLoading: boolean) => void
  messages: ChatMessage[]
  setMessages: (
    messages: ChatMessage[] | ((prevMessages: ChatMessage[]) => ChatMessage[])
  ) => void
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>
  selectedEndpoint: string
  setSelectedEndpoint: (selectedEndpoint: string) => void
  authToken: string
  setAuthToken: (authToken: string) => void
  agents: AgentDetails[]
  setAgents: (agents: AgentDetails[]) => void
  teams: TeamDetails[]
  setTeams: (teams: TeamDetails[]) => void
  selectedModel: string
  setSelectedModel: (model: string) => void
  availableModels: string[]
  setAvailableModels: (models: string[]) => void
  mode: 'agent' | 'team'
  setMode: (mode: 'agent' | 'team') => void
  provider: 'bridge' | 'copilotapi' | 'ollama'
  setProvider: (provider: 'bridge' | 'copilotapi' | 'ollama') => void
  runtimeMode: 'local' | 'sandbox'
  setRuntimeMode: (runtimeMode: 'local' | 'sandbox') => void
  cloudFallbackEnabled: boolean
  setCloudFallbackEnabled: (cloudFallbackEnabled: boolean) => void
  pocReviewBaseDir: string
  setPocReviewBaseDir: (pocReviewBaseDir: string) => void
  pocReviewChecksJson: string
  setPocReviewChecksJson: (pocReviewChecksJson: string) => void
  pocReviewTemplates: Array<{ id: string; name: string; checksJson: string }>
  setPocReviewTemplates: (
    templates:
      | Array<{ id: string; name: string; checksJson: string }>
      | ((
          prev: Array<{ id: string; name: string; checksJson: string }>
        ) => Array<{ id: string; name: string; checksJson: string }>)
  ) => void
  selectedPocReviewTemplateId: string
  setSelectedPocReviewTemplateId: (id: string) => void
  // System prompt for agents
  systemPromptMode: 'default' | 'strict' | 'custom'
  setSystemPromptMode: (mode: 'default' | 'strict' | 'custom') => void
  systemPromptCustom: string
  setSystemPromptCustom: (prompt: string) => void
  sessionsData: SessionEntry[] | null
  setSessionsData: (
    sessionsData:
      | SessionEntry[]
      | ((prevSessions: SessionEntry[] | null) => SessionEntry[] | null)
  ) => void
  isSessionsLoading: boolean
  setIsSessionsLoading: (isSessionsLoading: boolean) => void

  runs: Record<string, RunState>
  runUi: Record<string, { collapsed: boolean; unsubscribe?: () => void }>
  initRun: (jobId: string) => void
  applyRunnerEvent: (event: RunnerEvent) => void
  setRunCollapsed: (jobId: string, collapsed: boolean) => void
  setRunUnsubscribe: (jobId: string, unsubscribe?: () => void) => void
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      streamingErrorMessage: '',
      setStreamingErrorMessage: (streamingErrorMessage) =>
        set(() => ({ streamingErrorMessage })),
      endpoints: [],
      setEndpoints: (endpoints) => set(() => ({ endpoints })),
      isStreaming: false,
      setIsStreaming: (isStreaming) => set(() => ({ isStreaming })),
      isEndpointActive: false,
      setIsEndpointActive: (isActive) =>
        set(() => ({ isEndpointActive: isActive })),
      isEndpointLoading: true,
      setIsEndpointLoading: (isLoading) =>
        set(() => ({ isEndpointLoading: isLoading })),
      messages: [],
      setMessages: (messages) =>
        set((state) => ({
          messages:
            typeof messages === 'function' ? messages(state.messages) : messages
        })),
      chatInputRef: { current: null },
      selectedEndpoint: 'http://localhost:4001',
      setSelectedEndpoint: (selectedEndpoint) =>
        set(() => ({ selectedEndpoint })),
      authToken: '',
      setAuthToken: (authToken) => set(() => ({ authToken })),
      agents: [],
      setAgents: (agents) => set({ agents }),
      teams: [],
      setTeams: (teams) => set({ teams }),
      selectedModel: 'auto',
      setSelectedModel: (selectedModel) => set(() => ({ selectedModel })),
      availableModels: [],
      setAvailableModels: (availableModels) => set(() => ({ availableModels })),
      mode: 'agent',
      setMode: (mode) => set(() => ({ mode })),
      provider: 'bridge',
      setProvider: (provider) => set(() => ({ provider })),
      runtimeMode: 'sandbox',
      setRuntimeMode: (runtimeMode) => set(() => ({ runtimeMode })),
      cloudFallbackEnabled: true,
      setCloudFallbackEnabled: (cloudFallbackEnabled) =>
        set(() => ({ cloudFallbackEnabled })),
      pocReviewBaseDir: '',
      setPocReviewBaseDir: (pocReviewBaseDir) =>
        set(() => ({ pocReviewBaseDir })),
      pocReviewChecksJson: '',
      setPocReviewChecksJson: (pocReviewChecksJson) =>
        set(() => ({ pocReviewChecksJson })),
      pocReviewTemplates: [],
      setPocReviewTemplates: (pocReviewTemplates) =>
        set((state) => ({
          pocReviewTemplates:
            typeof pocReviewTemplates === 'function'
              ? pocReviewTemplates(state.pocReviewTemplates)
              : pocReviewTemplates
        })),
      selectedPocReviewTemplateId: '',
      setSelectedPocReviewTemplateId: (selectedPocReviewTemplateId) =>
        set(() => ({ selectedPocReviewTemplateId })),
      // System prompt defaults (agent mode only)
      systemPromptMode: 'default',
      setSystemPromptMode: (systemPromptMode) =>
        set(() => ({ systemPromptMode })),
      systemPromptCustom: '',
      setSystemPromptCustom: (systemPromptCustom) =>
        set(() => ({ systemPromptCustom })),
      sessionsData: null,
      setSessionsData: (sessionsData) =>
        set((state) => ({
          sessionsData:
            typeof sessionsData === 'function'
              ? sessionsData(state.sessionsData)
              : sessionsData
        })),
      isSessionsLoading: false,
      setIsSessionsLoading: (isSessionsLoading) =>
        set(() => ({ isSessionsLoading })),

      runs: {},
      runUi: {},
      initRun: (jobId) =>
        set((state) => ({
          runs: {
            ...state.runs,
            [jobId]: {
              jobId,
              status: 'pending',
              events: []
            }
          },
          runUi: {
            ...state.runUi,
            [jobId]: state.runUi[jobId] ?? { collapsed: false }
          }
        })),
      applyRunnerEvent: (event) =>
        set((state) => {
          const jobId = event.job_id
          const prev = state.runs[jobId] ?? {
            jobId,
            status: 'pending' as RunStatus,
            events: []
          }

          if (prev.events.some((e) => e.raw.id === event.id)) {
            return state
          }

          const ts = Date.parse(event.ts)
          const nextEvents = [
            ...prev.events,
            {
              key: event.id,
              type: event.type,
              ts: Number.isFinite(ts) ? ts : Date.now(),
              payload: event.data,
              raw: event
            }
          ]

          let status: RunStatus = prev.status
          let startedAt = prev.startedAt
          let finishedAt = prev.finishedAt

          if (event.type === 'job.started') {
            status = 'running'
            startedAt = startedAt ?? (Number.isFinite(ts) ? ts : Date.now())
          } else if (event.type === 'job.cancelled') {
            status = 'cancelled'
          } else if (event.type === 'job.timeout') {
            status = 'timeout'
          } else if (event.type === 'error') {
            status = 'error'
          } else if (event.type === 'done') {
            finishedAt = finishedAt ?? (Number.isFinite(ts) ? ts : Date.now())
            if (
              status !== 'error' &&
              status !== 'cancelled' &&
              status !== 'timeout'
            ) {
              status = 'done'
            }
          }

          return {
            runs: {
              ...state.runs,
              [jobId]: {
                ...prev,
                status,
                startedAt,
                finishedAt,
                events: nextEvents
              }
            },
            runUi: {
              ...state.runUi,
              [jobId]: state.runUi[jobId] ?? { collapsed: false }
            }
          }
        }),
      setRunCollapsed: (jobId, collapsed) =>
        set((state) => ({
          runUi: {
            ...state.runUi,
            [jobId]: {
              ...(state.runUi[jobId] ?? { collapsed: false }),
              collapsed
            }
          }
        })),
      setRunUnsubscribe: (jobId, unsubscribe) =>
        set((state) => ({
          runUi: {
            ...state.runUi,
            [jobId]: {
              ...(state.runUi[jobId] ?? { collapsed: false }),
              unsubscribe
            }
          }
        }))
    }),
    {
      name: 'endpoint-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedEndpoint: state.selectedEndpoint,
        pocReviewTemplates: state.pocReviewTemplates,
        selectedPocReviewTemplateId: state.selectedPocReviewTemplateId
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated?.()
      }
    }
  )
)
