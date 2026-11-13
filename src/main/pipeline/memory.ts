import type { ChatMessage, Message } from '@shared/types'

export const RECENT_WINDOW = 6

/** Compact representation of an assistant/user message for the model context. */
export function messageForContext(m: Message): ChatMessage {
  if (m.role === 'user') return { role: 'user', content: m.content }
  const label = m.meta.pathName ? `[Answer via "${m.meta.pathName}", steps ${m.meta.steps?.join(', ')}]\n` : ''
  return { role: 'assistant', content: `${label}${m.content}`.slice(0, 3500) }
}

/**
 * Builds the conversation memory for a request:
 *  - long-term: rolling summary of older turns (+ uploaded CSV context)
 *  - short-term: the last RECENT_WINDOW messages on the current branch of the thinking tree
 */
export function buildMemory(opts: { chain: Message[]; summary: string; dataContext: string; enabled: boolean }): ChatMessage[] {
  const out: ChatMessage[] = []
  const context: string[] = []
  if (opts.enabled && opts.summary) context.push(`Summary of the earlier conversation:\n${opts.summary}`)
  if (opts.dataContext) context.push(`Dataset the user uploaded earlier:\n${opts.dataContext}`)
  if (context.length) out.push({ role: 'system', content: context.join('\n\n') })
  if (!opts.enabled) return out
  const relevant = opts.chain.filter((m) => m.meta.kind !== 'info')
  for (const m of relevant.slice(-RECENT_WINDOW)) out.push(messageForContext(m))
  return out
}

/** Messages that have fallen out of the recent window and should be folded into the summary. */
export function needsSummary(chain: Message[]): Message[] {
  return chain.length > RECENT_WINDOW + 2 ? chain.slice(0, chain.length - RECENT_WINDOW) : []
}

export function transcript(messages: Message[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 1200)}`).join('\n\n')
}
