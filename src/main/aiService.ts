import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { AiServiceStatus, DocumentInfo, QuestionType, SearchHit } from '@shared/types'

/**
 * Manages the local Python FastAPI service (question classifier, document RAG, tools, evaluation)
 * and exposes a typed HTTP client for it. The desktop app keeps working without it (graceful degradation).
 */
export class AiServiceClient {
  private proc: ChildProcess | null = null
  private state: AiServiceStatus = { state: 'stopped', detail: 'Not started' }
  readonly baseUrl: string

  constructor(
    private readonly serviceDir: string,
    port = Number(process.env.AI_SERVICE_PORT || 8765)
  ) {
    this.baseUrl = `http://127.0.0.1:${port}`
  }

  private pythonPath(): string | null {
    const win = path.join(this.serviceDir, '.venv', 'Scripts', 'python.exe')
    const nix = path.join(this.serviceDir, '.venv', 'bin', 'python')
    if (fs.existsSync(win)) return win
    if (fs.existsSync(nix)) return nix
    return null
  }

  async start(): Promise<void> {
    if (await this.healthy()) {
      this.state = { state: 'running', detail: `Already running at ${this.baseUrl}` }
      return
    }
    const python = this.pythonPath()
    if (!python) {
      this.state = { state: 'not-installed', detail: 'Run "npm run ai:setup" to install the Python AI service' }
      return
    }
    const port = new URL(this.baseUrl).port
    this.state = { state: 'starting', detail: 'Starting Python AI service…' }
    this.proc = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', port], {
      cwd: this.serviceDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true
    })
    let lastErr = ''
    this.proc.stderr?.on('data', (d) => {
      lastErr = String(d).trim().split('\n').slice(-1)[0] ?? lastErr
    })
    this.proc.on('exit', (code) => {
      this.proc = null
      if (this.state.state !== 'stopped') this.state = { state: 'error', detail: `AI service exited (${code}). ${lastErr}` }
    })
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (!this.proc) return
      if (await this.healthy()) return
    }
    this.state = { state: 'error', detail: `AI service did not become healthy. ${lastErr}` }
  }

  stop(): void {
    this.state = { state: 'stopped', detail: 'Stopped' }
    this.proc?.kill()
    this.proc = null
  }

  async restart(): Promise<AiServiceStatus> {
    this.stop()
    await this.start()
    return this.status()
  }

  private async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1500) })
      if (!res.ok) return false
      const h = (await res.json()) as any
      this.state = {
        state: 'running',
        detail: `Running at ${this.baseUrl}`,
        classifierLoaded: h.classifier_loaded,
        documents: h.documents,
        embeddings: h.embeddings
      }
      return true
    } catch {
      return false
    }
  }

  async status(): Promise<AiServiceStatus> {
    if (this.state.state === 'running' || this.state.state === 'error' || this.state.state === 'stopped') await this.healthy()
    return this.state
  }

  get running(): boolean {
    return this.state.state === 'running'
  }

  private async call<T>(route: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
    const res = await fetch(`${this.baseUrl}${route}`, {
      ...init,
      headers: init.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) {
      const body = await res.text()
      let detail = body
      try {
        detail = JSON.parse(body).detail ?? body
      } catch {
        /* plain text */
      }
      throw new Error(`AI service ${res.status}: ${detail}`)
    }
    return (await res.json()) as T
  }

  classify(text: string) {
    return this.call<{ label: QuestionType; confidence: number }>('/classify', {
      method: 'POST',
      body: JSON.stringify({ text })
    }, 5000)
  }

  similarity(query: string, candidates: string[]) {
    return this.call<{ scores: number[] }>('/similarity', { method: 'POST', body: JSON.stringify({ query, candidates }) }, 30_000)
  }

  search(query: string, k = 4) {
    return this.call<{ results: SearchHit[] }>('/search', { method: 'POST', body: JSON.stringify({ query, k }) }, 30_000)
  }

  listDocuments() {
    return this.call<{ documents: DocumentInfo[] }>('/documents')
  }

  uploadDocument(name: string, data: ArrayBuffer) {
    const form = new FormData()
    form.append('file', new Blob([data]), name)
    return this.call<DocumentInfo>('/documents', { method: 'POST', body: form }, 300_000)
  }

  deleteDocument(id: string) {
    return this.call<{ ok: boolean }>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  webSearch(query: string) {
    return this.call<{ results: { title: string; url: string; snippet: string }[] }>('/tools/web_search', {
      method: 'POST',
      body: JSON.stringify({ query, max_results: 5 })
    })
  }

  calculate(expression: string) {
    return this.call<{ result: string }>('/tools/calculate', { method: 'POST', body: JSON.stringify({ expression }) })
  }

  evalResults() {
    return this.call<{ classifier: any; eval: any }>('/eval/results')
  }
}
