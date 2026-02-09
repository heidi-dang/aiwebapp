export interface GuardrailConfig {
  inputCheck: boolean
  outputCheck: boolean
  toolCheck: boolean
  forbiddenTerms: string[]
  piiPatterns: RegExp[]
  dangerousCommands: string[]
  maxPromptLength: number
  maxResponseLength: number
}

export interface GuardrailResult {
  allowed: boolean
  reason?: string
  sanitized?: string
}

export class GuardrailService {
  private readonly _config: GuardrailConfig

  get config(): GuardrailConfig {
    return this._config
  }

  constructor(config: Partial<GuardrailConfig> = {}) {
    this._config = {
      inputCheck: true,
      outputCheck: true,
      toolCheck: true,
      forbiddenTerms: [
        'rm -rf /',
        'sudo rm',
        'format c:',
        'del /f /s /q',
        'drop table',
        'delete from',
        'truncate table',
        'shutdown -s',
        'systemctl stop',
        'kill -9'
      ],
      piiPatterns: [
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
        /\b\d{3}-\d{3}-\d{4}\b/g, // Phone
        /\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g // IP
      ],
      dangerousCommands: [
        // In sandboxed environment, allow more commands as they are isolated
        // Keep basic restrictions for database operations and system-level commands
        'drop table',
        'delete from',
        'truncate table'
      ],
      maxPromptLength: 10000,
      maxResponseLength: 50000,
      ...config
    }
  }

  checkInput(prompt: string): GuardrailResult {
    if (!this._config.inputCheck) {
      return { allowed: true }
    }

    // Length check
    if (prompt.length > this._config.maxPromptLength) {
      return {
        allowed: false,
        reason: `Prompt too long (${prompt.length} > ${this._config.maxPromptLength})`
      }
    }

    // Forbidden terms check
    const lowerPrompt = prompt.toLowerCase()
    for (const term of this._config.forbiddenTerms) {
      if (lowerPrompt.includes(term.toLowerCase())) {
        return {
          allowed: false,
          reason: `Contains forbidden term: ${term}`
        }
      }
    }

    // PII detection
    for (const pattern of this._config.piiPatterns) {
      if (pattern.test(prompt)) {
        return {
          allowed: false,
          reason: 'Contains potential personal information'
        }
      }
    }

    return { allowed: true }
  }

  checkOutput(response: string): GuardrailResult {
    if (!this._config.outputCheck) {
      return { allowed: true }
    }

    // Length check
    if (response.length > this._config.maxResponseLength) {
      return {
        allowed: false,
        reason: `Response too long (${response.length} > ${this._config.maxResponseLength})`
      }
    }

    // Basic content filtering
    const problematicPatterns = [
      /\b(hate|kill|destroy|bomb|terrorist)\b/gi,
      /\b(suicide|self.?harm)\b/gi,
      /\b(child|underage|minor).*\b(sex|porn)\b/gi
    ]

    for (const pattern of problematicPatterns) {
      if (pattern.test(response)) {
        return {
          allowed: false,
          reason: 'Contains potentially harmful content'
        }
      }
    }

    return { allowed: true }
  }

  checkToolCall(toolName: string, args: any): GuardrailResult {
    if (!this._config.toolCheck) {
      return { allowed: true }
    }

    // Check tool name
    if (toolName === 'run_command' || toolName === 'apply_edit') {
      const command = args.command || args.path || ''
      const lowerCommand = typeof command === 'string' ? command.toLowerCase() : JSON.stringify(command).toLowerCase()

      for (const dangerousCmd of this._config.dangerousCommands) {
        if (lowerCommand.includes(dangerousCmd.toLowerCase())) {
          return {
            allowed: false,
            reason: `Dangerous command detected: ${dangerousCmd}`
          }
        }
      }
    }

    // Check file operations
    if (toolName === 'write_file' || toolName === 'apply_edit' || toolName === 'read_file') {
      const path = args.path || ''
      
      // Prevent directory traversal
      if (path.includes('..')) {
        return {
          allowed: false,
          reason: 'Path traversal detected (..)'
        }
      }

      const restrictedPaths = [
        '/etc/',
        '/usr/bin/',
        '/bin/',
        '/sbin/',
        '/boot/',
        '/dev/',
        '/proc/',
        '/sys/'
      ]

      for (const restrictedPath of restrictedPaths) {
        if (path.includes(restrictedPath)) {
          return {
            allowed: false,
            reason: `Restricted path: ${restrictedPath}`
          }
        }
      }
    }

    return { allowed: true }
  }

  sanitizeInput(prompt: string): string {
    let sanitized = prompt

    // Remove PII
    for (const pattern of this._config.piiPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }

    // Remove dangerous commands (but keep the rest)
    const lines = sanitized.split('\n')
    const safeLines = lines.filter(line => {
      const lowerLine = line.toLowerCase()
      return !this._config.dangerousCommands.some(cmd => lowerLine.includes(cmd.toLowerCase()))
    })

    return safeLines.join('\n')
  }
}

export const guardrailService = new GuardrailService()
