import { useEffect, useMemo, useRef } from 'react'
import { Download, GitBranch } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useApp } from '@renderer/store/app'
import { activeChain } from '@renderer/lib/utils'
import { Composer } from '@renderer/components/Composer'
import { Markdown } from '@renderer/components/Markdown'
import { MessageBubble } from '@renderer/components/MessageBubble'
import { ThinkingPanel } from '@renderer/components/ThinkingPanel'
import { Badge, Button, Spinner } from '@renderer/components/ui'

const EXAMPLES = [
  'Should I learn React or Angular for my final year project?',
  'Why does my Python script get slower as the dataset grows?',
  'How can a small café increase revenue in 6 months?',
  'Explain transformers in machine learning simply'
]

export function ChatPage() {
  const { detail, streaming, setHead, feedback, ask, busy } = useApp()
  const navigate = useNavigate()
  const scroller = useRef<HTMLDivElement>(null)

  const chain = useMemo(() => (detail ? activeChain(detail.messages, detail.conversation.headId) : []), [detail])
  const head = chain[chain.length - 1] ?? null
  // The thinking panel shows the paths of the active node; answers without paths fall back to the nearest ancestor with paths.
  const pathSource = useMemo(() => [...chain].reverse().find((m) => m.meta.paths?.length) ?? null, [chain])
  const branches = detail ? detail.messages.filter((m) => m.role === 'assistant').length : 0

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [chain.length, streaming?.text])

  const exportAs = async (format: 'md' | 'pdf') => {
    if (!detail) return
    try {
      const file = await window.api.conversations.exportAs(detail.conversation.id, format)
      if (file) toast.success(`Saved ${file}`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between border-b px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{detail?.conversation.title ?? 'New conversation'}</div>
            {detail?.conversation.summary && (
              <div className="truncate text-[11px] text-muted-foreground" title={detail.conversation.summary}>
                Memory: {detail.conversation.summary}
              </div>
            )}
          </div>
          {detail && (
            <div className="flex items-center gap-1">
              {detail.conversation.dataContext && <Badge variant="outline">dataset attached</Badge>}
              <Button size="sm" variant="ghost" onClick={() => navigate('/tree')} title="Open the thinking tree">
                <GitBranch size={14} /> {branches} node{branches === 1 ? '' : 's'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportAs('md')}>
                <Download size={14} /> MD
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exportAs('pdf')}>
                <Download size={14} /> PDF
              </Button>
            </div>
          )}
        </div>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {chain.length === 0 && !streaming && (
            <div className="mx-auto mt-10 max-w-xl text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">S</div>
              <h2 className="text-xl font-semibold">Think strategically, step by step</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                StratifyAI classifies your question, designs four thinking paths from proven frameworks, recommends the best one, and lets you
                run exactly the steps you need.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    disabled={busy !== 'idle'}
                    onClick={() => ask(q)}
                    className="rounded-lg border bg-card p-3 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chain.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isHead={m.id === head?.id && chain.length > 1}
              onBranch={m.id !== head?.id ? () => setHead(m.id) : undefined}
              onFeedback={m.role === 'assistant' && m.meta.kind === 'answer' ? (k) => feedback(m.id, k) : undefined}
            />
          ))}

          {streaming && (
            <div className="rounded-2xl rounded-bl-sm border border-primary/40 bg-card px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge>{streaming.pathName}</Badge>
                <Badge variant="outline">steps {streaming.steps.join(', ')}</Badge>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Spinner className="h-3 w-3" /> {streaming.status}
                </span>
              </div>
              {streaming.text ? <Markdown text={streaming.text} streaming /> : <div className="text-sm text-muted-foreground">Waiting for the first tokens…</div>}
            </div>
          )}
        </div>
        <Composer />
      </section>
      <ThinkingPanel source={pathSource} />
    </div>
  )
}
