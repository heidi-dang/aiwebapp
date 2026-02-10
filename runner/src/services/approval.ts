import { EventEmitter } from 'events'

export interface ApprovalRequest {
  jobId: string
  tokenId: string
  type: string
  description: string
  data?: unknown
}

export interface ApprovalResponse {
  jobId: string
  tokenId: string
  approved: boolean
  modifier?: string // User who approved/rejected
}

class ApprovalService extends EventEmitter {
  private pendingRequests = new Map<string, (response: ApprovalResponse) => void>()

  /**
   * Request approval for an action
   * @param jobId The job ID
   * @param type The type of action (e.g., 'run_command')
   * @param description Human readable description
   * @param data structured data for the action
   * @param timeoutMs How long to wait before auto-rejecting (default 5 mins)
   */
  async requestApproval(
    jobId: string, 
    type: string, 
    description: string, 
    data?: unknown,
    timeoutMs = 300000
  ): Promise<boolean> {
    const tokenId = `approve_${Date.now()}_${Math.random().toString(36).slice(2)}`
    
    // We can't easily emit the SSE event from here without the ctx/store access.
    // So we return the token and let the caller emit the event.
    // Actually, we can just return the promise and the token info.
    
    return new Promise<boolean>((resolve) => {
      const cleanup = () => {
        this.pendingRequests.delete(tokenId)
        clearTimeout(timer)
      }

      const timer = setTimeout(() => {
        cleanup()
        resolve(false) // Timeout = rejected
      }, timeoutMs)

      this.pendingRequests.set(tokenId, (response) => {
        cleanup()
        resolve(response.approved)
      })
      
      // We also need to expose the tokenId to the caller so they can emit the event
      // This design is slightly inverted. The caller needs the tokenId BEFORE waiting.
    })
  }

  createRequest(jobId: string): { tokenId: string; wait: (timeoutMs?: number) => Promise<boolean> } {
    const tokenId = `approve_${Date.now()}_${Math.random().toString(36).slice(2)}`
    
    const wait = (timeoutMs = 300000) => {
      return new Promise<boolean>((resolve) => {
        const cleanup = () => {
          this.pendingRequests.delete(tokenId)
          clearTimeout(timer)
        }

        const timer = setTimeout(() => {
          cleanup()
          resolve(false)
        }, timeoutMs)

        this.pendingRequests.set(tokenId, (response) => {
          cleanup()
          resolve(response.approved)
        })
      })
    }

    return { tokenId, wait }
  }

  /**
   * Handle an incoming approval response
   */
  handleResponse(response: ApprovalResponse): boolean {
    const resolver = this.pendingRequests.get(response.tokenId)
    if (resolver) {
      resolver(response)
      return true
    }
    return false
  }
}

export const approvalService = new ApprovalService()
