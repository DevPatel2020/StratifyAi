import type { ChatMessage, ToolCallRecord } from '@shared/types'
import type { AiServiceClient } from '../aiService'
import type { LLMRouter } from '../llm/router'
import type { AgentMessage, ToolDefinition } from '../llm/types'
import { AGENT_SYSTEM } from '../prompts'

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for current or factual information. Returns titles, URLs and snippets.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'search query' } }, required: ['query'] }
  },
  {
    name: 'calculator',
    description: 'Evaluate a math expression exactly, e.g. "(1200*0.18)/12" or "sqrt(2)*log(10)".',
    parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] }
  },
  {
    name: 'search_documents',
    description: "Semantic search over the user's uploaded documents. Returns relevant excerpts with sources.",
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  }
]

export async function runTool(ai: AiServiceClient, name: string, rawArgs: string): Promise<string> {
  let args: Record<string, string> = {}
  try {
    args = JSON.parse(rawArgs || '{}')
  } catch {
    return 'Error: arguments were not valid JSON'
  }
  if (!ai.running) return 'Error: the local AI service (tools) is not running'
  try {
    switch (name) {
      case 'web_search': {
        const r = await ai.webSearch(String(args.query ?? ''))
        return r.results.map((x, i) => `[${i + 1}] ${x.title} (${x.url})\n${x.snippet}`).join('\n') || 'No results'
      }
      case 'calculator':
        return (await ai.calculate(String(args.expression ?? ''))).result
      case 'search_documents': {
        const r = await ai.search(String(args.query ?? ''), 4)
        return r.results.map((x) => `(${x.source}${x.page ? ` p.${x.page}` : ''}) ${x.text.slice(0, 600)}`).join('\n---\n') || 'No matches'
      }
      default:
        return `Error: unknown tool ${name}`
    }
  } catch (err: any) {
    return `Error: ${err?.message ?? err}`
  }
}

/**
 * ReAct-style tool loop: the model may call tools for up to `maxRounds` rounds to gather facts.
 * The collected notes are then handed to the normal (streamed) step execution prompt.
 */
export async function gatherWithTools(
  router: LLMRouter,
  ai: AiServiceClient,
  task: string,
  opts: { signal?: AbortSignal; maxRounds?: number; onStatus?: (s: string) => void }
): Promise<{ notes: string; calls: ToolCallRecord[] }> {
  const messages: AgentMessage[] = [
    { role: 'system', content: AGENT_SYSTEM },
    { role: 'user', content: task } as ChatMessage
  ]
  const calls: ToolCallRecord[] = []
  for (let round = 0; round < (opts.maxRounds ?? 3); round++) {
    const res = await router.chatWithTools(messages, AGENT_TOOLS, { purpose: 'agent', temperature: 0.2, maxTokens: 700, signal: opts.signal })
    if (!res.toolCalls.length) break
    messages.push({
      role: 'assistant',
      content: res.text || null,
      tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } }))
    })
    for (const c of res.toolCalls) {
      opts.onStatus?.(`Using tool: ${c.name}`)
      const output = await runTool(ai, c.name, c.arguments)
      calls.push({ tool: c.name, input: c.arguments, output: output.slice(0, 1500) })
      messages.push({ role: 'tool', tool_call_id: c.id, content: output.slice(0, 4000) })
    }
  }
  const notes = calls.map((c, i) => `(${i + 1}) ${c.tool}(${c.input}) →\n${c.output}`).join('\n\n')
  return { notes, calls }
}
