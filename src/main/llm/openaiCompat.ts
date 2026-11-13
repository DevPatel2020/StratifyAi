import OpenAI from 'openai'
import type { ChatMessage, ProviderId } from '@shared/types'
import {
  estimateTokens,
  type AgentMessage,
  type CallOptions,
  type LLMProvider,
  type LLMResult,
  type ToolDefinition,
  type ToolTurnResult
} from './types'

export interface ProviderConfig {
  id: ProviderId
  baseURL: string
  apiKey: () => string
  model: () => string
  fastModel?: () => string
  /** local providers need no key */
  keyless?: boolean
  timeoutMs?: number
}

/**
 * One provider implementation for every OpenAI-compatible endpoint:
 * Groq (/openai/v1), Google Gemini (/v1beta/openai) and Ollama (/v1).
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly id: ProviderId
  private client: OpenAI | null = null
  private clientKey = ''

  constructor(private readonly cfg: ProviderConfig) {
    this.id = cfg.id
  }

  isConfigured(): boolean {
    return this.cfg.keyless === true || this.cfg.apiKey().length > 0
  }

  modelName(fast = false): string {
    return fast && this.cfg.fastModel ? this.cfg.fastModel() : this.cfg.model()
  }

  private getClient(): OpenAI {
    const key = this.cfg.keyless ? 'ollama' : this.cfg.apiKey()
    if (!this.client || key !== this.clientKey) {
      this.client = new OpenAI({
        apiKey: key,
        baseURL: this.cfg.baseURL,
        maxRetries: 1,
        timeout: this.cfg.timeoutMs ?? 60_000
      })
      this.clientKey = key
    }
    return this.client
  }

  private base(messages: unknown[], opts: CallOptions) {
    const model = this.modelName(opts.fast)
    const reasoning = isReasoningModel(model)
    return {
      model,
      messages: messages as any,
      temperature: opts.temperature ?? 0.7,
      // reasoning models spend tokens thinking before answering; tiny budgets would leave the answer empty
      max_tokens: reasoning ? Math.max(opts.maxTokens ?? 2048, 600) : (opts.maxTokens ?? 2048),
      ...(reasoning && this.id === 'groq' && /gpt-oss/i.test(model) ? { reasoning_effort: 'low' as const } : {}),
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {})
    }
  }

  async chat(messages: ChatMessage[], opts: CallOptions = {}): Promise<LLMResult> {
    const started = Date.now()
    const res = await this.getClient().chat.completions.create(this.base(messages, opts), { signal: opts.signal })
    const text = res.choices[0]?.message?.content ?? ''
    return {
      text,
      provider: this.id,
      model: this.modelName(opts.fast),
      latencyMs: Date.now() - started,
      usage: res.usage
        ? { promptTokens: res.usage.prompt_tokens, completionTokens: res.usage.completion_tokens, estimated: false }
        : { promptTokens: estimateTokens(JSON.stringify(messages)), completionTokens: estimateTokens(text), estimated: true }
    }
  }

  async stream(messages: ChatMessage[], onToken: (t: string) => void, opts: CallOptions = {}): Promise<LLMResult> {
    const started = Date.now()
    const stream = await this.getClient().chat.completions.create(
      { ...this.base(messages, opts), stream: true },
      { signal: opts.signal }
    )
    let text = ''
    let usage: LLMResult['usage'] | null = null
    for await (const chunk of stream as AsyncIterable<any>) {
      const token = chunk.choices?.[0]?.delta?.content
      if (token) {
        text += token
        onToken(token)
      }
      const u = chunk.usage ?? chunk.x_groq?.usage
      if (u) usage = { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, estimated: false }
    }
    return {
      text,
      provider: this.id,
      model: this.modelName(opts.fast),
      latencyMs: Date.now() - started,
      usage: usage ?? {
        promptTokens: estimateTokens(JSON.stringify(messages)),
        completionTokens: estimateTokens(text),
        estimated: true
      }
    }
  }

  async chatWithTools(messages: AgentMessage[], tools: ToolDefinition[], opts: CallOptions = {}): Promise<ToolTurnResult> {
    const started = Date.now()
    const res = await this.getClient().chat.completions.create(
      {
        ...this.base(messages, opts),
        tools: tools.map((t) => ({ type: 'function' as const, function: t })),
        tool_choice: 'auto'
      },
      { signal: opts.signal }
    )
    const msg = res.choices[0]?.message
    const text = msg?.content ?? ''
    return {
      text,
      toolCalls: (msg?.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
      provider: this.id,
      model: this.modelName(opts.fast),
      latencyMs: Date.now() - started,
      usage: res.usage
        ? { promptTokens: res.usage.prompt_tokens, completionTokens: res.usage.completion_tokens, estimated: false }
        : { promptTokens: estimateTokens(JSON.stringify(messages)), completionTokens: estimateTokens(text), estimated: true }
    }
  }

  async ping(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) return { ok: false, detail: 'No API key configured' }
    try {
      if (this.id === 'ollama') {
        const root = this.cfg.baseURL.replace(/\/v1\/?$/, '')
        const res = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(2500) })
        if (!res.ok) return { ok: false, detail: `Ollama responded ${res.status}` }
        const data = (await res.json()) as { models?: { name: string }[] }
        const names = (data.models ?? []).map((m) => m.name)
        const want = this.modelName()
        const has = names.some((n) => n === want || n.startsWith(`${want}:`))
        return has
          ? { ok: true, detail: `Running · ${names.length} local model(s)` }
          : { ok: false, detail: `Model "${want}" not pulled (run: ollama pull ${want})` }
      }
      await this.getClient().models.list({ timeout: 8000, maxRetries: 0 } as any)
      return { ok: true, detail: 'Connected' }
    } catch (err: any) {
      if (this.id === 'ollama') return { ok: false, detail: 'Ollama is not running (start the Ollama app)' }
      return { ok: false, detail: describeError(err) }
    }
  }
}

/** Models that emit hidden reasoning before the answer (Groq gpt-oss, Qwen3, DeepSeek-R1, …). */
export const isReasoningModel = (model: string): boolean => /gpt-oss|qwen3|deepseek-r1|\bo[134]\b/i.test(model)

export function describeError(err: any): string {
  const status = err?.status ?? err?.response?.status
  const msg = err?.error?.message ?? err?.message ?? String(err)
  return status ? `HTTP ${status}: ${msg}` : msg
}

export function createProviders(env: NodeJS.ProcessEnv, models: () => { groq: string; gemini: string; ollama: string; ollamaFast: string }) {
  const ollamaBase = (env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
  return {
    groq: new OpenAICompatProvider({
      id: 'groq',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: () => (env.GROQ_API_KEY || '').trim(),
      model: () => models().groq
    }),
    gemini: new OpenAICompatProvider({
      id: 'gemini',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: () => (env.GEMINI_API_KEY || '').trim(),
      model: () => models().gemini
    }),
    ollama: new OpenAICompatProvider({
      id: 'ollama',
      baseURL: `${ollamaBase}/v1`,
      apiKey: () => '',
      keyless: true,
      model: () => models().ollama,
      fastModel: () => models().ollamaFast,
      timeoutMs: 300_000
    })
  } satisfies Record<ProviderId, LLMProvider>
}
