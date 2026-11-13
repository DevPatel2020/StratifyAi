import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import { marked } from 'marked'
import type { Repository } from './db/repository'

export function conversationMarkdown(repo: Repository, conversationId: string): { title: string; markdown: string } {
  const detail = repo.getDetail(conversationId)
  if (!detail) throw new Error('Conversation not found')
  const chain = repo.ancestry(detail.conversation.headId)
  const parts = [`# ${detail.conversation.title}`, `_Exported from StratifyAI on ${new Date().toLocaleString()}_`]
  if (detail.conversation.summary) parts.push(`> **Memory summary:** ${detail.conversation.summary}`)
  for (const m of chain) {
    if (m.role === 'user') parts.push(`## 🧑 ${m.content}`)
    else {
      const head = m.meta.pathName ? `**Approach:** ${m.meta.pathName} · steps ${m.meta.steps?.join(', ')} · ${m.meta.provider}/${m.meta.model}` : ''
      const cites = m.meta.citations?.length
        ? `\n\n**Sources:**\n${m.meta.citations.map((c) => `- [${c.index}] ${c.source}${c.page ? `, p.${c.page}` : ''}`).join('\n')}`
        : ''
      parts.push(`${head}\n\n${m.content}${cites}`)
    }
  }
  return { title: detail.conversation.title, markdown: parts.join('\n\n---\n\n') }
}

const safeName = (s: string) => s.replace(/[^a-z0-9\-_ ]/gi, '').trim().slice(0, 60) || 'conversation'

export async function exportConversation(
  win: BrowserWindow,
  repo: Repository,
  conversationId: string,
  format: 'md' | 'pdf'
): Promise<string | null> {
  const { title, markdown } = conversationMarkdown(repo, conversationId)
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: `${safeName(title)}.${format}`,
    filters: [format === 'md' ? { name: 'Markdown', extensions: ['md'] } : { name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return null
  if (format === 'md') {
    fs.writeFileSync(filePath, markdown, 'utf8')
    return filePath
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:32px auto;color:#111;line-height:1.55}
    h1{color:#4f46e5} h2{background:#eef2ff;padding:8px 12px;border-radius:8px;font-size:16px}
    pre{background:#f4f4f5;padding:12px;border-radius:8px;white-space:pre-wrap} code{font-family:Consolas,monospace}
    table{border-collapse:collapse} td,th{border:1px solid #ddd;padding:4px 8px} hr{border:0;border-top:1px solid #e4e4e7}
    blockquote{border-left:3px solid #6366f1;margin:0;padding-left:12px;color:#444}
  </style></head><body>${await marked.parse(markdown)}</body></html>`
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    fs.writeFileSync(filePath, pdf)
  } finally {
    pdfWin.destroy()
  }
  return filePath
}
