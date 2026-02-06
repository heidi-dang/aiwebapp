export type RunStatus =
  | 'pending'
  | 'running'
  | 'cancelled'
  | 'timeout'
  | 'done'
  | 'error'

export type RunnerEventType =
  | 'job.started'
  | 'job.cancelled'
  | 'job.timeout'
  | 'plan'
  | 'plan.update'
  | 'tool.start'
  | 'tool.output'
  | 'tool.end'
  | 'tool.refused'
  | 'error'
  | 'done'

export type RunnerEvent = {
  id: string
  type: RunnerEventType
  ts: string
  job_id: string
  data?: unknown
}

export type RunEvent = {
  key: string
  type: RunnerEventType
  ts: number
  payload?: unknown
  raw: RunnerEvent
}

export type RunState = {
  jobId: string
  status: RunStatus
  startedAt?: number
  finishedAt?: number
  events: RunEvent[]
}
