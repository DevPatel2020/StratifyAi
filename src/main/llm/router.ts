import type { ChatMessage, ProviderId, ProviderStatus, Settings } from '@shared/types'
import { describeError } from './openaiCompat'
import type { AgentMessage, CallOptions, LLMProvider, LLMResult, ToolDefinition, ToolTurnResult } from './types'

export interface UsageSink {
  logUsage(u: {
    provider: ProviderId
    model: string
    purpose: string
    promptTokens: number
    completionTokens: number
    estimated: boolean
    latencyMs: number
    ok: boolean
    error: string
  }): void
}

export interface RouteOptions extends CallOptions {
  purpose: string
  /** force a specific provider (Model Lab); no fallback */
  only?: ProviderId
  /** try this provider first, then the normal order */
  prefer?: ProviderId
}

export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: { provider: ProviderId; error: string }[]) {
    super(
      attempts.length === 0
        ? 'No AI provider is configured. Add GROQ_API_KEY or GEMINI_API_KEY to .env, or start Ollama.'
        : `All AI providers failed: ${attempts.map((a) => `${a.provider} (${a.error})`).join('; ')}`
    )
  }
}

const isTransientJsonError = (err: any) => /json_validate_failed|Failed to generate JSON/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`)

/**
 * For HTTP 429 with a short reset ("Please try again in 2.5s" / retry-after header), returns the wait in ms
 * (capped at 10 s). Long or unknown waits return null so the router falls back to the next provider instead.
 */
export function shortRateLimitWait(err: any): number | null {
  if ((err?.status ?? err?.response?.status) !== 429) return null
  const header = Number(err?.headers?.['retry-after'] ?? err?.headers?.get?.('retry-after'))
  const m = /try again in ([\d.]+)(ms|s)/i.exec(err?.message ?? '')
  const ms = m ? Number(m[1]) * (m[2] === 'ms' ? 1 : 1000) : Number.isFinite(header) && header > 0 ? header * 1000 : NaN
  if (!Number.isFinite(ms) || ms > 10_000) return null
  return Math.ceil(ms) + 250
}

/**
 * For HTTP 429 quota errors with a long reset ("Please retry in 12h30m37s", per-day limits), returns the
 * cooldown in ms so the router can skip that provider until the quota resets. Unknown resets → 60 s.
 */
export function quotaCooldown(err: any): number | null {
  if ((err?.status ?? err?.response?.status) !== 429 || shortRateLimitWait(err) !== null) return null
  const m = /(?:try|retry)(?: again)? in (?:([\d.]+)h)?(?:([\d.]+)m(?!s))?(?:([\d.]+)s)?/i.exec(err?.message ?? '')
  if (!m) return 60_000
  const [h, min, sec] = [m[1], m[2], m[3]].map((v) => Number(v ?? 0))
  const ms = (h * 3600 + min * 60 + sec) * 1000
  return ms > 0 ? ms : 60_000
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  })

const isAbort =(err: any) => err?.name === 'AbortError' || err?.name === 'APIUserAbortError' || /aborted/i.test(err?.message ?? '')

/**
 * Routes every LLM call through the user's provider order with automatic fallback
 * (e.g. Groq rate-limited -> Gemini -> local Ollama) and logs tokens + latency for analytics.
 */
export class LLMRouter {
  private ollamaCache: { ok: boolean; at: number } = { ok: false, at: 0 }
  /** provider → time until which it is skipped (exhausted daily/minute quota) */
  private cooldownUntil = new Map<ProviderId, number>()

  constructor(
    private readonly providers: Record<ProviderId, LLMProvider>,
    private readonly settings: () => Settings,
    private readonly sink: UsageSink
  ) {}

  provider(id: ProviderId): LLMProvider {
    return this.providers[id]
  }

  private async ollamaUp(): Promise<boolean> {
    if (Date.now() - this.ollamaCache.at < 30_000) return this.ollamaCache.ok
    const { ok } = await this.providers.ollama.ping()
    this.ollamaCache = { ok, at: Date.now() }
    return ok
  }

  async order(opts: Pick<RouteOptions, 'only' | 'prefer'>): Promise<LLMProvider[]> {
    let ids = opts.only ? [opts.only] : [...this.settings().providerOrder]
    if (opts.prefer && !opts.only) ids = [opts.prefer, ...ids.filter((i) => i !== opts.prefer)]
    const out: LLMProvider[] = []
    for (const id of ids) {
      const p = this.providers[id]
      if (!p.isConfigured()) continue
      if (!opts.only && (this.cooldownUntil.get(id) ?? 0) > Date.now()) continue
      if (id === 'ollama' && !opts.only && !(await this.ollamaUp())) continue
      out.push(p)
    }
    return out
  }

  private record(p: LLMProvider, opts: RouteOptions, r: LLMResult | null, err?: unknown, started?: number) {
    this.sink.logUsage({
      provider: p.id,
      model: p.modelName(opts.fast),
      purpose: opts.purpose,
      promptTokens: r?.usage.promptTokens ?? 0,
      completionTokens: r?.usage.completionTokens ?? 0,
      estimated: r?.usage.estimated ?? false,
      latencyMs: r?.latencyMs ?? (started ? Date.now() - started : 0),
      ok: !err,
      error: err ? describeError(err) : ''
    })
  }

  private async attempt<T extends LLMResult>(
    opts: RouteOptions,
    fn: (p: LLMProvider, o: CallOptions) => Promise<T>,
    canFallback: () => boolean = () => true
  ): Promise<T> {
    const providers = await this.order(opts)
    const attempts: { provider: ProviderId; error: string }[] = []
    const temperature = opts.temperature ?? this.settings().temperature
    for (const p of providers) {
      // Before falling back, a provider gets up to 2 quick retries for transient failures:
      // Groq json_validate_failed, or a rate limit whose reset is only a few seconds away.
      for (let retry = 0; retry < 3; retry++) {
        const started = Date.now()
        try {
          const r = await fn(p, { ...opts, temperature: retry ? Math.min(temperature, 0.3) : temperature })
          this.record(p, opts, r)
          return r
        } catch (err) {
          if (isAbort(err)) throw err
          this.record(p, opts, null, err, started)
          const cooldown = quotaCooldown(err)
          if (cooldown) this.cooldownUntil.set(p.id, Date.now() + cooldown)
          const wait = shortRateLimitWait(err)
          if (retry < 2 && canFallback() && (isTransientJsonError(err) || wait !== null)) {
            if (wait) await sleep(wait, opts.signal)
            continue
          }
          attempts.push({ provider: p.id, error: describeError(err) })
          break
        }
      }
      if (!canFallback()) break
    }
    throw new AllProvidersFailedError(attempts)
  }

  chat(messages: ChatMessage[], opts: RouteOptions): Promise<LLMResult> {
    return this.attempt(opts, (p, o) => p.chat(messages, o))
  }

  /** Streams tokens; falls back to the next provider only if no token was emitted yet. */
  stream(messages: ChatMessage[], onToken: (t: string) => void, opts: RouteOptions): Promise<LLMResult> {
    let emitted = false
    return this.attempt(
      opts,
      (p, o) =>
        p.stream(
          messages,
          (t) => {
            emitted = true
            onToken(t)
          },
          o
        ),
      () => !emitted
    )
  }

  chatWithTools(messages: AgentMessage[], tools: ToolDefinition[], opts: RouteOptions): Promise<ToolTurnResult> {
    return this.attempt(opts, (p, o) => p.chatWithTools(messages, tools, o))
  }

  async status(): Promise<ProviderStatus[]> {
    const s = this.settings()
    const ids = [...s.providerOrder]
    return Promise.all(
      ids.map(async (id) => {
        const p = this.providers[id]
        const res = await p.ping()
        if (id === 'ollama') this.ollamaCache = { ok: res.ok, at: Date.now() }
        return { id, configured: p.isConfigured(), available: res.ok, model: p.modelName(), detail: res.detail }
      })
    )
  }
}
