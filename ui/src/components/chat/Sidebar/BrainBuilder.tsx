'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TextArea } from '@/components/ui/textarea'

type SearchResult = {
  id?: string
  document?: string
  metadata?: Record<string, unknown>
  distance?: number
}

export function BrainBuilder() {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [metadataRaw, setMetadataRaw] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(5)
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])

  const metadata = useMemo(() => {
    if (!metadataRaw.trim()) return undefined
    try {
      return JSON.parse(metadataRaw) as Record<string, unknown>
    } catch {
      return null
    }
  }, [metadataRaw])

  const addDisabled = isAdding || !title.trim() || !content.trim() || metadata === null
  const searchDisabled = isSearching || !query.trim()

  return (
    <div className="mt-3 w-full">
      <div className="text-xs font-medium uppercase text-primary">Brain</div>
      <div className="mt-2 flex w-full gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase"
          onClick={() => setIsAddOpen(true)}
        >
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase"
          onClick={() => setIsSearchOpen(true)}
        >
          Search
        </Button>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-xl border border-primary/15 bg-primaryAccent font-dmmono">
          <DialogHeader>
            <DialogTitle>Brain Builder</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="h-9 rounded-xl border border-primary/15 bg-accent text-xs"
            />
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste knowledge here"
              className="h-48 w-full rounded-xl border border-primary/15 bg-accent p-3 text-xs"
            />
            <TextArea
              value={metadataRaw}
              onChange={(e) => setMetadataRaw(e.target.value)}
              placeholder='Optional metadata JSON (e.g. {"source":"spec","tag":"v1"})'
              className="h-24 w-full rounded-xl border border-primary/15 bg-accent p-3 text-xs"
            />
            <Button
              type="button"
              disabled={addDisabled}
              className="h-9 rounded-xl bg-primary text-xs font-medium uppercase text-primaryAccent"
              onClick={async () => {
                setIsAdding(true)
                try {
                  const body: Record<string, unknown> = {
                    title: title.trim(),
                    content
                  }
                  if (metadata && Object.keys(metadata).length > 0) body.metadata = metadata

                  const res = await fetch('/api/knowledge/documents', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body)
                  })

                  const text = await res.text()
                  if (!res.ok) throw new Error(text || `Add failed: ${res.status}`)

                  toast.success('Added to brain')
                  setTitle('')
                  setContent('')
                  setMetadataRaw('')
                  setIsAddOpen(false)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err))
                } finally {
                  setIsAdding(false)
                }
              }}
            >
              {isAdding ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent className="max-w-xl border border-primary/15 bg-primaryAccent font-dmmono">
          <DialogHeader>
            <DialogTitle>Brain Search</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search query"
              className="h-9 rounded-xl border border-primary/15 bg-accent text-xs"
            />
            <Input
              value={String(limit)}
              onChange={(e) => {
                const n = Number(e.target.value)
                setLimit(Number.isFinite(n) && n > 0 ? Math.min(20, n) : 5)
              }}
              placeholder="Limit"
              className="h-9 rounded-xl border border-primary/15 bg-accent text-xs"
              type="number"
              min={1}
              max={20}
            />
            <Button
              type="button"
              disabled={searchDisabled}
              className="h-9 rounded-xl bg-primary text-xs font-medium uppercase text-primaryAccent"
              onClick={async () => {
                setIsSearching(true)
                try {
                  const res = await fetch('/api/knowledge/search', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ query: query.trim(), limit })
                  })
                  const text = await res.text()
                  if (!res.ok) throw new Error(text || `Search failed: ${res.status}`)
                  const data = JSON.parse(text) as { results?: SearchResult[] }
                  setResults(Array.isArray(data.results) ? data.results : [])
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err))
                } finally {
                  setIsSearching(false)
                }
              }}
            >
              {isSearching ? 'Searching…' : 'Search'}
            </Button>

            {results.length > 0 && (
              <div className="max-h-72 overflow-auto rounded-xl border border-primary/15 bg-accent p-3 text-xs">
                <div className="mb-2 text-xs font-medium uppercase text-primary">
                  Results
                </div>
                <div className="space-y-3">
                  {results.map((r, idx) => (
                    <div key={`${r.id ?? 'r'}_${idx}`} className="space-y-1">
                      <div className="text-primary">
                        {typeof r.distance === 'number'
                          ? `score ${(1 - r.distance).toFixed(3)}`
                          : `result ${idx + 1}`}
                      </div>
                      {r.metadata && (
                        <pre className="whitespace-pre-wrap break-words text-[11px] text-primary/80">
                          {JSON.stringify(r.metadata, null, 2)}
                        </pre>
                      )}
                      {r.document && (
                        <div className="whitespace-pre-wrap break-words text-primary/90">
                          {r.document}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

