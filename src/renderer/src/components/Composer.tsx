import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Mic, Paperclip, Send, Square } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import type { Settings } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { Button, Spinner } from './ui'

const TOGGLES: { key: keyof Pick<Settings, 'useMemory' | 'useRag' | 'useTools' | 'useCritique'>; label: string; hint: string }[] = [
  { key: 'useMemory', label: 'Memory', hint: 'Send conversation history + rolling summary' },
  { key: 'useRag', label: 'Documents', hint: 'Ground answers in your uploaded documents (RAG) with citations' },
  { key: 'useTools', label: 'Agent tools', hint: 'Let the model use web search, calculator and document search' },
  { key: 'useCritique', label: 'Self-critique', hint: 'A second pass reviews and refines weak answers' }
]

export function Composer() {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { busy, ask, stop, analyzeCsv, settings, updateSettings } = useApp()

  const submit = () => {
    const q = text.trim()
    if (!q || busy !== 'idle') return
    setText('')
    void ask(q)
  }

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        setTranscribing(true)
        try {
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const transcript = await window.api.chat.transcribe(await blob.arrayBuffer(), 'audio/webm')
          setText((t) => (t ? `${t} ${transcript}` : transcript))
        } catch (err: any) {
          toast.error(err?.message ?? 'Transcription failed')
        } finally {
          setTranscribing(false)
        }
      }
      rec.start()
      recorder.current = rec
      setRecording(true)
    } catch {
      toast.error('Microphone access was denied')
    }
  }

  return (
    <div className="border-t bg-card/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {settings &&
          TOGGLES.map((t) => (
            <button
              key={t.key}
              title={t.hint}
              onClick={() => updateSettings({ [t.key]: !settings[t.key] } as Partial<Settings>)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                settings[t.key] ? 'border-primary/50 bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {t.label}
            </button>
          ))}
        {busy !== 'idle' && busy !== 'executing' && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Spinner className="h-3 w-3" /> {busy}…
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void analyzeCsv(f)
            e.target.value = ''
          }}
        />
        <Button size="icon" variant="ghost" title="Analyse a CSV dataset" onClick={() => fileInput.current?.click()} disabled={busy !== 'idle'}>
          <Paperclip size={16} />
        </Button>
        <Button
          size="icon"
          variant={recording ? 'destructive' : 'ghost'}
          title={recording ? 'Stop recording' : 'Voice input (Groq Whisper)'}
          onClick={toggleRecording}
          disabled={transcribing}
        >
          {transcribing ? <Spinner className="h-3.5 w-3.5" /> : <Mic size={16} />}
        </Button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          placeholder="Ask anything… (Enter to send, Shift+Enter for a new line)"
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {busy === 'executing' ? (
          <Button variant="destructive" onClick={stop}>
            <Square size={14} /> Stop
          </Button>
        ) : (
          <Button onClick={submit} disabled={!text.trim() || busy !== 'idle'}>
            <Send size={14} /> Send
          </Button>
        )}
      </div>
    </div>
  )
}
