import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AiServiceStatus,
  AnalyticsSummary,
  AskResult,
  CompareResult,
  Conversation,
  ConversationDetail,
  DocumentInfo,
  EvalBundle,
  ExecuteRequest,
  Message,
  ProviderId,
  ProviderStatus,
  SearchHit,
  Settings,
  StreamEvent,
  Template
} from '../shared/types'

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; aborted?: boolean }

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as Envelope<T>
  if (!res.ok) {
    const err = new Error(res.error) as Error & { aborted?: boolean }
    err.aborted = res.aborted
    throw err
  }
  return res.data
}

/** The only surface the React renderer can use to reach the main process. */
const api = {
  window: {
    minimize: () => invoke<void>('window:minimize'),
    maximize: () => invoke<boolean>('window:maximize'),
    close: () => invoke<void>('window:close')
  },
  settings: {
    get: () => invoke<Settings>('settings:get'),
    set: (s: Settings) => invoke<Settings>('settings:set', s)
  },
  providers: { status: () => invoke<ProviderStatus[]>('providers:status') },
  aiService: {
    status: () => invoke<AiServiceStatus>('ai:status'),
    restart: () => invoke<AiServiceStatus>('ai:restart')
  },
  conversations: {
    list: (search?: string) => invoke<Conversation[]>('conv:list', search),
    get: (id: string) => invoke<ConversationDetail | null>('conv:get', id),
    remove: (id: string) => invoke<void>('conv:delete', id),
    rename: (id: string, title: string) => invoke<void>('conv:rename', id, title),
    setHead: (id: string, messageId: string) => invoke<void>('conv:setHead', id, messageId),
    exportAs: (id: string, format: 'md' | 'pdf') => invoke<string | null>('conv:export', id, format)
  },
  chat: {
    ask: (input: { conversationId: string | null; question: string; parentId: string | null }) => invoke<AskResult>('chat:ask', input),
    execute: (req: ExecuteRequest) => invoke<Message>('chat:execute', req),
    abort: (requestId: string) => invoke<void>('chat:abort', requestId),
    refreshPaths: (messageId: string) => invoke<Message>('chat:refreshPaths', messageId),
    feedback: (messageId: string, kind: 'up' | 'down') => invoke<Message>('chat:feedback', messageId, kind),
    analyzeCsv: (input: { conversationId: string | null; fileName: string; text: string }) => invoke<AskResult>('data:analyzeCsv', input),
    transcribe: (audio: ArrayBuffer, mime: string) => invoke<string>('voice:transcribe', audio, mime)
  },
  docs: {
    list: () => invoke<DocumentInfo[]>('docs:list'),
    upload: (name: string, data: ArrayBuffer) => invoke<DocumentInfo>('docs:upload', name, data),
    remove: (id: string) => invoke<void>('docs:delete', id),
    search: (query: string) => invoke<SearchHit[]>('docs:search', query)
  },
  lab: { compare: (prompt: string, providers: ProviderId[]) => invoke<CompareResult[]>('lab:compare', prompt, providers) },
  analytics: { get: () => invoke<AnalyticsSummary>('analytics:get') },
  templates: {
    list: () => invoke<Template[]>('templates:list'),
    save: (t: Omit<Template, 'builtin' | 'id'> & { id?: string }) => invoke<Template>('templates:save', t),
    remove: (id: string) => invoke<void>('templates:delete', id)
  },
  evaluation: { results: () => invoke<EvalBundle>('eval:results') },
  on: {
    stream: (cb: (e: StreamEvent) => void) => {
      const listener = (_: IpcRendererEvent, e: StreamEvent) => cb(e)
      ipcRenderer.on('stream', listener)
      return () => ipcRenderer.removeListener('stream', listener)
    },
    conversationsChanged: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('conversations-changed', listener)
      return () => ipcRenderer.removeListener('conversations-changed', listener)
    }
  }
}

export type StratifyApi = typeof api

contextBridge.exposeInMainWorld('api', api)
