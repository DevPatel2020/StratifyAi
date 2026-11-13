import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import type { ProviderId, Settings } from '@shared/types'
import { Badge, Button, Card, Input, PageHeader, StatusDot, Switch } from '@renderer/components/ui'
import { PROVIDER_LABEL } from '@renderer/lib/utils'

const MODEL_FIELDS: { key: keyof Settings['models']; label: string; hint: string }[] = [
  { key: 'groq', label: 'Groq model', hint: 'e.g. openai/gpt-oss-120b (default), openai/gpt-oss-20b (faster), qwen/qwen3.8-27b' },
  { key: 'gemini', label: 'Gemini model', hint: 'e.g. gemini-2.5-flash-lite, gemini-2.5-flash' },
  { key: 'ollama', label: 'Ollama model', hint: 'Local main model, e.g. llama3.1' },
  { key: 'ollamaFast', label: 'Ollama fast model', hint: 'Used for titles, summaries and classification, e.g. llama3.2' }
]

export function SettingsPage() {
  const { settings, providers, aiStatus, updateSettings, refreshStatus } = useApp()
  if (!settings) return null

  const move = (id: ProviderId, dir: -1 | 1) => {
    const order = [...settings.providerOrder]
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    void updateSettings({ providerOrder: order })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Settings"
        description="API keys live only in your local .env file. They are never shown, stored in the database or sent anywhere except the provider."
        actions={
          <Button size="sm" variant="outline" onClick={refreshStatus}>
            <RefreshCw size={13} /> Re-check providers
          </Button>
        }
      />
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <section>
          <h2 className="mb-1 text-sm font-semibold">Provider fallback order</h2>
          <p className="mb-3 text-xs text-muted-foreground">Each request tries the first available provider and falls back to the next on errors or rate limits.</p>
          <div className="space-y-2">
            {settings.providerOrder.map((id, i) => {
              const s = providers.find((p) => p.id === id)
              return (
                <Card key={id} className="flex items-center gap-3 p-3">
                  <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <StatusDot ok={!!s?.available} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{PROVIDER_LABEL[id]}</div>
                    <div className="truncate text-xs text-muted-foreground">{s?.detail ?? 'checking…'}</div>
                  </div>
                  {!s?.configured && id !== 'ollama' && <Badge variant="warning">add key to .env</Badge>}
                  <Button size="icon" variant="ghost" aria-label="Move up" onClick={() => move(id, -1)} disabled={i === 0}>
                    <ArrowUp size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" onClick={() => move(id, 1)} disabled={i === settings.providerOrder.length - 1}>
                    <ArrowDown size={14} />
                  </Button>
                </Card>
              )
            })}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          {MODEL_FIELDS.map((f) => (
            <label key={f.key} className="space-y-1">
              <div className="text-sm font-medium">{f.label}</div>
              <Input
                defaultValue={settings.models[f.key]}
                onBlur={(e) => e.target.value.trim() && updateSettings({ models: { ...settings.models, [f.key]: e.target.value.trim() } })}
              />
              <div className="text-[11px] text-muted-foreground">{f.hint}</div>
            </label>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Reasoning pipeline</h2>
          <label className="flex items-center gap-3 text-sm">
            Temperature <span className="w-8 tabular-nums text-muted-foreground">{settings.temperature.toFixed(1)}</span>
            <input
              type="range"
              min={0}
              max={1.2}
              step={0.1}
              value={settings.temperature}
              onChange={(e) => updateSettings({ temperature: Number(e.target.value) })}
              className="w-56 accent-[hsl(var(--primary))]"
            />
          </label>
          {(
            [
              ['useMemory', 'Conversation memory', 'Send recent messages on the active branch plus a rolling summary'],
              ['useRag', 'Document grounding (RAG)', 'Retrieve relevant chunks from uploaded documents and cite them'],
              ['useTools', 'Agent tools', 'Allow web search, calculator and document search through function calling'],
              ['useCritique', 'Self-critique', 'A reviewer pass scores each answer and refines it when the score is below 7']
            ] as const
          ).map(([key, label, hint]) => (
            <div key={key} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm">{label}</div>
                <div className="text-xs text-muted-foreground">{hint}</div>
              </div>
              <Switch checked={settings[key]} onChange={(v) => updateSettings({ [key]: v } as Partial<Settings>)} label={label} />
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="text-sm">Dark theme</div>
            <Switch checked={settings.theme === 'dark'} onChange={(v) => updateSettings({ theme: v ? 'dark' : 'light' })} label="Dark theme" />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Python AI service</h2>
          <Card className="flex items-center gap-3 p-3">
            <StatusDot ok={aiStatus?.state === 'running'} pending={aiStatus?.state === 'starting'} />
            <div className="min-w-0 flex-1 text-sm">
              <div>
                {aiStatus?.state ?? 'unknown'}
                {aiStatus?.state === 'running' && (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    · classifier {aiStatus.classifierLoaded ? 'loaded' : 'not trained'} · {aiStatus.documents ?? 0} documents · embeddings {aiStatus.embeddings}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">{aiStatus?.detail}</div>
            </div>
            <Button size="sm" variant="outline" onClick={async () => (await window.api.aiService.restart(), refreshStatus())}>
              Restart
            </Button>
          </Card>
        </section>
      </div>
    </div>
  )
}
