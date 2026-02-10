import type { ChildProcess } from 'node:child_process'

const jobProcesses = new Map<string, Set<ChildProcess>>()

export function registerJobProcess(jobId: string, child: ChildProcess) {
  const set = jobProcesses.get(jobId) ?? new Set<ChildProcess>()
  set.add(child)
  jobProcesses.set(jobId, set)

  const cleanup = () => {
    const curr = jobProcesses.get(jobId)
    curr?.delete(child)
    if (curr && curr.size === 0) jobProcesses.delete(jobId)
  }

  child.on('exit', cleanup)
  child.on('close', cleanup)
  child.on('error', cleanup)
}

export function killJobProcesses(jobId: string) {
  const set = jobProcesses.get(jobId)
  if (!set) return

  for (const child of set) {
    try {
      child.kill('SIGKILL')
    } catch {
    }
  }

  jobProcesses.delete(jobId)
}

