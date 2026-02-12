export type RedactionResult<T> = {
  value: T
  redactions: number
}

const patterns: RegExp[] = [
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bASIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(password|passwd|pwd)\s*[:=]\s*([^\s'"]+)\b/gi,
  /\b(api[_-]?key|secret|token)\s*[:=]\s*([^\s'"]{8,})\b/gi
]

export function redactText(input: string): RedactionResult<string> {
  let out = input
  let redactions = 0

  for (const re of patterns) {
    const before = out
    out = out.replace(re, () => {
      redactions += 1
      return '[REDACTED]'
    })
    if (before !== out) {
      // Redaction happened
    }
  }

  return { value: out, redactions }
}

export function redactMessages<T extends Array<{ role?: string; content?: any }>>(
  messages: T
): RedactionResult<T> {
  let redactions = 0
  const next = messages.map((m) => {
    const content = m?.content
    if (typeof content !== 'string' || content.length === 0) return m
    const res = redactText(content)
    redactions += res.redactions
    return { ...m, content: res.value }
  }) as T

  return { value: next, redactions }
}
