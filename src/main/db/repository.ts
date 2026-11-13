import { randomUUID } from 'crypto'
import type {
  AnalyticsSummary,
  Conversation,
  ConversationDetail,
  Message,
  MessageMeta,
  ProviderId,
  QuestionType,
  Settings,
  Template,
  UsageRecord
} from '@shared/types'
import type { SqliteStore } from './database'
import { BUILTIN_TEMPLATES } from '../pipeline/frameworks'

export const DEFAULT_SETTINGS: Settings = {
  providerOrder: ['groq', 'gemini', 'ollama'],
  models: {
    groq: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    ollama: process.env.OLLAMA_MODEL || 'llama3.1',
    ollamaFast: process.env.OLLAMA_FAST_MODEL || 'llama3.2'
  },
  temperature: 0.7,
  useMemory: true,
  useRag: false,
  useTools: false,
  useCritique: false,
  theme: 'dark'
}

const rowToConversation = (r: any): Conversation => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  summary: r.summary,
  headId: r.head_id ?? null,
  dataContext: r.data_context
})

const rowToMessage = (r: any): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  parentId: r.parent_id ?? null,
  role: r.role,
  content: r.content,
  meta: JSON.parse(r.meta || '{}'),
  createdAt: r.created_at
})

export class Repository {
  constructor(private readonly db: SqliteStore) {}

  // ---------- settings ----------
  getSettings(): Settings {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['app'])
    if (!row) return structuredClone(DEFAULT_SETTINGS)
    const saved = JSON.parse(row.value)
    return { ...DEFAULT_SETTINGS, ...saved, models: { ...DEFAULT_SETTINGS.models, ...(saved.models || {}) } }
  }

  saveSettings(settings: Settings): Settings {
    this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['app', JSON.stringify(settings)])
    return settings
  }

  // ---------- conversations ----------
  listConversations(search = ''): Conversation[] {
    if (!search.trim()) {
      return this.db.all('SELECT * FROM conversations ORDER BY updated_at DESC').map(rowToConversation)
    }
    const like = `%${search.trim()}%`
    return this.db
      .all(
        `SELECT DISTINCT c.* FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.title LIKE ? OR m.content LIKE ? ORDER BY c.updated_at DESC`,
        [like, like]
      )
      .map(rowToConversation)
  }

  createConversation(title = 'New chat'): Conversation {
    const now = Date.now()
    const id = randomUUID()
    this.db.run('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, title, now, now])
    return this.getConversation(id)!
  }

  getConversation(id: string): Conversation | undefined {
    const r = this.db.get('SELECT * FROM conversations WHERE id = ?', [id])
    return r ? rowToConversation(r) : undefined
  }

  getDetail(id: string): ConversationDetail | undefined {
    const conversation = this.getConversation(id)
    if (!conversation) return undefined
    const messages = this.db
      .all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [id])
      .map(rowToMessage)
    return { conversation, messages }
  }

  updateConversation(id: string, patch: Partial<Pick<Conversation, 'title' | 'summary' | 'headId' | 'dataContext'>>): void {
    const columns: Record<string, unknown> = {
      title: patch.title,
      summary: patch.summary,
      head_id: patch.headId,
      data_context: patch.dataContext
    }
    const cols: string[] = []
    const vals: any[] = []
    for (const [col, value] of Object.entries(columns)) {
      if (value === undefined) continue
      cols.push(`${col} = ?`)
      vals.push(value)
    }
    cols.push('updated_at = ?')
    vals.push(Date.now(), id)
    this.db.run(`UPDATE conversations SET ${cols.join(', ')} WHERE id = ?`, vals)
  }

  deleteConversation(id: string): void {
    this.db.run('DELETE FROM messages WHERE conversation_id = ?', [id])
    this.db.run('DELETE FROM conversations WHERE id = ?', [id])
  }

  // ---------- messages ----------
  addMessage(m: Omit<Message, 'id' | 'createdAt'>): Message {
    const id = randomUUID()
    const createdAt = Date.now()
    this.db.run(
      'INSERT INTO messages (id, conversation_id, parent_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, m.conversationId, m.parentId, m.role, m.content, JSON.stringify(m.meta), createdAt]
    )
    this.updateConversation(m.conversationId, { headId: id })
    return { ...m, id, createdAt }
  }

  getMessage(id: string): Message | undefined {
    const r = this.db.get('SELECT * FROM messages WHERE id = ?', [id])
    return r ? rowToMessage(r) : undefined
  }

  updateMessage(id: string, patch: { content?: string; meta?: MessageMeta }): Message | undefined {
    const current = this.getMessage(id)
    if (!current) return undefined
    const content = patch.content ?? current.content
    const meta = patch.meta ? { ...current.meta, ...patch.meta } : current.meta
    this.db.run('UPDATE messages SET content = ?, meta = ? WHERE id = ?', [content, JSON.stringify(meta), id])
    return { ...current, content, meta }
  }

  /** Messages from the root of the conversation tree down to (and including) `messageId`. */
  ancestry(messageId: string | null): Message[] {
    const chain: Message[] = []
    let cursor = messageId
    const seen = new Set<string>()
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor)
      const m = this.getMessage(cursor)
      if (!m) break
      chain.unshift(m)
      cursor = m.parentId
    }
    return chain
  }

  // ---------- usage + feedback ----------
  logUsage(u: Omit<UsageRecord, 'id' | 'ts'>): void {
    this.db.run(
      `INSERT INTO usage (ts, provider, model, purpose, prompt_tokens, completion_tokens, estimated, latency_ms, ok, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Date.now(), u.provider, u.model, u.purpose, u.promptTokens, u.completionTokens, u.estimated ? 1 : 0, u.latencyMs, u.ok ? 1 : 0, u.error]
    )
  }

  logFeedback(f: {
    messageId?: string
    kind: 'click' | 'up' | 'down'
    framework?: string
    questionType?: string
    stepsExecuted?: number
    stepsAvailable?: number
  }): void {
    this.db.run(
      `INSERT INTO feedback (ts, message_id, kind, framework, question_type, steps_executed, steps_available)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [Date.now(), f.messageId ?? null, f.kind, f.framework ?? '', f.questionType ?? '', f.stepsExecuted ?? 0, f.stepsAvailable ?? 0]
    )
  }

  /** Click-through prior per framework for a question type (Laplace smoothed), used by the path ranker. */
  frameworkPriors(questionType: string): Record<string, number> {
    const rows = this.db.all<{ framework: string; n: number }>(
      `SELECT framework, COUNT(*) AS n FROM feedback WHERE kind IN ('click','up') AND question_type = ? AND framework != ''
       GROUP BY framework`,
      [questionType]
    )
    const total = rows.reduce((s, r) => s + r.n, 0)
    const k = Math.max(rows.length, 1)
    const priors: Record<string, number> = {}
    for (const r of rows) priors[r.framework] = (r.n + 1) / (total + k)
    return priors
  }

  analytics(): AnalyticsSummary {
    const t = this.db.get<any>(
      `SELECT COUNT(*) calls, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) failures,
       COALESCE(SUM(prompt_tokens),0) pt, COALESCE(SUM(completion_tokens),0) ct,
       COALESCE(AVG(CASE WHEN ok = 1 THEN latency_ms END),0) lat FROM usage`
    )!
    const byProvider = this.db.all<any>(
      `SELECT provider, COUNT(*) calls, SUM(prompt_tokens + completion_tokens) tokens,
       COALESCE(AVG(CASE WHEN ok = 1 THEN latency_ms END),0) lat, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) failures
       FROM usage GROUP BY provider`
    )
    const byPurpose = this.db.all<any>(
      'SELECT purpose, COUNT(*) calls, SUM(prompt_tokens + completion_tokens) tokens FROM usage GROUP BY purpose ORDER BY tokens DESC'
    )
    const byDay = this.db.all<any>(
      `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') day, SUM(prompt_tokens + completion_tokens) tokens,
       COUNT(*) calls FROM usage GROUP BY day ORDER BY day DESC LIMIT 30`
    ).reverse()
    const frameworkClicks = this.db.all<any>(
      `SELECT framework, COUNT(*) clicks FROM feedback WHERE kind = 'click' AND framework != ''
       GROUP BY framework ORDER BY clicks DESC LIMIT 12`
    )
    const steps = this.db.get<any>(
      `SELECT COALESCE(SUM(steps_executed),0) e, COALESCE(SUM(steps_available),0) a FROM feedback WHERE kind = 'click'`
    )!
    const fb = this.db.get<any>(
      `SELECT SUM(CASE WHEN kind='up' THEN 1 ELSE 0 END) up, SUM(CASE WHEN kind='down' THEN 1 ELSE 0 END) down FROM feedback`
    )!
    return {
      totals: {
        calls: t.calls,
        failures: t.failures ?? 0,
        promptTokens: t.pt,
        completionTokens: t.ct,
        avgLatencyMs: Math.round(t.lat)
      },
      byProvider: byProvider.map((r) => ({
        provider: r.provider as ProviderId,
        calls: r.calls,
        tokens: r.tokens ?? 0,
        avgLatencyMs: Math.round(r.lat),
        failures: r.failures ?? 0
      })),
      byPurpose: byPurpose.map((r) => ({ purpose: r.purpose, calls: r.calls, tokens: r.tokens ?? 0 })),
      byDay: byDay.map((r) => ({ day: r.day, tokens: r.tokens ?? 0, calls: r.calls })),
      frameworkClicks: frameworkClicks.map((r) => ({ framework: r.framework, clicks: r.clicks })),
      stepUsage: { stepsExecuted: steps.e, stepsAvailable: steps.a },
      feedback: { up: fb.up ?? 0, down: fb.down ?? 0 }
    }
  }

  // ---------- templates ----------
  listTemplates(): Template[] {
    const custom = this.db.all<any>('SELECT * FROM templates ORDER BY name').map(
      (r): Template => ({
        id: r.id,
        name: r.name,
        description: r.description,
        steps: JSON.parse(r.steps),
        questionTypes: JSON.parse(r.question_types),
        builtin: false
      })
    )
    return [...BUILTIN_TEMPLATES, ...custom]
  }

  saveTemplate(t: Omit<Template, 'builtin' | 'id'> & { id?: string }): Template {
    const id = t.id && !t.id.startsWith('builtin:') ? t.id : randomUUID()
    this.db.run('INSERT OR REPLACE INTO templates (id, name, description, steps, question_types) VALUES (?, ?, ?, ?, ?)', [
      id,
      t.name,
      t.description,
      JSON.stringify(t.steps),
      JSON.stringify(t.questionTypes as QuestionType[])
    ])
    return { ...t, id, builtin: false }
  }

  deleteTemplate(id: string): void {
    this.db.run('DELETE FROM templates WHERE id = ?', [id])
  }
}
