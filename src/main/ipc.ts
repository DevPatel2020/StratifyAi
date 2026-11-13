import { BrowserWindow, ipcMain } from 'electron'
import type { ExecuteRequest, ProviderId, Settings } from '@shared/types'
import { PROVIDERS } from '@shared/types'
import type { AiServiceClient } from './aiService'
import type { Repository } from './db/repository'
import type { StratifyEngine } from './engine'
import { exportConversation } from './export'
import type { LLMRouter } from './llm/router'
import { transcribe } from './llm/whisper'

interface Deps {
  win: () => BrowserWindow | null
  repo: Repository
  engine: StratifyEngine
  router: LLMRouter
  ai: AiServiceClient
}

/** Wraps handlers so the renderer always receives { ok, data } or { ok: false, error }. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (_e, ...args: unknown[]) => {
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (err: any) {
      const aborted = err?.name === 'AbortError' || err?.name === 'APIUserAbortError'
      return { ok: false, error: aborted ? 'Stopped' : (err?.message ?? String(err)), aborted }
    }
  })
}

const MAX_UPLOAD = 25 * 1024 * 1024

export function registerIpc({ win, repo, engine, router, ai }: Deps): void {
  // window controls
  handle('window:minimize', () => win()?.minimize())
  handle('window:maximize', () => {
    const w = win()
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })
  handle('window:close', () => win()?.close())

  // settings + status
  handle('settings:get', () => repo.getSettings())
  handle('settings:set', (s: Settings) => {
    const order = s.providerOrder.filter((p): p is ProviderId => PROVIDERS.includes(p))
    return repo.saveSettings({ ...s, providerOrder: order.length ? order : [...PROVIDERS] })
  })
  handle('providers:status', () => router.status())
  handle('ai:status', () => ai.status())
  handle('ai:restart', () => ai.restart())

  // conversations
  handle('conv:list', (search?: string) => repo.listConversations(search ?? ''))
  handle('conv:get', (id: string) => repo.getDetail(id) ?? null)
  handle('conv:delete', (id: string) => repo.deleteConversation(id))
  handle('conv:rename', (id: string, title: string) => repo.updateConversation(id, { title: title.slice(0, 80) }))
  handle('conv:setHead', (id: string, messageId: string) => repo.updateConversation(id, { headId: messageId }))
  handle('conv:export', (id: string, format: 'md' | 'pdf') => {
    const w = win()
    if (!w) throw new Error('No window')
    return exportConversation(w, repo, id, format)
  })

  // reasoning pipeline
  handle('chat:ask', (input: { conversationId: string | null; question: string; parentId: string | null }) => engine.ask(input))
  handle('chat:execute', (req: ExecuteRequest) => engine.execute(req))
  handle('chat:abort', (requestId: string) => engine.abort(requestId))
  handle('chat:refreshPaths', (messageId: string) => engine.refreshPaths(messageId))
  handle('chat:feedback', (messageId: string, kind: 'up' | 'down') => engine.feedback(messageId, kind))
  handle('data:analyzeCsv', (input: { conversationId: string | null; fileName: string; text: string }) => {
    if (input.text.length > 2_000_000) throw new Error('CSV is too large (max 2 MB)')
    return engine.analyzeCsv(input)
  })
  handle('voice:transcribe', (audio: ArrayBuffer, mime: string) => transcribe(audio, mime))

  // documents (RAG) via Python AI service
  handle('docs:list', async () => (ai.running ? (await ai.listDocuments()).documents : []))
  handle('docs:upload', (name: string, data: ArrayBuffer) => {
    if (!ai.running) throw new Error('The Python AI service is not running. Run "npm run ai:setup" first.')
    if (data.byteLength > MAX_UPLOAD) throw new Error('File too large (max 25 MB)')
    return ai.uploadDocument(name, data)
  })
  handle('docs:delete', (id: string) => ai.deleteDocument(id))
  handle('docs:search', async (query: string) => (await ai.search(query, 5)).results)

  // lab, analytics, templates, evaluation
  handle('lab:compare', (prompt: string, providers: ProviderId[]) => engine.compare(prompt, providers))
  handle('analytics:get', () => repo.analytics())
  handle('templates:list', () => repo.listTemplates())
  handle('templates:save', (t: any) => repo.saveTemplate(t))
  handle('templates:delete', (id: string) => repo.deleteTemplate(id))
  handle('eval:results', async () => (ai.running ? ai.evalResults() : { classifier: null, eval: null }))
}
