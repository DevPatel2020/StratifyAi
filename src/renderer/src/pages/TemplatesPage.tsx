import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { QUESTION_TYPES, type QuestionType, type Template } from '@shared/types'
import { Badge, Button, Card, Input, PageHeader, Textarea } from '@renderer/components/ui'
import { cn, prettyType } from '@renderer/lib/utils'

const EMPTY = { name: '', description: '', steps: ['', '', ''], questionTypes: [] as QuestionType[] }

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [draft, setDraft] = useState(EMPTY)
  const load = () => window.api.templates.list().then(setTemplates)
  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    if (!draft.name.trim() || draft.steps.some((s) => !s.trim()) || draft.questionTypes.length === 0) {
      toast.error('Give the framework a name, three steps and at least one question type')
      return
    }
    await window.api.templates.save({ ...draft, steps: draft.steps.map((s) => s.trim()) })
    setDraft(EMPTY)
    toast.success('Framework saved: it will be suggested for matching questions')
    void load()
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Thinking Frameworks"
        description="The path generator picks frameworks that match the classified question type and adapts their steps to your question."
      />
      <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                </div>
                {t.builtin ? (
                  <Badge variant="outline">built-in</Badge>
                ) : (
                  <Button size="icon" variant="ghost" aria-label="Delete framework" onClick={async () => (await window.api.templates.remove(t.id), load())}>
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs">
                {t.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.questionTypes.map((q) => (
                  <Badge key={q} variant="outline">
                    {prettyType(q)}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <Card className="h-fit p-4">
          <div className="mb-3 text-sm font-semibold">Create your own framework</div>
          <div className="space-y-2">
            <Input placeholder="Name (e.g. OKR Planning)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea rows={2} placeholder="Short description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            {draft.steps.map((s, i) => (
              <Input
                key={i}
                placeholder={`Step ${i + 1}`}
                value={s}
                onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            ))}
            <div className="text-xs text-muted-foreground">Use for question types:</div>
            <div className="flex flex-wrap gap-1">
              {QUESTION_TYPES.map((q) => {
                const on = draft.questionTypes.includes(q)
                return (
                  <button
                    key={q}
                    onClick={() =>
                      setDraft({ ...draft, questionTypes: on ? draft.questionTypes.filter((x) => x !== q) : [...draft.questionTypes, q] })
                    }
                    className={cn('rounded-full border px-2 py-0.5 text-[11px]', on ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground')}
                  >
                    {prettyType(q)}
                  </button>
                )
              })}
            </div>
            <Button className="w-full" onClick={save}>
              <Plus size={14} /> Save framework
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
