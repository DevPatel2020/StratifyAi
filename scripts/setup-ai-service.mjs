// Creates the Python virtual environment for ai-service, installs dependencies and trains the classifier.
// Usage: npm run ai:setup
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const service = join(process.cwd(), 'ai-service')
const isWin = process.platform === 'win32'
const venvPython = join(service, '.venv', isWin ? 'Scripts/python.exe' : 'bin/python')

function findPython() {
  for (const cmd of isWin ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    try {
      const args = cmd === 'py' ? ['-3', '--version'] : ['--version']
      const v = execFileSync(cmd, args, { encoding: 'utf8' }).trim()
      const [major, minor] = v.replace('Python ', '').split('.').map(Number)
      if (major === 3 && minor >= 10) return cmd === 'py' ? ['py', '-3'] : [cmd]
    } catch {
      /* try next */
    }
  }
  throw new Error('Python 3.10+ is required. Install it from https://www.python.org/downloads/')
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: service })

if (!existsSync(venvPython)) {
  const [py, ...pre] = findPython()
  console.log('Creating virtual environment…')
  run(py, [...pre, '-m', 'venv', '.venv'])
}
console.log('Installing Python dependencies (first run downloads ~300 MB)…')
run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'])
console.log('Training the question classifier…')
run(venvPython, ['scripts/train_classifier.py'])
console.log('\nAI service ready. Start the app with: npm run dev')
