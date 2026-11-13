import { useState } from 'react'
import { ChevronDown, ChevronRight, Play, RefreshCw, Sparkles } from 'lucide-react'
import type { Message, ThinkingPath } from '@shared/types'
import { useApp } from '@renderer/store/app'
import { cn } from '@renderer/lib/utils'
import { Badge, Button, Spinner } from './ui'

export function PathCard({ path, disabled, onRun }: { path: ThinkingPath; disabled: boolean; onRun: (selected: number[]) => void }) {
  const [open, setOpen] = useState(path.recommended ?? false)
  const [selected, setSelected] = useState<number[]>([])
  const toggle = (n: number) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))

  return (
    <div className={cn('rounded-lg border bg-card', path.recommended && 'border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]')}>
      <button className="flex w-full items-start gap-2 p-3 text-left" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={16} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{path.name}</span>
            {path.recommended && (
              <Badge>
                <Sparkles size={10} /> Recommended
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{path.framework}</span>
            {path.score !== undefined && <span>· score {path.score.toFixed(2)}</span>}
          </div>
        </div>
      </button>
      {open && (
        <div className="space-y-1.5 px-3 pb-3">
          {path.rationale && <p className="text-xs italic text-muted-foreground">{path.rationale}</p>}
          {path.steps.map((step, i) => {
            const n = i + 1
            return (
              <div key={n} className="flex items-start gap-2 rounded-md border bg-background/50 p-2">
                <input
                  type="checkbox"
                  aria-label={`Select step ${n}`}
                  className="mt-1 accent-[hsl(var(--primary))]"
                  checked={selected.includes(n)}
                  onChange={() => toggle(n)}
                />
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-primary">Step {n}.</span> {step}
                </div>
                <button
                  disabled={disabled}
                  title={`Run steps 1–${n}`}
                  onClick={() => onRun(Array.from({ length: n }, (_, k) => k + 1))}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
                >
                  <Play size={11} />
                </button>
              </div>
            )
          })}
          <Button size="sm" variant="secondary" className="w-full" disabled={disabled || selected.length === 0} onClick={() => onRun(selected)}>
            Run selected steps {selected.length ? `(${[...selected].sort((a, b) => a - b).join(', ')})` : ''}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ThinkingPanel({ source }: { source: Message | null }) {
  const busy = useApp((s) => s.busy)
  const execute = useApp((s) => s.execute)
  const refreshPaths = useApp((s) => s.refreshPaths)
  const paths = source?.meta.paths ?? []

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l bg-card/30">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Thinking paths</div>
          <div className="text-[11px] text-muted-foreground">▶ runs steps cumulatively · tick boxes to run any subset</div>
        </div>
        {source && (
          <Button size="icon" variant="ghost" title="Regenerate paths" disabled={busy !== 'idle'} onClick={() => refreshPaths(source.id)}>
            {busy === 'refreshing' ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={14} />}
          </Button>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {busy === 'asking' && (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Spinner className="h-3.5 w-3.5" /> Classifying question and designing thinking paths…
          </div>
        )}
        {!source && busy !== 'asking' && (
          <p className="p-3 text-xs text-muted-foreground">Ask a question and StratifyAI will design four thinking paths based on proven frameworks.</p>
        )}
        {source &&
          paths.map((p) => (
            <PathCard key={p.id} path={p} disabled={busy !== 'idle'} onRun={(sel) => void execute(source, p, sel)} />
          ))}
      </div>
    </aside>
  )
}
