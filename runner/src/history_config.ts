export type HistoryMode = 'ALWAYS' | 'ON_DEMAND' | 'MANUAL'

export interface HistoryConfig {
  mode: HistoryMode
  maxMessages?: number
  includeToolCalls?: boolean
  includeSystemMessages?: boolean
}