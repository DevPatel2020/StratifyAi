// Types shared by the Electron main process, preload bridge and React renderer.

export type ProviderId = 'groq' | 'gemini' | 'ollama'
export const PROVIDERS: ProviderId[] = ['groq', 'gemini', 'ollama']

export type ChatRole = 'system' | 'user' | 'assistant'
export interface ChatMessage {
  role: ChatRole
  content: string
}

export const QUESTION_TYPES = [
  'coding',
  'data_analysis',
  'business_strategy',
  'learning',
  'decision_making',
  'creative',
  'research',
  'personal_planning'
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export interface Classification {
  label: QuestionType
  confidence: number
  source: 'ml-model' | 'llm' | 'heuristic'
}

export interface ThinkingPath {
  id: string
  name: string
  framework: string
  rationale: string
  steps: string[]
  score?: number
  recommended?: boolean
}

export interface Citation {
  index: number
  source: string
  page?: number | null
  text: string
  score: number
}

export interface ToolCallRecord {
  tool: string
  input: string
  output: string
}

export interface MessageMeta {
  kind?: 'question' | 'answer' | 'csv' | 'info'
  pathName?: string
  framework?: string
  steps?: number[]
  stepTitles?: string[]
  provider?: ProviderId
  model?: string
  promptTokens?: number
  completionTokens?: number
  tokensEstimated?: boolean
  latencyMs?: number
  citations?: Citation[]
  toolCalls?: ToolCallRecord[]
  critique?: { score: number; issues: string[]; refined: boolean }
  classification?: Classification
  paths?: ThinkingPath[]
  feedback?: 'up' | 'down'
}

export interface Message {
  id: string
  conversationId: string
  parentId: string | null
  role: 'user' | 'assistant'
  content: string
  meta: MessageMeta
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  summary: string
  headId: string | null
  dataContext: string
}

export interface ConversationDetail {
  conversation: Conversation
  messages: Message[]
}

export interface Template {
  id: string
  name: string
  description: string
  steps: string[]
  questionTypes: QuestionType[]
  builtin: boolean
}

export interface Settings {
  providerOrder: ProviderId[]
  models: { groq: string; gemini: string; ollama: string; ollamaFast: string }
  temperature: number
  useMemory: boolean
  useRag: boolean
  useTools: boolean
  useCritique: boolean
  theme: 'dark' | 'light'
}

export interface ProviderStatus {
  id: ProviderId
  configured: boolean
  available: boolean
  model: string
  detail: string
}

export interface AiServiceStatus {
  state: 'not-installed' | 'starting' | 'running' | 'stopped' | 'error'
  detail: string
  classifierLoaded?: boolean
  documents?: number
  embeddings?: string
}

export interface UsageRecord {
  id: number
  ts: number
  provider: ProviderId
  model: string
  purpose: string
  promptTokens: number
  completionTokens: number
  estimated: boolean
  latencyMs: number
  ok: boolean
  error: string
}

export interface AnalyticsSummary {
  totals: { calls: number; failures: number; promptTokens: number; completionTokens: number; avgLatencyMs: number }
  byProvider: { provider: ProviderId; calls: number; tokens: number; avgLatencyMs: number; failures: number }[]
  byPurpose: { purpose: string; calls: number; tokens: number }[]
  byDay: { day: string; tokens: number; calls: number }[]
  frameworkClicks: { framework: string; clicks: number }[]
  stepUsage: { stepsExecuted: number; stepsAvailable: number }
  feedback: { up: number; down: number }
}

export interface DocumentInfo {
  id: string
  name: string
  chunks: number
  pages: number
  addedAt: number
}

export interface SearchHit {
  docId: string
  source: string
  page: number | null
  text: string
  score: number
}

export interface CompareResult {
  provider: ProviderId
  model: string
  ok: boolean
  text: string
  error?: string
  latencyMs: number
  tokens: number
  scores?: { relevance: number; depth: number; clarity: number; overall: number; comment: string }
}

export interface AskResult {
  conversation: Conversation
  message: Message
}

export interface ExecuteRequest {
  requestId: string
  conversationId: string
  parentId: string
  pathName: string
  framework: string
  steps: string[]
  selected: number[]
}

export interface StreamEvent {
  requestId: string
  type: 'token' | 'status' | 'replace'
  data: string
}

export interface EvalBundle {
  classifier: any | null
  eval: any | null
}
