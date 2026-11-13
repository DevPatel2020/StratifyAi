import { Minus, Search, Square, X } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import { StatusDot } from './ui'
import { PROVIDER_LABEL } from '@renderer/lib/utils'

export function TitleBar() {
  const providers = useApp((s) => s.providers)
  const aiStatus = useApp((s) => s.aiStatus)
  const setPaletteOpen = useApp((s) => s.setPaletteOpen)
  return (
    <header className="drag flex h-10 shrink-0 items-center justify-between border-b bg-card/60 px-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[11px] text-primary-foreground">S</span>
        StratifyAI
        <span className="text-xs font-normal text-muted-foreground">v2</span>
      </div>
      <button
        onClick={() => setPaletteOpen(true)}
        className="no-drag flex w-80 items-center gap-2 rounded-md border bg-background/60 px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        <Search size={13} /> Search or run a command… <kbd className="ml-auto rounded border px-1 text-[10px]">Ctrl K</kbd>
      </button>
      <div className="no-drag flex items-center gap-3">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {providers.map((p) => (
            <span key={p.id} className="flex items-center gap-1" title={`${PROVIDER_LABEL[p.id]}: ${p.detail}`}>
              <StatusDot ok={p.available} /> {p.id}
            </span>
          ))}
          <span className="flex items-center gap-1" title={aiStatus?.detail ?? 'AI service'}>
            <StatusDot ok={aiStatus?.state === 'running'} pending={aiStatus?.state === 'starting'} /> ml
          </span>
        </div>
        <div className="flex items-center">
          <button aria-label="Minimize" onClick={() => window.api.window.minimize()} className="grid h-7 w-8 place-items-center rounded hover:bg-muted">
            <Minus size={14} />
          </button>
          <button aria-label="Maximize" onClick={() => window.api.window.maximize()} className="grid h-7 w-8 place-items-center rounded hover:bg-muted">
            <Square size={12} />
          </button>
          <button aria-label="Close" onClick={() => window.api.window.close()} className="grid h-7 w-8 place-items-center rounded hover:bg-destructive hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  )
}
