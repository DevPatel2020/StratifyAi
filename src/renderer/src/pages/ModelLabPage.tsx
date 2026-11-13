import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FlaskConical } from 'lucide-react'
import { PROVIDERS, type CompareResult, type ProviderId } from '@shared/types'
import { useApp } from '@renderer/store/app'
import { Markdown } from '@renderer/components/Markdown'
import { Badge, Button, Card, PageHeader, Spinner, StatusDot, Textarea } from '@renderer/components/ui'
import { ChartCard, SERIES, axisProps, gridProps, tooltipProps } from '@renderer/components/charts'
import { cn, formatMs, PROVIDER_LABEL } from '@renderer/lib/utils'

export function ModelLabPage() {
  const providers = useApp((s) => s.providers)
  const [prompt, setPrompt] = useState('Explain the trade-offs between SQL and NoSQL databases for a student project.')
  const [selected, setSelected] = useState<ProviderId[]>(['groq', 'gemini', 'ollama'])
  const [results, setResults] = useState<CompareResult[]>([])
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    setResults([])
    try {
      setResults(await window.api.lab.compare(prompt, selected))
    } finally {
      setRunning(false)
    }
  }

  // series follow the provider entity (fixed slot per provider), never the rank
  const slot = (p: ProviderId) => SERIES[PROVIDERS.indexOf(p)]
  const scored = results.filter((r) => r.scores)
  const chartData = (['relevance', 'depth', 'clarity', 'overall'] as const).map((metric) => ({
    metric,
    ...Object.fromEntries(scored.map((r) => [r.provider, r.scores![metric]]))
  }))

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Model Lab" description="Run the same prompt on several providers side by side; an LLM judge (Gemini when available) scores each answer." />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Card className="p-4">
          <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {PROVIDERS.map((p) => {
              const status = providers.find((x) => x.id === p)
              const on = selected.includes(p)
              return (
                <button
                  key={p}
                  onClick={() => setSelected(on ? selected.filter((x) => x !== p) : [...selected, p])}
                  className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs', on ? 'border-primary bg-primary/15' : 'text-muted-foreground')}
                >
                  <StatusDot ok={!!status?.available} /> {PROVIDER_LABEL[p]} · {status?.model ?? ''}
                </button>
              )
            })}
            <Button className="ml-auto" onClick={run} disabled={running || !prompt.trim() || selected.length === 0}>
              {running ? <Spinner className="h-3.5 w-3.5" /> : <FlaskConical size={14} />} Run comparison
            </Button>
          </div>
        </Card>

        {scored.length > 0 && (
          <ChartCard title="Judge scores (1–10)" description="Higher is better. Bars are coloured by provider.">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8 }} barGap={2}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="metric" {...axisProps} />
                <YAxis domain={[0, 10]} {...axisProps} width={32} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'hsl(var(--foreground))' }} />
                {scored.map((r) => (
                  <Bar key={r.provider} dataKey={r.provider} name={PROVIDER_LABEL[r.provider]} fill={slot(r.provider)} radius={[4, 4, 0, 0]} maxBarSize={32} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <div className={cn('grid gap-4', results.length > 1 && 'lg:grid-cols-2', results.length > 2 && 'xl:grid-cols-3')}>
          {results.map((r) => (
            <Card key={r.provider} className="flex flex-col p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: slot(r.provider) }} />
                <span className="text-sm font-semibold">{PROVIDER_LABEL[r.provider]}</span>
                <Badge variant="outline">{r.model}</Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {formatMs(r.latencyMs)} · {r.tokens} tok
                </span>
              </div>
              {r.scores && (
                <div className="mb-2 text-xs text-muted-foreground">
                  Overall <b className="text-foreground">{r.scores.overall}/10</b>: {r.scores.comment}
                </div>
              )}
              {r.ok ? <Markdown text={r.text} /> : <p className="text-sm text-destructive">{r.error}</p>}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
