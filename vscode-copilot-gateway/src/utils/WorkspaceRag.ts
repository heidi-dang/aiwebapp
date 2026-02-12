import * as vscode from 'vscode'

type RagHit = {
  uri: vscode.Uri
  matches: Array<{ line: number; preview: string }>
  score: number
}

function extractQueryTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .match(/[a-z_][a-z0-9_]{2,}/g)
    ?.slice(0, 200) ?? []

  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'what',
    'how',
    'when',
    'where',
    'why',
    'does',
    'work',
    'please',
    'help',
    'fix',
    'error',
    'issue'
  ])

  const uniq: string[] = []
  for (const w of words) {
    if (stop.has(w)) continue
    if (!uniq.includes(w)) uniq.push(w)
    if (uniq.length >= 6) break
  }
  return uniq
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class WorkspaceRag {
  public static async buildRagBlockFromMessages(messages: any[]): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('heidi-gateway-proxy')
    const enabled = config.get('rag.enabled', true)
    if (!enabled) return null

    let lastUserContent = ''
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user' && typeof messages[i]?.content === 'string') {
        lastUserContent = messages[i].content
        break
      }
    }

    if (!lastUserContent) return null

    const terms = extractQueryTerms(lastUserContent)
    if (terms.length === 0) return null

    const maxFiles = Number(config.get('rag.maxFiles', 3))
    const maxResults = Number(config.get('rag.maxResults', 30))
    const maxChars = Number(config.get('rag.maxChars', 4000))
    const perFileMaxMatches = Number(config.get('rag.maxMatchesPerFile', 3))

    const pattern = terms.map(escapeRegex).join('|')

    const hitsByUri = new Map<string, RagHit>()
    const re = new RegExp(pattern, 'i')
    const files = await vscode.workspace.findFiles(
      '**/*',
      '**/{node_modules,.git,out,dist,build,coverage}/**',
      Math.min(500, Math.max(50, maxResults * 10))
    )

    let totalMatches = 0
    for (const uri of files) {
      if (totalMatches >= maxResults) break
      let text = ''
      try {
        const bytes = await vscode.workspace.fs.readFile(uri)
        text = Buffer.from(bytes).toString('utf8')
      } catch {
        continue
      }

      const lines = text.split(/\r?\n/)
      let score = 0
      const matches: RagHit['matches'] = []
      for (let i = 0; i < lines.length; i++) {
        if (totalMatches >= maxResults) break
        if (matches.length >= perFileMaxMatches) break
        const lineText = lines[i]
        if (!re.test(lineText)) continue
        score++
        totalMatches++
        matches.push({ line: i + 1, preview: lineText })
      }

      if (score > 0) {
        hitsByUri.set(uri.toString(), { uri, matches, score })
      }
    }

    const ranked = [...hitsByUri.values()]
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, maxFiles))

    if (ranked.length === 0) return null

    let out = `<workspace_search>\n`
    out += `[Query Terms]: ${terms.join(', ')}\n`

    for (const h of ranked) {
      const rel = vscode.workspace.asRelativePath(h.uri)
      out += `\n[File]: ${rel}\n`
      for (const m of h.matches) {
        out += `- Line ${m.line}: ${m.preview.replace(/\s+/g, ' ').trim().slice(0, 400)}\n`
      }
      if (out.length > maxChars) break
    }

    out += `</workspace_search>\n`
    if (out.length > maxChars) out = out.slice(0, maxChars) + `\n</workspace_search>\n`

    return out
  }
}
