import { app } from 'electron'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

/**
 * Loads .env before anything else reads process.env.
 * Dev: project root. Packaged: next to the executable, then the user-data folder.
 */
const candidates = [
  path.join(process.cwd(), '.env'),
  path.join(app.getAppPath(), '..', '.env'),
  path.join(path.dirname(process.execPath), '.env'),
  path.join(app.getPath('userData'), '.env')
]
for (const file of candidates) {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file })
    break
  }
}

export const projectRoot = app.isPackaged ? process.resourcesPath : process.cwd()
