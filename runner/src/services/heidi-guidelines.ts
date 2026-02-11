import fs from 'node:fs/promises'
import path from 'node:path'

export async function loadHeidiGuidelines(baseDir: string): Promise<string | null> {
  const configured = process.env.HEIDI_GUIDELINES_PATH?.trim()
  const candidates = [
    configured,
    '.heidi/rules.md',
    '.heidi/guidelines.md'
  ].filter((p): p is string => Boolean(p && p.trim()))

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.join(baseDir, candidate)
    try {
      const content = await fs.readFile(resolved, 'utf8')
      const trimmed = content.trim()
      if (trimmed) return trimmed
    } catch {
    }
  }

  return null
}
