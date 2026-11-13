import { useEffect } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useApp } from '@renderer/store/app'

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, conversations, open, settings, updateSettings, detail } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!useApp.getState().paletteOpen)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  if (!paletteOpen) return null
  const run = (fn: () => void) => {
    fn()
    setPaletteOpen(false)
  }
  const exportAs = async (format: 'md' | 'pdf') => {
    if (!detail) return toast.error('Open a conversation first')
    const file = await window.api.conversations.exportAs(detail.conversation.id, format).catch((e) => toast.error(e.message))
    if (file) toast.success(`Exported to ${file}`)
  }

  const item = 'flex cursor-pointer items-center rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground'
  const group = 'px-1 py-1 text-[11px] text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setPaletteOpen(false)}>
      <Command className="w-[560px] overflow-hidden rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()} label="Command palette">
        <Command.Input autoFocus placeholder="Type a command or search conversations…" className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none" />
        <Command.List className="max-h-[360px] overflow-y-auto p-1">
          <Command.Empty className="p-4 text-sm text-muted-foreground">No results.</Command.Empty>
          <Command.Group heading="Actions" className={group}>
            <Command.Item className={item} onSelect={() => run(() => (void open(null), navigate('/')))}>New chat</Command.Item>
            <Command.Item className={item} onSelect={() => run(() => updateSettings({ theme: settings?.theme === 'dark' ? 'light' : 'dark' }))}>
              Toggle dark / light theme
            </Command.Item>
            <Command.Item className={item} onSelect={() => run(() => void exportAs('md'))}>Export conversation as Markdown</Command.Item>
            <Command.Item className={item} onSelect={() => run(() => void exportAs('pdf'))}>Export conversation as PDF</Command.Item>
            <Command.Item className={item} onSelect={() => run(() => updateSettings({ useRag: !settings?.useRag }))}>
              {settings?.useRag ? 'Disable' : 'Enable'} document grounding (RAG)
            </Command.Item>
            <Command.Item className={item} onSelect={() => run(() => updateSettings({ useTools: !settings?.useTools }))}>
              {settings?.useTools ? 'Disable' : 'Enable'} agent tools
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Go to" className={group}>
            {[
              ['Thinking Tree', '/tree'],
              ['Documents', '/documents'],
              ['Frameworks', '/templates'],
              ['Model Lab', '/lab'],
              ['Analytics', '/analytics'],
              ['Evaluation', '/evaluation'],
              ['History', '/history'],
              ['Settings', '/settings']
            ].map(([label, to]) => (
              <Command.Item key={to} className={item} onSelect={() => run(() => navigate(to))}>
                {label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Conversations" className={group}>
            {conversations.slice(0, 30).map((c) => (
              <Command.Item key={c.id} value={`conv ${c.title} ${c.id}`} className={item} onSelect={() => run(() => (void open(c.id), navigate('/')))}>
                {c.title}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
