import { projectRoot } from './env'
import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { AiServiceClient } from './aiService'
import { SqliteStore } from './db/database'
import { Repository } from './db/repository'
import { StratifyEngine } from './engine'
import { registerIpc } from './ipc'
import { createProviders } from './llm/openaiCompat'
import { LLMRouter } from './llm/router'

app.commandLine.appendSwitch('disable-gpu-sandbox')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#0b0d12',
    title: 'StratifyAI',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // Security: the renderer has no Node access; everything goes through the typed preload bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // open external links in the system browser, never inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault()
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  const store = new SqliteStore(path.join(app.getPath('userData'), 'stratify.sqlite'))
  await store.open()
  const repo = new Repository(store)
  const router = new LLMRouter(createProviders(process.env, () => repo.getSettings().models), () => repo.getSettings(), repo)
  const ai = new AiServiceClient(path.join(projectRoot, 'ai-service'))
  const engine = new StratifyEngine(repo, router, ai, (channel, payload) => mainWindow?.webContents.send(channel, payload))

  registerIpc({ win: () => mainWindow, repo, engine, router, ai })
  createWindow()
  void ai.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('before-quit', () => {
    store.flush()
    ai.stop()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
