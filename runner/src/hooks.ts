export interface AgentHooks {
  onStart?: (context: any) => void | Promise<void>
  onStep?: (step: string, context: any) => void | Promise<void>
  onToolCall?: (toolName: string, args: any, result: any) => void | Promise<void>
  onError?: (error: Error, context: any) => void | Promise<void>
  onEnd?: (result: any, context: any) => void | Promise<void>
  onMemoryUpdate?: (memory: any) => void | Promise<void>
  onApprovalRequired?: (toolName: string, args: any) => Promise<boolean>
}

export class HookManager {
  private hooks: AgentHooks = {}

  setHooks(hooks: AgentHooks): void {
    this.hooks = hooks
  }

  async triggerStart(context: any): Promise<void> {
    if (this.hooks.onStart) {
      await this.hooks.onStart(context)
    }
  }

  async triggerStep(step: string, context: any): Promise<void> {
    if (this.hooks.onStep) {
      await this.hooks.onStep(step, context)
    }
  }

  async triggerToolCall(toolName: string, args: any, result: any): Promise<void> {
    if (this.hooks.onToolCall) {
      await this.hooks.onToolCall(toolName, args, result)
    }
  }

  async triggerError(error: Error, context: any): Promise<void> {
    if (this.hooks.onError) {
      await this.hooks.onError(error, context)
    }
  }

  async triggerEnd(result: any, context: any): Promise<void> {
    if (this.hooks.onEnd) {
      await this.hooks.onEnd(result, context)
    }
  }

  async triggerMemoryUpdate(memory: any): Promise<void> {
    if (this.hooks.onMemoryUpdate) {
      await this.hooks.onMemoryUpdate(memory)
    }
  }

  async triggerApprovalRequired(toolName: string, args: any): Promise<boolean> {
    if (this.hooks.onApprovalRequired) {
      return await this.hooks.onApprovalRequired(toolName, args)
    }
    return true // Default to approval if no hook
  }
}

export const hookManager = new HookManager()