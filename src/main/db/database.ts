import fs from 'fs'
import path from 'path'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'

/**
 * Thin wrapper over sql.js (SQLite compiled to WebAssembly). It needs no native build,
 * keeps standard SQL, and is persisted to a single .sqlite file with debounced writes.
 */
export class SqliteStore {
  private db!: Database
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private readonly file: string) {}

  async open(): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f)
    })
    const data = fs.existsSync(this.file) ? fs.readFileSync(this.file) : undefined
    this.db = new SQL.Database(data)
    this.db.run('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        summary TEXT NOT NULL DEFAULT '', head_id TEXT, data_context TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        parent_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
        purpose TEXT NOT NULL, prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL,
        estimated INTEGER NOT NULL, latency_ms INTEGER NOT NULL, ok INTEGER NOT NULL, error TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, message_id TEXT, kind TEXT NOT NULL,
        framework TEXT NOT NULL DEFAULT '', question_type TEXT NOT NULL DEFAULT '',
        steps_executed INTEGER NOT NULL DEFAULT 0, steps_available INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, steps TEXT NOT NULL,
        question_types TEXT NOT NULL
      );
    `)
  }

  all<T = Record<string, any>>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  get<T = Record<string, any>>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params)
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 400)
  }

  flush(): void {
    if (!this.db) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, Buffer.from(this.db.export()))
    // export() resets connection-level pragmas in sql.js
    this.db.run('PRAGMA foreign_keys = ON;')
    fs.renameSync(tmp, this.file)
  }
}
