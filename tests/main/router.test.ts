import { describe, expect, it, vi } from 'vitest'
import type { ProviderId, Settings } from '@shared/types'
import { LLMRouter, AllProvidersFailedError, shortRateLimitWait } from '../../src/main/llm/router'
import type { LLMProvider, LLMResult } from '../../src/main/llm/types'

const settings: Settings = {
  providerOrder: ['groq', 'gemini', 'ollama'],
  models: { groq: 'g', gemini: 'm', ollama: 'o', ollamaFast: 'f' },
  temperature: 0.5,
  useMemory: true,
  useRag: false,
  useTools: false,
  useCritique: false,
  theme: 'dark'
}

function fakeProvider(id: ProviderId, behaviour: 'ok' | 'fail' | 'unconfigured', opts: { tokensBeforeFail?: number } = {}): LLMProvider {
  const result = (text: string): LLMResult => ({
    text,
    provider: id,
    model: id,
    latencyMs: 5,
    usage: { promptTokens: 10, completionTokens: 5, estimated: false }
  })
  return {
    id,
    isConfigured: () => behaviour !== 'unconfigured',
    modelName: () => id,
    chat: vi.fn(async () => {
      if (behaviour === 'fail') throw Object.assign(new Error('rate limited'), { status: 429 })
      return result(`${id} answer`)
    }),
    stream: vi.fn(async (_m, onToken) => {
      for (let i = 0; i < (opts.tokensBeforeFail ?? 0); i++) onToken('x')
      if (behaviour === 'fail') throw new Error('stream broke')
      onToken(`${id} `)
      return result(`${id} streamed`)
    }),
    chatWithTools: vi.fn(),
    ping: vi.fn(async () => ({ ok: behaviour === 'ok', detail: '' }))
  }
}

const sink = () => ({ logUsage: vi.fn() })

describe('LLMRouter', () => {
  it('uses the first configured provider', async () => {
    const s = sink()
    const router = new LLMRouter(
      { groq: fakeProvider('groq', 'ok'), gemini: fakeProvider('gemini', 'ok'), ollama: fakeProvider('ollama', 'ok') },
      () => settings,
      s
    )
    const r = await router.chat([{ role: 'user', content: 'hi' }], { purpose: 'test' })
    expect(r.provider).toBe('groq')
    expect(s.logUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'groq', ok: true, purpose: 'test' }))
  })

  it('falls back to the next provider on failure and logs the failure', async () => {
    const s = sink()
    const router = new LLMRouter(
      { groq: fakeProvider('groq', 'fail'), gemini: fakeProvider('gemini', 'ok'), ollama: fakeProvider('ollama', 'ok') },
      () => settings,
      s
    )
    const r = await router.chat([{ role: 'user', content: 'hi' }], { purpose: 'test' })
    expect(r.provider).toBe('gemini')
    expect(s.logUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'groq', ok: false }))
  })

  it('skips unconfigured providers and unreachable Ollama', async () => {
    const router = new LLMRouter(
      { groq: fakeProvider('groq', 'unconfigured'), gemini: fakeProvider('gemini', 'unconfigured'), ollama: fakeProvider('ollama', 'fail') },
      () => settings,
      sink()
    )
    await expect(router.chat([{ role: 'user', content: 'hi' }], { purpose: 'test' })).rejects.toBeInstanceOf(AllProvidersFailedError)
  })

  it('does not fall back mid-stream once tokens were emitted', async () => {
    const router = new LLMRouter(
      { groq: fakeProvider('groq', 'fail', { tokensBeforeFail: 2 }), gemini: fakeProvider('gemini', 'ok'), ollama: fakeProvider('ollama', 'ok') },
      () => settings,
      sink()
    )
    await expect(router.stream([{ role: 'user', content: 'hi' }], () => {}, { purpose: 'test' })).rejects.toThrow(/All AI providers failed/)
  })

  it('falls back for streams that fail before the first token', async () => {
    const tokens: string[] = []
    const router = new LLMRouter(
      { groq: fakeProvider('groq', 'fail'), gemini: fakeProvider('gemini', 'ok'), ollama: fakeProvider('ollama', 'ok') },
      () => settings,
      sink()
    )
    const r = await router.stream([{ role: 'user', content: 'hi' }], (t) => tokens.push(t), { purpose: 'test' })
    expect(r.provider).toBe('gemini')
    expect(tokens.join('')).toBe('gemini ')
  })

  it('retries the same provider once on a transient JSON validation error', async () => {
    const groq = fakeProvider('groq', 'ok')
    let calls = 0
    groq.chat = vi.fn(async () => {
      calls++
      if (calls === 1) throw Object.assign(new Error('400 Failed to generate JSON'), { status: 400 })
      return { text: '{}', provider: 'groq', model: 'groq', latencyMs: 1, usage: { promptTokens: 1, completionTokens: 1, estimated: false } }
    }) as any
    const router = new LLMRouter({ groq, gemini: fakeProvider('gemini', 'ok'), ollama: fakeProvider('ollama', 'ok') }, () => settings, sink())
    const r = await router.chat([], { purpose: 't', json: true })
    expect(r.provider).toBe('groq')
    expect(calls).toBe(2)
  })

  it('waits out short rate limits instead of falling back', async () => {
    const groq = fakeProvider('groq', 'ok')
    let calls = 0
    groq.chat = vi.fn(async () => {
      calls++
      if (calls === 1) throw Object.assign(new Error('Rate limit reached. Please try again in 120ms.'), { status: 429 })
      return { text: 'ok', provider: 'groq', model: 'groq', latencyMs: 1, usage: { promptTokens: 1, completionTokens: 1, estimated: false } }
    }) as any
    const router = new LLMRouter({ groq, gemini: fakeProvider('gemini', 'ok'), ollama: fakeProvider('ollama', 'ok') }, () => settings, sink())
    expect((await router.chat([], { purpose: 't' })).provider).toBe('groq')
    expect(calls).toBe(2)
  })

  it('parses rate-limit waits and ignores long ones', () => {
    expect(shortRateLimitWait({ status: 429, message: 'Please try again in 2.535s' })).toBe(2785)
    expect(shortRateLimitWait({ status: 429, message: 'Please try again in 217.5ms' })).toBe(468)
    expect(shortRateLimitWait({ status: 429, message: 'Please try again in 7m12s' })).toBeNull()
    expect(shortRateLimitWait({ status: 500, message: 'try again in 1s' })).toBeNull()
  })

  it('honours prefer and only', async () => {
    const router = new LLMRouter(
      { groq: fakeProvider('groq', 'ok'), gemini: fakeProvider('gemini', 'ok'), ollama: fakeProvider('ollama', 'ok') },
      () => settings,
      sink()
    )
    expect((await router.chat([], { purpose: 't', prefer: 'gemini' })).provider).toBe('gemini')
    expect((await router.chat([], { purpose: 't', only: 'ollama' })).provider).toBe('ollama')
  })
})
