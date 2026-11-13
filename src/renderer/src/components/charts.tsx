import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui'

/** Recharts styling shared by every chart: recessive grid/axes, text tokens for labels. */
export const axisProps = {
  stroke: 'hsl(var(--muted-foreground))',
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  tickLine: false,
  axisLine: false
} as const

export const gridProps = { stroke: 'var(--chart-grid)', strokeDasharray: '0', vertical: false } as const

export const tooltipProps = {
  cursor: { fill: 'hsl(var(--muted) / 0.6)' },
  contentStyle: {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
    color: 'hsl(var(--foreground))'
  },
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
  itemStyle: { color: 'hsl(var(--foreground))' }
} as const

/** Categorical slots in fixed order (validated palette, first three slots). */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']

export function ChartCard({ title, description, children, empty }: { title: string; description?: string; children: ReactNode; empty?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="h-64">
        {empty ? <div className="grid h-full place-items-center text-xs text-muted-foreground">No data yet</div> : children}
      </CardContent>
    </Card>
  )
}
