import type { ChatMessage, ProviderId } from '@shared/types'

export interface LLMUsage {
  promptTokens: number
  completionTokens: number
  estimated: boolean
}

export interface LLMResult {
  text: string
  usage: LLMUsage
  provider: ProviderId
  model: string
  latencyMs: number
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ToolTurnResult extends LLMResult {
  toolCalls: ToolCall[]
}

/** Message format for tool-calling rounds (OpenAI-compatible). */
export type AgentMessage =
  | ChatMessage
  | { role: 'assistant'; content: string | null; tool_calls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface CallOptions {
  temperature?: number
  maxTokens?: number
  json?: boolean
  signal?: AbortSignal
  /** use a smaller/faster model where the provider has one (Ollama llama3.2) */
  fast?: boolean
}

export interface LLMProvider {
  readonly id: ProviderId
  isConfigured(): boolean
  modelName(fast?: boolean): string
  chat(messages: ChatMessage[], opts?: CallOptions): Promise<LLMResult>
  stream(messages: ChatMessage[], onToken: (t: string) => void, opts?: CallOptions): Promise<LLMResult>
  chatWithTools(messages: AgentMessage[], tools: ToolDefinition[], opts?: CallOptions): Promise<ToolTurnResult>
  ping(): Promise<{ ok: boolean; detail: string }>
}

/** Rough token estimate (~4 chars/token) for providers that do not report usage while streaming. */
export const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4))
