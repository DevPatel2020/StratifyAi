import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Conversation } from '@shared/types'
import { useApp } from '@renderer/store/app'
import { Button, Card, Input, PageHeader } from '@renderer/components/ui'

export function HistoryPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Conversation[]>([])
  const { open, removeConversation, conversations } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => {
      window.api.conversations.list(query).then(setResults).catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [query, conversations])

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="History" description="Full-text search across every conversation, with export." />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="relative mb-4 max-w-lg">
          <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search titles and messages…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="grid gap-2">
          {results.map((c) => (
            <Card key={c.id} className="flex items-center gap-3 p-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void open(c.id)
                  navigate('/')
                }}
              >
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="truncate text-xs text-muted-foreground">{c.summary || new Date(c.updatedAt).toLocaleString()}</div>
              </button>
              {(['md', 'pdf'] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const file = await window.api.conversations.exportAs(c.id, f).catch((e) => toast.error(e.message))
                    if (file) toast.success(`Saved ${file}`)
                  }}
                >
                  <Download size={13} /> {f.toUpperCase()}
                </Button>
              ))}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete"
                onClick={() => confirm(`Delete "${c.title}"?`) && void removeConversation(c.id)}
              >
                <Trash2 size={14} />
              </Button>
            </Card>
          ))}
          {results.length === 0 && <p className="text-sm text-muted-foreground">No conversations found.</p>}
        </div>
      </div>
    </div>
  )
}
