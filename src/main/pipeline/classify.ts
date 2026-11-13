import { z } from 'zod'
import { QUESTION_TYPES, type Classification, type QuestionType } from '@shared/types'
import type { AiServiceClient } from '../aiService'
import type { LLMRouter } from '../llm/router'
import { classifyMessages } from '../prompts'
import { parseWith } from './json'

const KEYWORDS: Record<QuestionType, string[]> = {
  coding: ['code', 'bug', 'error', 'function', 'python', 'javascript', 'api', 'react', 'compile', 'debug', 'sql', 'program'],
  data_analysis: ['data', 'dataset', 'csv', 'chart', 'statistic', 'regression', 'trend', 'metric', 'excel', 'analy'],
  business_strategy: ['business', 'market', 'startup', 'revenue', 'customer', 'growth', 'competitor', 'pricing', 'strategy'],
  learning: ['explain', 'what is', 'how does', 'learn', 'understand', 'concept', 'teach', 'difference between'],
  decision_making: ['should i', 'choose', 'decide', 'better', 'vs', 'versus', 'option', 'which one', 'worth it'],
  creative: ['idea', 'story', 'design', 'creative', 'name for', 'brainstorm', 'slogan', 'poem', 'logo'],
  research: ['research', 'paper', 'study', 'evidence', 'literature', 'hypothesis', 'thesis', 'survey'],
  personal_planning: ['plan', 'schedule', 'habit', 'goal', 'career', 'routine', 'productivity', 'budget', 'prepare for']
}

/** Keyword scoring, the last-resort classifier when neither the ML model nor an LLM is reachable. */
export function heuristicClassify(question: string): Classification {
  const q = question.toLowerCase()
  let best: QuestionType = 'learning'
  let bestScore = 0
  for (const type of QUESTION_TYPES) {
    const score = KEYWORDS[type].reduce((s, k) => s + (q.includes(k) ? 1 : 0), 0)
    if (score > bestScore) {
      best = type
      bestScore = score
    }
  }
  return { label: best, confidence: bestScore ? Math.min(0.3 + bestScore * 0.15, 0.75) : 0.2, source: 'heuristic' }
}

const LlmClass = z.object({ label: z.enum(QUESTION_TYPES), confidence: z.number().min(0).max(1).default(0.6) })

/** Three-tier classifier: trained ML model (ai-service) → LLM zero-shot → keyword heuristic. */
export async function classifyQuestion(question: string, ai: AiServiceClient, router: LLMRouter): Promise<Classification> {
  if (ai.running) {
    try {
      const r = await ai.classify(question)
      if ((QUESTION_TYPES as readonly string[]).includes(r.label)) return { ...r, source: 'ml-model' }
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await router.chat(classifyMessages(question), { purpose: 'classify', json: true, temperature: 0, maxTokens: 60, fast: true })
    const parsed = parseWith(LlmClass, res.text)
    return { label: parsed.label, confidence: parsed.confidence, source: 'llm' }
  } catch {
    return heuristicClassify(question)
  }
}
