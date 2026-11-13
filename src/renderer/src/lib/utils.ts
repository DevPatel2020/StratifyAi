import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Message } from '@shared/types'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export const formatNumber = (n: number): string => new Intl.NumberFormat().format(Math.round(n))

export const formatMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`)

export const timeAgo = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

export const prettyType = (t: string): string => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Messages from the root down to `headId` (the active branch of the thinking tree). */
export function activeChain(messages: Message[], headId: string | null): Message[] {
  const byId = new Map(messages.map((m) => [m.id, m]))
  const chain: Message[] = []
  let cursor = headId
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const m = byId.get(cursor)
    if (!m) break
    chain.unshift(m)
    cursor = m.parentId
  }
  return chain
}

export const PROVIDER_LABEL: Record<string, string> = { groq: 'Groq', gemini: 'Gemini', ollama: 'Ollama (local)' }
