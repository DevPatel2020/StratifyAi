/** Minimal RFC-4180 style CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string, maxRows = 5000): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      if (rows.length > maxRows) break
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((f) => f !== '')) rows.push(row)
  }
  return rows
}

export interface ColumnStats {
  name: string
  type: 'numeric' | 'text'
  missing: number
  unique: number
  min?: number
  max?: number
  mean?: number
  top?: { value: string; count: number }[]
}

/** Deterministic column statistics: the model is given facts instead of guessing from a sample. */
export function csvStats(text: string): { rows: number; columns: ColumnStats[] } {
  const parsed = parseCsv(text)
  const [header = [], ...data] = parsed
  const columns = header.map((name, ci): ColumnStats => {
    const values = data.map((r) => (r[ci] ?? '').trim())
    const present = values.filter((v) => v !== '')
    const nums = present.map(Number).filter((n) => Number.isFinite(n))
    const numeric = present.length > 0 && nums.length / present.length >= 0.9
    const counts = new Map<string, number>()
    for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1)
    const base: ColumnStats = {
      name: name.trim() || `column_${ci + 1}`,
      type: numeric ? 'numeric' : 'text',
      missing: values.length - present.length,
      unique: counts.size
    }
    if (numeric && nums.length) {
      const sum = nums.reduce((s, n) => s + n, 0)
      return { ...base, min: Math.min(...nums), max: Math.max(...nums), mean: Math.round((sum / nums.length) * 1000) / 1000 }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value, count]) => ({ value, count }))
    return { ...base, top }
  })
  return { rows: data.length, columns }
}

export function statsToText(s: { rows: number; columns: ColumnStats[] }): string {
  const lines = s.columns.map((c) =>
    c.type === 'numeric'
      ? `- ${c.name} (numeric): min ${c.min}, max ${c.max}, mean ${c.mean}, missing ${c.missing}`
      : `- ${c.name} (text): ${c.unique} unique, missing ${c.missing}, top: ${(c.top ?? []).map((t) => `${t.value} (${t.count})`).join(', ')}`
  )
  return `Rows: ${s.rows}, Columns: ${s.columns.length}\n${lines.join('\n')}`
}
