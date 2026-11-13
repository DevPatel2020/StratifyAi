import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  AiServiceStatus,
  Conversation,
  ConversationDetail,
  Message,
  ProviderStatus,
  Settings,
  ThinkingPath
} from '@shared/types'

interface Streaming {
  requestId: string
  parentId: string
  pathName: string
  steps: number[]
  text: string
  status: string
}

type Busy = 'idle' | 'asking' | 'executing' | 'analyzing' | 'refreshing'

interface AppState {
  settings: Settings | null
  providers: ProviderStatus[]
  aiStatus: AiServiceStatus | null
  conversations: Conversation[]
  activeId: string | null
  detail: ConversationDetail | null
  busy: Busy
  streaming: Streaming | null
  paletteOpen: boolean

  init: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshConversations: () => Promise<void>
  open: (id: string | null) => Promise<void>
  ask: (question: string) => Promise<void>
  execute: (parent: Message, path: ThinkingPath, selected: number[]) => Promise<void>
  stop: () => void
  setHead: (messageId: string) => Promise<void>
  refreshPaths: (messageId: string) => Promise<void>
  feedback: (messageId: string, kind: 'up' | 'down') => Promise<void>
  analyzeCsv: (file: File) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  removeConversation: (id: string) => Promise<void>
  setPaletteOpen: (open: boolean) => void
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function upsertMessage(detail: ConversationDetail, message: Message, headId?: string): ConversationDetail {
  const exists = detail.messages.some((m) => m.id === message.id)
  return {
    conversation: { ...detail.conversation, headId: headId ?? detail.conversation.headId },
    messages: exists ? detail.messages.map((m) => (m.id === message.id ? message : m)) : [...detail.messages, message]
  }
}

function applyTheme(theme: Settings['theme']) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useApp = create<AppState>((set, get) => ({
  settings: null,
  providers: [],
  aiStatus: null,
  conversations: [],
  activeId: null,
  detail: null,
  busy: 'idle',
  streaming: null,
  paletteOpen: false,

  init: async () => {
    const settings = await window.api.settings.get()
    applyTheme(settings.theme)
    set({ settings })
    await get().refreshConversations()
    window.api.on.stream((e) => {
      const s = get().streaming
      if (!s || s.requestId !== e.requestId) return
      if (e.type === 'token') set({ streaming: { ...s, text: s.text + e.data } })
      else if (e.type === 'replace') set({ streaming: { ...s, text: e.data } })
      else set({ streaming: { ...s, status: e.data } })
    })
    window.api.on.conversationsChanged(() => void get().refreshConversations())
    void get().refreshStatus()
    // the Python service takes a few seconds to boot; poll its status briefly
    let tries = 0
    const timer = setInterval(async () => {
      tries++
      const aiStatus = await window.api.aiService.status().catch(() => null)
      set({ aiStatus })
      if (tries > 20 || aiStatus?.state === 'running' || aiStatus?.state === 'not-installed') clearInterval(timer)
    }, 3000)
  },

  refreshStatus: async () => {
    const [providers, aiStatus] = await Promise.all([
      window.api.providers.status().catch(() => [] as ProviderStatus[]),
      window.api.aiService.status().catch(() => null)
    ])
    set({ providers, aiStatus })
  },

  refreshConversations: async () => {
    const conversations = await window.api.conversations.list()
    set({ conversations })
    const { activeId, detail } = get()
    if (activeId && detail) {
      const c = conversations.find((x) => x.id === activeId)
      if (c) set({ detail: { ...detail, conversation: { ...detail.conversation, title: c.title } } })
    }
  },

  open: async (id) => {
    if (!id) {
      set({ activeId: null, detail: null })
      return
    }
    const detail = await window.api.conversations.get(id)
    set({ activeId: id, detail })
  },

  ask: async (question) => {
    if (get().busy !== 'idle') return
    set({ busy: 'asking' })
    try {
      const { detail } = get()
      const res = await window.api.chat.ask({
        conversationId: detail?.conversation.id ?? null,
        question,
        parentId: detail?.conversation.headId ?? null
      })
      const base: ConversationDetail = detail && detail.conversation.id === res.conversation.id ? detail : { conversation: res.conversation, messages: [] }
      set({ activeId: res.conversation.id, detail: upsertMessage({ ...base, conversation: res.conversation }, res.message, res.message.id) })
      await get().refreshConversations()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      set({ busy: 'idle' })
    }
  },

  execute: async (parent, path, selected) => {
    const { detail, busy } = get()
    if (!detail || busy !== 'idle' || selected.length === 0) return
    const requestId = crypto.randomUUID()
    set({
      busy: 'executing',
      streaming: { requestId, parentId: parent.id, pathName: path.name, steps: [...selected].sort((a, b) => a - b), text: '', status: 'Starting…' }
    })
    try {
      const message = await window.api.chat.execute({
        requestId,
        conversationId: detail.conversation.id,
        parentId: parent.id,
        pathName: path.name,
        framework: path.framework,
        steps: path.steps,
        selected
      })
      const current = get().detail
      if (current) set({ detail: upsertMessage(current, message, message.id) })
    } catch (err: any) {
      if (err?.aborted || /Stopped/.test(errorText(err))) toast.info('Generation stopped')
      else toast.error(errorText(err))
    } finally {
      set({ busy: 'idle', streaming: null })
      void get().refreshConversations()
    }
  },

  stop: () => {
    const s = get().streaming
    if (s) void window.api.chat.abort(s.requestId)
  },

  setHead: async (messageId) => {
    const { detail } = get()
    if (!detail) return
    await window.api.conversations.setHead(detail.conversation.id, messageId)
    set({ detail: { ...detail, conversation: { ...detail.conversation, headId: messageId } } })
  },

  refreshPaths: async (messageId) => {
    if (get().busy !== 'idle') return
    set({ busy: 'refreshing' })
    try {
      const message = await window.api.chat.refreshPaths(messageId)
      const d = get().detail
      if (d) set({ detail: upsertMessage(d, message) })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      set({ busy: 'idle' })
    }
  },

  feedback: async (messageId, kind) => {
    const message = await window.api.chat.feedback(messageId, kind)
    const d = get().detail
    if (d && message) set({ detail: upsertMessage(d, message) })
  },

  analyzeCsv: async (file) => {
    if (get().busy !== 'idle') return
    if (file.size > 2_000_000) {
      toast.error('CSV is too large (max 2 MB)')
      return
    }
    set({ busy: 'analyzing' })
    try {
      const text = await file.text()
      const res = await window.api.chat.analyzeCsv({ conversationId: get().detail?.conversation.id ?? null, fileName: file.name, text })
      const d = get().detail
      const base = d && d.conversation.id === res.conversation.id ? d : { conversation: res.conversation, messages: [] }
      set({ activeId: res.conversation.id, detail: upsertMessage({ ...base, conversation: res.conversation }, res.message, res.message.id) })
      await get().refreshConversations()
      toast.success('Dataset analysed. Follow-up questions will use it as context.')
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      set({ busy: 'idle' })
    }
  },

  updateSettings: async (patch) => {
    const current = get().settings
    if (!current) return
    const next = { ...current, ...patch, models: { ...current.models, ...(patch.models ?? {}) } }
    applyTheme(next.theme)
    set({ settings: next })
    try {
      set({ settings: await window.api.settings.set(next) })
    } catch (err) {
      toast.error(errorText(err))
    }
  },

  removeConversation: async (id) => {
    await window.api.conversations.remove(id)
    if (get().activeId === id) set({ activeId: null, detail: null })
    await get().refreshConversations()
  },

  setPaletteOpen: (paletteOpen) => set({ paletteOpen })
}))
