import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RefreshCw } from 'lucide-react'
import type { AnalyticsSummary } from '@shared/types'
import { Button, PageHeader, Stat } from '@renderer/components/ui'
import { ChartCard, axisProps, gridProps, tooltipProps } from '@renderer/components/charts'
import { formatMs, formatNumber, PROVIDER_LABEL } from '@renderer/lib/utils'

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const load = () => window.api.analytics.get().then(setData)
  useEffect(() => {
    void load()
  }, [])

  if (!data) return null
  const t = data.totals
  const stepShare = data.stepUsage.stepsAvailable ? data.stepUsage.stepsExecuted / data.stepUsage.stepsAvailable : 0
  const providers = data.byProvider.map((p) => ({ ...p, name: PROVIDER_LABEL[p.provider] ?? p.provider }))

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Analytics"
        description="Measured from the token usage every provider reports (estimated only where a provider omits it while streaming)."
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </Button>
        }
      />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="grid gap-3 md:grid-cols-5">
          <Stat label="LLM calls" value={formatNumber(t.calls)} hint={`${t.failures} failed (fallback used)`} />
          <Stat label="Prompt tokens" value={formatNumber(t.promptTokens)} />
          <Stat label="Completion tokens" value={formatNumber(t.completionTokens)} />
          <Stat label="Avg latency" value={formatMs(t.avgLatencyMs)} hint="successful calls" />
          <Stat
            label="Steps executed / available"
            value={`${Math.round(stepShare * 100)}%`}
            hint={`${data.stepUsage.stepsExecuted} of ${data.stepUsage.stepsAvailable} steps: the rest were never generated`}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Tokens per day" description="Prompt + completion tokens, last 30 active days" empty={!data.byDay.length}>
            <ResponsiveContainer>
              <AreaChart data={data.byDay} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="day" {...axisProps} />
                <YAxis {...axisProps} width={48} />
                <Tooltip {...tooltipProps} formatter={(v: number) => [formatNumber(v), 'Tokens']} />
                <Area type="monotone" dataKey="tokens" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Average latency by provider" description="Successful calls only" empty={!providers.length}>
            <ResponsiveContainer>
              <BarChart data={providers} margin={{ left: 4, right: 8, top: 8 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} width={48} tickFormatter={(v) => formatMs(v)} />
                <Tooltip {...tooltipProps} formatter={(v: number) => [formatMs(v), 'Avg latency']} />
                <Bar dataKey="avgLatencyMs" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tokens by pipeline stage" description="Where the tokens go: paths, execution, critique, memory…" empty={!data.byPurpose.length}>
            <ResponsiveContainer>
              <BarChart data={data.byPurpose} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} />
                <YAxis type="category" dataKey="purpose" {...axisProps} width={96} />
                <Tooltip {...tooltipProps} formatter={(v: number) => [formatNumber(v), 'Tokens']} />
                <Bar dataKey="tokens" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Most used frameworks" description="Learned prior used by the path ranker" empty={!data.frameworkClicks.length}>
            <ResponsiveContainer>
              <BarChart data={data.frameworkClicks} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="framework" {...axisProps} width={130} />
                <Tooltip {...tooltipProps} formatter={(v: number) => [v, 'Runs']} />
                <Bar dataKey="clicks" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left">
              <tr>
                {['Provider', 'Calls', 'Failures', 'Tokens', 'Avg latency'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider} className="border-t">
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 tabular-nums">{p.calls}</td>
                  <td className="px-3 py-2 tabular-nums">{p.failures}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(p.tokens)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMs(p.avgLatencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Feedback: 👍 {data.feedback.up} · 👎 {data.feedback.down}. For the controlled token-savings experiment (full answer vs. step answers),
          see the Evaluation page.
        </p>
      </div>
    </div>
  )
}
