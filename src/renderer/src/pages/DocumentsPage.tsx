import { useCallback, useEffect, useState } from 'react'
import { FileText, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { DocumentInfo, SearchHit } from '@shared/types'
import { useApp } from '@renderer/store/app'
import { Badge, Button, Card, Input, PageHeader, Spinner, Switch } from '@renderer/components/ui'
import { cn } from '@renderer/lib/utils'

export function DocumentsPage() {
  const { aiStatus, settings, updateSettings } = useApp()
  const [docs, setDocs] = useState<DocumentInfo[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [dragging, setDragging] = useState(false)
  const running = aiStatus?.state === 'running'

  const load = useCallback(() => {
    if (running) window.api.docs.list().then(setDocs).catch((e) => toast.error(e.message))
  }, [running])
  useEffect(load, [load])

  const upload = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (!/\.(pdf|txt|md|markdown|csv)$/i.test(f.name)) {
        toast.error(`${f.name}: only PDF, TXT, MD and CSV are supported`)
        continue
      }
      setUploading(f.name)
      try {
        const doc = await window.api.docs.upload(f.name, await f.arrayBuffer())
        toast.success(`Indexed ${doc.name} (${doc.chunks} chunks)`)
      } catch (e: any) {
        toast.error(e.message)
      }
    }
    setUploading(null)
    load()
  }

  const search = async () => {
    if (!query.trim()) return
    try {
      setHits(await window.api.docs.search(query))
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Documents (RAG)"
        description="Upload notes, papers or reports. They are chunked, embedded locally and stored in ChromaDB; answers cite them as [1], [2]…"
        actions={
          settings && (
            <label className="flex items-center gap-2 text-sm">
              Use documents in chat <Switch checked={settings.useRag} onChange={(v) => updateSettings({ useRag: v })} />
            </label>
          )
        }
      />
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {!running && (
          <Card className="border-warning/50 p-4 text-sm">
            The Python AI service is <b>{aiStatus?.state ?? 'unknown'}</b>. {aiStatus?.detail}
          </Card>
        )}
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void upload(e.dataTransfer.files)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-sm text-muted-foreground',
            dragging && 'border-primary bg-primary/5',
            !running && 'pointer-events-none opacity-50'
          )}
        >
          {uploading ? (
            <>
              <Spinner /> Indexing {uploading}…
            </>
          ) : (
            <>
              <Upload size={22} /> Drop PDF / TXT / MD / CSV files here or click to browse
            </>
          )}
          <input type="file" multiple accept=".pdf,.txt,.md,.markdown,.csv" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
        </label>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Indexed documents ({docs.length})</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {docs.map((d) => (
              <Card key={d.id} className="flex items-center gap-3 p-3">
                <FileText size={18} className="text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.pages} page(s) · {d.chunks} chunks · {new Date(d.addedAt * 1000).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove document"
                  onClick={async () => {
                    await window.api.docs.remove(d.id).catch((e) => toast.error(e.message))
                    load()
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Test retrieval</h2>
          <div className="flex max-w-xl gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="What does my document say about…" />
            <Button onClick={search} disabled={!running}>
              <Search size={14} /> Search
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {hits.map((h, i) => (
              <Card key={i} className="p-3 text-xs">
                <div className="mb-1 flex items-center gap-2">
                  <Badge>[{i + 1}]</Badge>
                  <span className="font-medium">{h.source}</span>
                  {h.page && <span className="text-muted-foreground">p.{h.page}</span>}
                  <span className="ml-auto text-muted-foreground">similarity {h.score.toFixed(3)}</span>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{h.text.slice(0, 600)}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
