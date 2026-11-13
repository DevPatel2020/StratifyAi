/**
 * Live end-to-end test of the reasoning pipeline against real providers.
 * Skipped by default; run with:  LIVE=1 npx vitest run tests/main/pipeline.live.test.ts
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import dotenv from 'dotenv'
import { describe, expect, it } from 'vitest'
import type { StreamEvent } from '@shared/types'

const live = process.env.LIVE === '1'

describe.skipIf(!live)('live pipeline', () => {
  it('asks, executes selected steps with streaming, and generates continuation paths', async () => {
    dotenv.config()
    const { SqliteStore } = await import('../../src/main/db/database')
    const { Repository } = await import('../../src/main/db/repository')
    const { LLMRouter } = await import('../../src/main/llm/router')
    const { createProviders } = await import('../../src/main/llm/openaiCompat')
    const { AiServiceClient } = await import('../../src/main/aiService')
    const { StratifyEngine } = await import('../../src/main/engine')

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stratify-live-'))
    const store = new SqliteStore(path.join(dir, 'test.sqlite'))
    await store.open()
    const repo = new Repository(store)
    const router = new LLMRouter(createProviders(process.env, () => repo.getSettings().models), () => repo.getSettings(), repo)
    const ai = new AiServiceClient(path.join(process.cwd(), 'ai-service'))
    await ai.status()
    const events: StreamEvent[] = []
    const engine = new StratifyEngine(repo, router, ai, (channel, payload) => {
      if (channel === 'stream') events.push(payload as StreamEvent)
    })

    const asked = await engine.ask({ conversationId: null, question: 'Should I learn React or Angular for my final year project?', parentId: null })
    const paths = asked.message.meta.paths!
    console.log('classification:', asked.message.meta.classification)
    console.log('paths:', paths.map((p) => `${p.name} [${p.framework}] score=${p.score}${p.recommended ? ' *' : ''}`))
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect(paths.filter((p) => p.recommended)).toHaveLength(1)

    const p = paths[0]
    const answer = await engine.execute({
      requestId: 'r1',
      conversationId: asked.conversation.id,
      parentId: asked.message.id,
      pathName: p.name,
      framework: p.framework,
      steps: p.steps,
      selected: [1, 3]
    })
    const tokens = events.filter((e) => e.type === 'token').length
    console.log(`answer via ${answer.meta.provider}/${answer.meta.model}: ${answer.meta.promptTokens}+${answer.meta.completionTokens} tokens, ${answer.meta.latencyMs}ms, ${tokens} streamed chunks`)
    console.log(answer.content.slice(0, 600))
    expect(answer.content.length).toBeGreaterThan(100)
    expect(tokens).toBeGreaterThan(1)
    expect(answer.meta.paths?.length).toBeGreaterThanOrEqual(2)
    expect(answer.parentId).toBe(asked.message.id)

    const analytics = repo.analytics()
    console.log('usage by purpose:', analytics.byPurpose)
    expect(analytics.totals.calls).toBeGreaterThan(2)
    store.flush()
  }, 240_000)

  it('generates valid paths reliably across question types', async () => {
    dotenv.config()
    const { SqliteStore } = await import('../../src/main/db/database')
    const { Repository } = await import('../../src/main/db/repository')
    const { LLMRouter } = await import('../../src/main/llm/router')
    const { createProviders } = await import('../../src/main/llm/openaiCompat')
    const { generatePaths } = await import('../../src/main/pipeline/paths')
    const { candidateFrameworks } = await import('../../src/main/pipeline/frameworks')

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stratify-live-'))
    const store = new SqliteStore(path.join(dir, 'test.sqlite'))
    await store.open()
    const repo = new Repository(store)
    // cloud only: this measures the primary provider's structured-output reliability
    repo.saveSettings({ ...repo.getSettings(), providerOrder: ['groq', 'gemini'] })
    const router = new LLMRouter(createProviders(process.env, () => repo.getSettings().models), () => repo.getSettings(), repo)
    const questions: [string, any][] = [
      ['Why does my Python script get slower as the dataset grows?', 'coding'],
      ['How can a small café increase revenue in 6 months?', 'business_strategy'],
      ['Explain transformers in machine learning simply', 'learning'],
      ['What analysis should I run on student exam results?', 'data_analysis'],
      ['Help me plan a study schedule for my exams', 'personal_planning'],
      ['Give me ideas for a hackathon project', 'creative']
    ]
    let fallbacks = 0
    for (const [q, type] of questions) {
      const r = await generatePaths(router, { question: q, type, frameworks: candidateFrameworks(type, repo.listTemplates()) })
      if (r.fallback) fallbacks++
      console.log(`${r.fallback ? "FALLBACK" : "ok      "} ${q.slice(0, 45)} → ${r.paths.map((p) => p.name).join(" | ")}${r.error ? ` ERROR: ${r.error.slice(0, 300)}` : ""}`)
    }
    const usage = repo.analytics()
    console.log(`calls ${usage.totals.calls}, failures ${usage.totals.failures}`)
    expect(fallbacks).toBe(0)
  }, 240_000)
})
