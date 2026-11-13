import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RefreshCw } from 'lucide-react'
import type { EvalBundle } from '@shared/types'
import { useApp } from '@renderer/store/app'
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader, Stat } from '@renderer/components/ui'
import { ChartCard, axisProps, gridProps, tooltipProps } from '@renderer/components/charts'
import { formatMs, prettyType } from '@renderer/lib/utils'

const pct = (v: number | undefined | null) => (v === undefined || v === null ? '–' : `${(v * 100).toFixed(1)}%`)

function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat())
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th className="p-1 text-left text-muted-foreground">actual ↓ / predicted →</th>
            {labels.map((l) => (
              <th key={l} className="p-1 font-medium [writing-mode:vertical-rl]">
                {prettyType(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <td className="whitespace-nowrap p-1 pr-2 font-medium">{prettyType(labels[i])}</td>
              {row.map((v, j) => (
                <td
                  key={j}
                  title={`${prettyType(labels[i])} → ${prettyType(labels[j])}: ${v}`}
                  className="h-8 w-8 border border-background text-center tabular-nums"
                  // sequential single hue: light → dark with magnitude
                  style={{ background: `color-mix(in srgb, var(--series-1) ${Math.round((v / max) * 85)}%, transparent)` }}
                >
                  {v || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EvaluationPage() {
  const aiStatus = useApp((s) => s.aiStatus)
  const [data, setData] = useState<EvalBundle | null>(null)
  const load = () => window.api.evaluation.results().then(setData).catch(() => setData({ classifier: null, eval: null }))
  useEffect(() => {
    void load()
  }, [aiStatus?.state])

  const c = data?.classifier
  const e = data?.eval
  const perClass = c ? Object.entries(c.per_class as Record<string, any>).map(([k, v]) => ({ label: prettyType(k), f1: v['f1-score'] })) : []

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Evaluation"
        description="Offline metrics for the report: question classifier, token savings, path quality, provider latency and RAG retrieval."
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw size={13} /> Reload
          </Button>
        }
      />
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {!c && !e && (
          <Card className="p-4 text-sm text-muted-foreground">
            No evaluation results yet. Run <code>npm run ai:setup</code> (trains the classifier) and <code>npm run ai:eval</code>, then reload.
          </Card>
        )}

        {c && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Question-type classifier ({c.best_model})</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="Test accuracy" value={pct(c.accuracy)} hint={`${c.n_test} held-out questions`} />
              <Stat label="Macro F1" value={pct(c.macro_f1)} />
              <Stat label="5-fold CV accuracy" value={pct(c.cv_mean)} hint={`± ${pct(c.cv_std)}`} />
              <Stat label="Training set" value={String(c.n_train)} hint={`${c.labels.length} classes`} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="F1 score per class" description="Held-out test split">
                <ResponsiveContainer>
                  <BarChart data={perClass} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid {...gridProps} horizontal={false} vertical />
                    <XAxis type="number" domain={[0, 1]} {...axisProps} />
                    <YAxis type="category" dataKey="label" {...axisProps} width={120} />
                    <Tooltip {...tooltipProps} formatter={(v: number) => [v.toFixed(3), 'F1']} />
                    <Bar dataKey="f1" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <Card>
                <CardHeader>
                  <CardTitle>Confusion matrix</CardTitle>
                </CardHeader>
                <CardContent>
                  <ConfusionMatrix labels={c.labels} matrix={c.confusion_matrix} />
                </CardContent>
              </Card>
            </div>
            {c.model_comparison && (
              <div className="overflow-hidden rounded-lg border text-xs">
                <table className="w-full">
                  <thead className="bg-muted text-left">
                    <tr>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">CV accuracy</th>
                      <th className="px-3 py-2">CV macro F1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(c.model_comparison as Record<string, any>).map(([name, m]) => (
                      <tr key={name} className="border-t">
                        <td className="px-3 py-2">{name}</td>
                        <td className="px-3 py-2 tabular-nums">{pct(m.cv_accuracy)}</td>
                        <td className="px-3 py-2 tabular-nums">{pct(m.cv_macro_f1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {e && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Pipeline benchmark · {e.n_questions} questions · {new Date(e.timestamp * 1000).toLocaleString()}
            </h2>
            <div className="grid gap-3 md:grid-cols-4">
              <Stat
                label="Token savings, step 1 only"
                value={pct(e.token_savings?.step1_vs_full)}
                hint="vs. a full single-shot answer (paths generation included)"
              />
              <Stat label="Token savings, 2 steps" value={pct(e.token_savings?.step2_vs_full)} />
              <Stat label="Path quality (judge, 1–5)" value={e.path_quality?.overall?.toFixed?.(2) ?? '–'} hint={`relevance ${e.path_quality?.relevance?.toFixed?.(2) ?? '–'} · diversity ${e.path_quality?.diversity?.toFixed?.(2) ?? '–'}`} />
              <Stat label="RAG hit@4" value={pct(e.rag?.hit_rate)} hint={`faithfulness ${e.rag?.faithfulness?.toFixed?.(2) ?? '–'} / 5`} />
            </div>
            {e.latency && (
              <ChartCard title="Median latency by provider" description="Same short prompt, 3 runs each">
                <ResponsiveContainer>
                  <BarChart data={Object.entries(e.latency).map(([p, v]: [string, any]) => ({ provider: p, ms: v.median_ms }))} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="provider" {...axisProps} />
                    <YAxis {...axisProps} width={52} tickFormatter={(v) => formatMs(v)} />
                    <Tooltip {...tooltipProps} formatter={(v: number) => [formatMs(v), 'Median']} />
                    <Bar dataKey="ms" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
