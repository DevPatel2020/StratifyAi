import { useState } from 'react'
import { Check, Copy, GitBranch, ShieldCheck, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react'
import type { Message } from '@shared/types'
import { cn, formatMs, prettyType, PROVIDER_LABEL } from '@renderer/lib/utils'
import { Markdown } from './Markdown'
import { Badge } from './ui'

interface Props {
  message: Message
  isHead: boolean
  onBranch?: () => void
  onFeedback?: (kind: 'up' | 'down') => void
}

export function MessageBubble({ message, isHead, onBranch, onFeedback }: Props) {
  const [copied, setCopied] = useState(false)
  const m = message.meta

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className={cn('max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground', isHead && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background')}>
          {message.content}
        </div>
        {m.classification && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Badge variant="outline">{prettyType(m.classification.label)}</Badge>
            {Math.round(m.classification.confidence * 100)}% · via {m.classification.source}
            {onBranch && !isHead && (
              <button onClick={onBranch} className="ml-1 flex items-center gap-0.5 hover:text-foreground" title="Continue from here">
                <GitBranch size={11} /> branch
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className={cn('rounded-2xl rounded-bl-sm border bg-card px-5 py-4', isHead && 'border-primary/50')}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {m.pathName && <Badge>{m.pathName}</Badge>}
        {m.framework && m.framework !== m.pathName && <Badge variant="outline">{m.framework}</Badge>}
        {m.steps && <Badge variant="outline">steps {m.steps.join(', ')}</Badge>}
        {m.critique && (
          <Badge variant={m.critique.score >= 7 ? 'success' : 'warning'} title={m.critique.issues.join('\n')}>
            <ShieldCheck size={11} /> critique {m.critique.score}/10{m.critique.refined ? ' · refined' : ''}
          </Badge>
        )}
        {!!m.toolCalls?.length && (
          <Badge variant="outline" title={m.toolCalls.map((t) => `${t.tool}(${t.input})`).join('\n')}>
            <Wrench size={11} /> {m.toolCalls.length} tool call{m.toolCalls.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>
      <Markdown text={message.content} />
      {!!m.citations?.length && (
        <div className="mt-3 rounded-lg border bg-muted/40 p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sources</div>
          <ol className="space-y-1 text-xs">
            {m.citations.map((c) => (
              <li key={c.index} title={c.text}>
                <span className="font-medium">[{c.index}]</span> {c.source}
                {c.page ? `, p.${c.page}` : ''} <span className="text-muted-foreground">· relevance {c.score.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!!m.toolCalls?.length && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Agent tool trace</summary>
          {m.toolCalls.map((t, i) => (
            <div key={i} className="mt-1 rounded border bg-muted/40 p-2">
              <div className="font-mono">
                {t.tool}({t.input})
              </div>
              <pre className="mt-1 whitespace-pre-wrap">{t.output.slice(0, 600)}</pre>
            </div>
          ))}
        </details>
      )}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        {m.provider && (
          <span>
            {PROVIDER_LABEL[m.provider]} · {m.model}
          </span>
        )}
        {m.completionTokens !== undefined && (
          <span>
            {m.promptTokens}+{m.completionTokens} tokens{m.tokensEstimated ? ' (est.)' : ''}
          </span>
        )}
        {m.latencyMs !== undefined && <span>{formatMs(m.latencyMs)}</span>}
        <div className="ml-auto flex items-center gap-1">
          {onBranch && !isHead && (
            <button onClick={onBranch} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground" title="Continue from this answer">
              <GitBranch size={12} /> Branch here
            </button>
          )}
          <button onClick={copy} className="rounded p-1 hover:bg-muted hover:text-foreground" aria-label="Copy">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          {onFeedback && (
            <>
              <button onClick={() => onFeedback('up')} aria-label="Helpful" className={cn('rounded p-1 hover:bg-muted', m.feedback === 'up' && 'text-success')}>
                <ThumbsUp size={13} />
              </button>
              <button onClick={() => onFeedback('down')} aria-label="Not helpful" className={cn('rounded p-1 hover:bg-muted', m.feedback === 'down' && 'text-destructive')}>
                <ThumbsDown size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
