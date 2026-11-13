// Runs a Python script inside the ai-service virtual environment.
// Usage: node scripts/run-python.mjs <script relative to ai-service> [args...]
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const service = join(process.cwd(), 'ai-service')
const python = join(service, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python)) {
  console.error('ai-service/.venv not found. Run "npm run ai:setup" first.')
  process.exit(1)
}
const result = spawnSync(python, process.argv.slice(2), { stdio: 'inherit', cwd: service })
process.exit(result.status ?? 1)
