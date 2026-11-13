import type { ThinkingPath } from '@shared/types'

const tokenize = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )

/** Jaccard overlap: a cheap lexical relevance signal used when the embedding service is offline. */
export function lexicalSimilarity(a: string, b: string): number {
  const A = tokenize(a)
  const B = tokenize(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

export const pathText = (p: ThinkingPath): string => `${p.name}. ${p.framework}. ${p.rationale}. ${p.steps.join('. ')}`

/**
 * Hybrid path ranker.
 *   score = 0.7 * semantic relevance (embedding cosine, normalised) + 0.3 * learned framework prior
 * The prior comes from what users clicked / liked for this question type (Laplace smoothed).
 */
export function rankPaths(
  paths: ThinkingPath[],
  relevance: number[],
  priors: Record<string, number>
): ThinkingPath[] {
  if (paths.length === 0) return paths
  const min = Math.min(...relevance)
  const max = Math.max(...relevance)
  const norm = relevance.map((r) => (max - min < 1e-9 ? 0.5 : (r - min) / (max - min)))
  const priorValues = Object.values(priors)
  const defaultPrior = priorValues.length ? Math.min(...priorValues) / 2 : 0.25
  const pmax = Math.max(defaultPrior, ...priorValues)
  const scored = paths.map((p, i) => {
    const prior = (priors[p.framework] ?? defaultPrior) / pmax
    const score = 0.7 * norm[i] + 0.3 * prior
    return { ...p, score: Math.round(score * 100) / 100, recommended: false }
  })
  let best = 0
  scored.forEach((p, i) => {
    if ((p.score ?? 0) > (scored[best].score ?? 0)) best = i
  })
  scored[best].recommended = true
  return scored
}
