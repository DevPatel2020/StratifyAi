import type {
  AskResult,
  ChatMessage,
  Citation,
  CompareResult,
  ExecuteRequest,
  Message,
  ProviderId,
  StreamEvent,
  ThinkingPath
} from '@shared/types'
import type { AiServiceClient } from './aiService'
import type { Repository } from './db/repository'
import type { LLMRouter } from './llm/router'
import { gatherWithTools } from './pipeline/agent'
import { classifyQuestion } from './pipeline/classify'
import { csvStats, statsToText } from './pipeline/csv'
import { candidateFrameworks } from './pipeline/frameworks'
import { parseWith } from './pipeline/json'
import { buildMemory, needsSummary, transcript } from './pipeline/memory'
import { generatePaths } from './pipeline/paths'
import { lexicalSimilarity, pathText, rankPaths } from './pipeline/rank'
import {
  SYSTEM_PROMPT,
  critiqueMessages,
  csvMessages,
  executeUserPrompt,
  judgeMessages,
  refineMessages,
  summaryMessages,
  titleMessages
} from './prompts'
import { z } from 'zod'

type Notify = (channel: 'stream' | 'conversations-changed', payload?: StreamEvent | string) => void

const CritiqueSchema = z.object({ score: z.coerce.number().min(1).max(10), issues: z.array(z.string()).default([]) })
const JudgeSchema = z.object({
  scores: z.array(
    z.object({
      label: z.string(),
      relevance: z.coerce.number(),
      depth: z.coerce.number(),
      clarity: z.coerce.number(),
      overall: z.coerce.number(),
      comment: z.string().default('')
    })
  )
})

/** Orchestrates the StratifyAI reasoning pipeline. */
export class StratifyEngine {
  private controllers = new Map<string, AbortController>()

  constructor(
    private readonly repo: Repository,
    private readonly router: LLMRouter,
    private readonly ai: AiServiceClient,
    private readonly notify: Notify
  ) {}

  // ------------------------------------------------------------------ ask
  async ask(input: { conversationId: string | null; question: string; parentId: string | null }): Promise<AskResult> {
    const question = input.question.trim()
    if (!question) throw new Error('Question is empty')
    let conversation = input.conversationId ? this.repo.getConversation(input.conversationId) : undefined
    const isNew = !conversation
    if (!conversation) conversation = this.repo.createConversation(question.slice(0, 48))
    const parentId = input.parentId ?? conversation.headId
    const chain = this.repo.ancestry(parentId)

    const classification = await classifyQuestion(question, this.ai, this.router)
    const frameworks = candidateFrameworks(classification.label, this.repo.listTemplates())
    const context = this.repo.getSettings().useMemory ? this.contextText(conversation.summary, chain) : ''
    const { paths } = await generatePaths(this.router, { question, type: classification.label, frameworks, context })
    const ranked = await this.rank(question, paths, classification.label)

    const message = this.repo.addMessage({
      conversationId: conversation.id,
      parentId,
      role: 'user',
      content: question,
      meta: { kind: 'question', classification, paths: ranked }
    })
    if (isNew) void this.autoTitle(conversation.id, question)
    return { conversation: this.repo.getConversation(conversation.id)!, message }
  }

  private contextText(summary: string, chain: Message[]): string {
    const recent = chain.slice(-4).map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    return [summary && `Summary: ${summary}`, ...recent].filter(Boolean).join('\n')
  }

  private async rank(question: string, paths: ThinkingPath[], type: string): Promise<ThinkingPath[]> {
    let relevance: number[] | null = null
    if (this.ai.running) {
      try {
        relevance = (await this.ai.similarity(question, paths.map(pathText))).scores
      } catch {
        relevance = null
      }
    }
    if (!relevance) relevance = paths.map((p) => lexicalSimilarity(question, pathText(p)))
    return rankPaths(paths, relevance, this.repo.frameworkPriors(type))
  }

  private async autoTitle(conversationId: string, question: string): Promise<void> {
    try {
      const res = await this.router.chat(titleMessages(question), { purpose: 'title', temperature: 0.3, maxTokens: 20, fast: true })
      const title = res.text.replace(/["'*#\n]/g, '').trim().slice(0, 60)
      if (title) {
        this.repo.updateConversation(conversationId, { title })
        this.notify('conversations-changed', conversationId)
      }
    } catch {
      /* keep the placeholder title */
    }
  }

  // ------------------------------------------------------------------ execute
  abort(requestId: string): void {
    this.controllers.get(requestId)?.abort()
  }

  async execute(req: ExecuteRequest): Promise<Message> {
    const settings = this.repo.getSettings()
    const conversation = this.repo.getConversation(req.conversationId)
    if (!conversation) throw new Error('Conversation not found')
    const parent = this.repo.getMessage(req.parentId)
    if (!parent) throw new Error('Parent message not found')
    const chain = this.repo.ancestry(parent.id)
    const question = [...chain].reverse().find((m) => m.role === 'user')?.content ?? ''
    const selected = [...new Set(req.selected)].sort((a, b) => a - b)
    const classification = [...chain].reverse().find((m) => m.meta.classification)?.meta.classification
    const status = (data: string) => this.notify('stream', { requestId: req.requestId, type: 'status', data })

    const controller = new AbortController()
    this.controllers.set(req.requestId, controller)
    try {
      // 1. Retrieval-augmented context from the user's documents
      let citations: Citation[] = []
      let sources = ''
      if (settings.useRag && this.ai.running) {
        status('Searching your documents…')
        try {
          const q = `${question}\n${selected.map((n) => req.steps[n - 1]).join('\n')}`
          const hits = (await this.ai.search(q, 4)).results.filter((h) => h.score > 0.2)
          citations = hits.map((h, i) => ({ index: i + 1, source: h.source, page: h.page, text: h.text.slice(0, 500), score: h.score }))
          sources = hits.map((h, i) => `[${i + 1}] (${h.source}${h.page ? `, p.${h.page}` : ''})\n${h.text.slice(0, 1200)}`).join('\n\n')
        } catch {
          /* RAG optional */
        }
      }

      // 2. Optional agent tool use
      let toolNotes = ''
      let toolCalls: Message['meta']['toolCalls'] = []
      if (settings.useTools) {
        status('Agent is deciding whether to use tools…')
        try {
          const task = `Question: ${question}\nSteps to execute next: ${selected.map((n) => req.steps[n - 1]).join('; ')}\nGather any facts or calculations needed.`
          const g = await gatherWithTools(this.router, this.ai, task, { signal: controller.signal, onStatus: status })
          toolNotes = g.notes
          toolCalls = g.calls
        } catch (err: any) {
          if (controller.signal.aborted) throw err
        }
      }

      // 3. Stream the step execution with conversation memory
      status('Thinking…')
      const memory = buildMemory({
        chain,
        summary: conversation.summary,
        dataContext: conversation.dataContext,
        enabled: settings.useMemory
      })
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...memory,
        {
          role: 'user',
          content: executeUserPrompt({
            question,
            pathName: req.pathName,
            framework: req.framework,
            steps: req.steps,
            selected,
            sources,
            toolNotes
          })
        }
      ]
      const result = await this.router.stream(
        messages,
        (token) => this.notify('stream', { requestId: req.requestId, type: 'token', data: token }),
        { purpose: 'execute', maxTokens: 2048, signal: controller.signal }
      )
      let answer = result.text
      let critique: Message['meta']['critique']

      // 4. Optional self-critique and refinement
      if (settings.useCritique && answer.trim()) {
        status('Self-critique: reviewing the answer…')
        try {
          const stepsText = selected.map((n) => `Step ${n}: ${req.steps[n - 1]}`).join('\n')
          const c = await this.router.chat(critiqueMessages(question, stepsText, answer), {
            purpose: 'critique',
            json: true,
            temperature: 0,
            maxTokens: 300,
            signal: controller.signal
          })
          const parsed = parseWith(CritiqueSchema, c.text)
          critique = { score: parsed.score, issues: parsed.issues.slice(0, 5), refined: false }
          if (parsed.score < 7 && parsed.issues.length) {
            status('Refining the answer…')
            const refined = await this.router.chat(refineMessages(messages, answer, parsed.issues), {
              purpose: 'refine',
              maxTokens: 2048,
              signal: controller.signal
            })
            if (refined.text.trim()) {
              answer = refined.text
              critique.refined = true
              this.notify('stream', { requestId: req.requestId, type: 'replace', data: answer })
            }
          }
        } catch (err: any) {
          if (controller.signal.aborted) throw err
        }
      }

      const message = this.repo.addMessage({
        conversationId: conversation.id,
        parentId: parent.id,
        role: 'assistant',
        content: answer,
        meta: {
          kind: 'answer',
          pathName: req.pathName,
          framework: req.framework,
          steps: selected,
          stepTitles: selected.map((n) => req.steps[n - 1]),
          provider: result.provider,
          model: result.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          tokensEstimated: result.usage.estimated,
          latencyMs: result.latencyMs,
          citations,
          toolCalls,
          critique
        }
      })
      this.repo.logFeedback({
        messageId: message.id,
        kind: 'click',
        framework: req.framework,
        questionType: classification?.label ?? '',
        stepsExecuted: selected.length,
        stepsAvailable: req.steps.length
      })

      // 5. Continuation paths for the next move
      status('Generating next thinking paths…')
      const type = classification?.label ?? 'learning'
      const { paths } = await generatePaths(this.router, {
        question,
        type,
        frameworks: candidateFrameworks(type, this.repo.listTemplates()),
        continuation: { lastPath: req.pathName, lastAnswer: answer }
      })
      const ranked = await this.rank(question, paths, type)
      const withPaths = this.repo.updateMessage(message.id, { meta: { paths: ranked } })!

      void this.updateMemory(conversation.id, message.id)
      return withPaths
    } finally {
      this.controllers.delete(req.requestId)
    }
  }

  private async updateMemory(conversationId: string, headId: string): Promise<void> {
    const conversation = this.repo.getConversation(conversationId)
    if (!conversation || !this.repo.getSettings().useMemory) return
    const old = needsSummary(this.repo.ancestry(headId))
    if (!old.length) return
    try {
      const res = await this.router.chat(summaryMessages(conversation.summary, transcript(old.slice(-6))), {
        purpose: 'memory',
        temperature: 0.2,
        maxTokens: 320,
        fast: true
      })
      if (res.text.trim()) this.repo.updateConversation(conversationId, { summary: res.text.trim() })
    } catch {
      /* memory is best-effort */
    }
  }

  async refreshPaths(messageId: string): Promise<Message> {
    const message = this.repo.getMessage(messageId)
    if (!message) throw new Error('Message not found')
    const chain = this.repo.ancestry(messageId)
    const question = [...chain].reverse().find((m) => m.role === 'user')?.content ?? message.content
    const type = [...chain].reverse().find((m) => m.meta.classification)?.meta.classification?.label ?? 'learning'
    const { paths } = await generatePaths(this.router, {
      question,
      type,
      frameworks: candidateFrameworks(type, this.repo.listTemplates()),
      continuation: message.role === 'assistant' ? { lastPath: message.meta.pathName ?? '', lastAnswer: message.content } : undefined
    })
    return this.repo.updateMessage(messageId, { meta: { paths: await this.rank(question, paths, type) } })!
  }

  // ------------------------------------------------------------------ CSV
  async analyzeCsv(input: { conversationId: string | null; fileName: string; text: string }): Promise<AskResult> {
    if (!input.text.trim()) throw new Error('The CSV file is empty')
    const stats = csvStats(input.text)
    if (!stats.columns.length) throw new Error('Could not read any columns from the CSV')
    const statsText = statsToText(stats)
    const sample = input.text.split(/\r?\n/).slice(0, 40).join('\n').slice(0, 6000)
    let conversation = input.conversationId ? this.repo.getConversation(input.conversationId) : undefined
    if (!conversation) conversation = this.repo.createConversation(`Data: ${input.fileName}`)
    const res = await this.router.chat(csvMessages(input.fileName, statsText, sample), { purpose: 'csv', maxTokens: 1800 })
    this.repo.updateConversation(conversation.id, {
      dataContext: `File: ${input.fileName}\n${statsText}\nSample:\n${sample.slice(0, 1500)}`
    })
    const message = this.repo.addMessage({
      conversationId: conversation.id,
      parentId: conversation.headId,
      role: 'assistant',
      content: `📊 **Dataset analysis: ${input.fileName}**\n\n${res.text}`,
      meta: {
        kind: 'csv',
        provider: res.provider,
        model: res.model,
        promptTokens: res.usage.promptTokens,
        completionTokens: res.usage.completionTokens,
        latencyMs: res.latencyMs
      }
    })
    return { conversation: this.repo.getConversation(conversation.id)!, message }
  }

  // ------------------------------------------------------------------ Model Lab
  async compare(prompt: string, providers: ProviderId[]): Promise<CompareResult[]> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
    const results = await Promise.all(
      providers.map(async (id): Promise<CompareResult> => {
        const started = Date.now()
        const model = this.router.provider(id).modelName()
        try {
          const r = await this.router.chat(messages, { purpose: 'lab', only: id, maxTokens: 1200 })
          return { provider: id, model, ok: true, text: r.text, latencyMs: r.latencyMs, tokens: r.usage.promptTokens + r.usage.completionTokens }
        } catch (err: any) {
          return { provider: id, model, ok: false, text: '', error: err?.message ?? String(err), latencyMs: Date.now() - started, tokens: 0 }
        }
      })
    )
    const ok = results.filter((r) => r.ok)
    if (ok.length >= 1) {
      try {
        const labels = ok.map((_, i) => String.fromCharCode(65 + i))
        const j = await this.router.chat(
          judgeMessages(prompt, ok.map((r, i) => ({ label: labels[i], text: r.text }))),
          // prefer Gemini as judge so the judge differs from the Groq/Ollama Llama models
          { purpose: 'judge', json: true, temperature: 0, maxTokens: 600, prefer: 'gemini' }
        )
        const parsed = parseWith(JudgeSchema, j.text)
        ok.forEach((r, i) => {
          const s = parsed.scores.find((x) => x.label.trim().toUpperCase() === labels[i])
          if (s) r.scores = { relevance: s.relevance, depth: s.depth, clarity: s.clarity, overall: s.overall, comment: s.comment }
        })
      } catch {
        /* judging optional */
      }
    }
    return results
  }

  feedback(messageId: string, kind: 'up' | 'down'): Message | undefined {
    const m = this.repo.getMessage(messageId)
    if (!m) return undefined
    const chain = this.repo.ancestry(messageId)
    const type = [...chain].reverse().find((x) => x.meta.classification)?.meta.classification?.label ?? ''
    this.repo.logFeedback({ messageId, kind, framework: m.meta.framework, questionType: type })
    return this.repo.updateMessage(messageId, { meta: { feedback: kind } })
  }
}
