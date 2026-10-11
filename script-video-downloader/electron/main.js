import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#09131f',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('detect-idm', async () => {
  const candidates = [
    'C:/Program Files/Internet Download Manager/IDMan.exe',
    'C:/Program Files (x86)/Internet Download Manager/IDMan.exe',
    'C:/Users/' + process.env.USERNAME + '/AppData/Local/Internet Download Manager/IDMan.exe',
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { found: true, path: candidate, status: '✓ Connected' }
    }
  }

  return { found: false, path: '', status: '✕ Not Found' }
})

ipcMain.handle('save-project', async (_event, project) => {
  const outputDir = path.join(process.cwd(), 'saved-projects')
  fs.mkdirSync(outputDir, { recursive: true })
  const filePath = path.join(outputDir, `project-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8')
  return { ok: true }
})

ipcMain.handle('save-settings', async (_event, settings) => {
  const settingsDir = path.join(process.cwd(), 'settings')
  fs.mkdirSync(settingsDir, { recursive: true })
  fs.writeFileSync(path.join(settingsDir, 'app-settings.json'), JSON.stringify(settings, null, 2), 'utf8')
  return { ok: true }
})

ipcMain.handle('get-settings', async () => {
  const settingsPath = path.join(process.cwd(), 'settings', 'app-settings.json')
  if (!fs.existsSync(settingsPath)) {
    return {
      defaultTargetQuality: 1080,
      fallback: 'nearest-lower',
      qualityMode: 'smart',
      defaultFolder: 'D:/Video Projects',
      sequentialMode: true,
      retryAttempts: 3,
    }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    return parsed
  } catch {
    return {
      defaultTargetQuality: 1080,
      fallback: 'nearest-lower',
      qualityMode: 'smart',
      defaultFolder: 'D:/Video Projects',
      sequentialMode: true,
      retryAttempts: 3,
    }
  }
})

ipcMain.handle('run-download', async (_event, payload) => {
  const { url, fileName, downloadFolder } = payload
  const normalizedFolder = downloadFolder || 'D:/Video Projects'
  const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
  const destination = path.join(normalizedFolder, safeFileName)

  fs.mkdirSync(normalizedFolder, { recursive: true })

  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, message: 'Invalid URL or unsupported source.' }
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { ok: false, message: `Download failed: HTTP ${response.status}` }
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(destination, buffer)
    return { ok: true, message: `Saved to ${destination}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unknown download error' }
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
