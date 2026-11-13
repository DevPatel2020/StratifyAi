import { randomUUID } from 'crypto'
import { z } from 'zod'
import type { QuestionType, Template, ThinkingPath } from '@shared/types'
import { pathsMessages } from '../prompts'
import type { LLMRouter } from '../llm/router'
import { parseWith } from './json'

const text = z.union([z.string(), z.number()]).transform((v) => String(v).trim())

/** A step may come back as a plain string or as {"step"/"description"/"text": "..."}. */
const step = z.union([
  text,
  z
    .object({ step: text.optional(), description: text.optional(), text: text.optional(), title: text.optional() })
    .transform((o) => o.description ?? o.text ?? o.step ?? o.title ?? '')
])

/**
 * Lenient schema: models vary in key names ("title"/"approach" for name) and lengths, so we normalise
 * instead of rejecting. Anything unusable (no name, fewer than 2 steps) is dropped.
 */
const RawPath = z
  .object({
    name: text.optional(),
    title: text.optional(),
    approach: text.optional(),
    framework: text.optional(),
    rationale: text.optional(),
    why: text.optional(),
    steps: z.array(step).default([])
  })
  .transform((p) => ({
    name: (p.name ?? p.title ?? p.approach ?? '').slice(0, 60),
    framework: p.framework || 'Custom',
    rationale: p.rationale ?? p.why ?? '',
    steps: p.steps.filter((s) => s.length > 0)
  }))

export const PathsSchema = z.object({
  paths: z
    .array(RawPath)
    .transform((paths) => paths.filter((p) => p.name && p.steps.length >= 2))
    .pipe(z.array(z.any()).min(1, 'no usable paths'))
})

const GENERIC_NAME = /^(framework|path|approach|option|step)\s*#?\d*$/i

export function toThinkingPaths(raw: z.infer<typeof PathsSchema>): ThinkingPath[] {
  return (raw.paths as z.infer<typeof RawPath>[]).slice(0, 4).map((p) => ({
    id: randomUUID(),
    // some models echo placeholders ("Framework 1"); fall back to the framework's own name
    name: GENERIC_NAME.test(p.name) && p.framework !== 'Custom' ? p.framework : p.name,
    framework: p.framework,
    rationale: p.rationale,
    steps: p.steps.slice(0, 3)
  }))
}

/** Deterministic fallback when every provider fails: use the framework templates directly. */
export function fallbackPaths(frameworks: Template[]): ThinkingPath[] {
  return frameworks.slice(0, 4).map((f) => ({
    id: randomUUID(),
    name: f.name,
    framework: f.name,
    rationale: f.description,
    steps: f.steps.slice(0, 3)
  }))
}

/**
 * Some models stop after one or two array items. Keep every valid generated path and fill the remaining
 * slots (up to 4) with template paths from frameworks the model did not use.
 */
export function topUp(paths: ThinkingPath[], frameworks: Template[], target = 4): ThinkingPath[] {
  if (paths.length >= target) return paths.slice(0, target)
  const used = new Set(paths.map((p) => p.framework.toLowerCase()))
  const extra = fallbackPaths(frameworks.filter((f) => !used.has(f.name.toLowerCase())))
  return [...paths, ...extra].slice(0, target)
}

export async function generatePaths(
  router: LLMRouter,
  opts: {
    question: string
    type: QuestionType
    frameworks: Template[]
    context?: string
    continuation?: { lastPath: string; lastAnswer: string }
  }
): Promise<{ paths: ThinkingPath[]; fallback: boolean; error?: string }> {
  const messages = pathsMessages(opts)
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await router.chat(messages, {
        purpose: opts.continuation ? 'paths:continue' : 'paths',
        json: true,
        temperature: attempt === 0 ? 0.8 : 0.4,
        maxTokens: 1800,
        // if the router has to fall back to Ollama, use the small fast model for this structured task
        fast: true
      })
      try {
        return { paths: topUp(toThinkingPaths(parseWith(PathsSchema, res.text)), opts.frameworks), fallback: false }
      } catch (parseErr: any) {
        console.warn(`[paths] ${res.provider} output failed validation:`, parseErr?.message?.slice(0, 300), res.text.slice(0, 300))
        throw parseErr
      }
    } catch (err: any) {
      lastError = err?.message ?? String(err)
      if (/No AI provider|All AI providers failed/.test(lastError)) break
    }
  }
  return { paths: fallbackPaths(opts.frameworks), fallback: true, error: lastError }
}
