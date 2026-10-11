import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'

const port = Number(process.env.IDM_HELPER_PORT ?? 43123)
const host = process.env.IDM_HELPER_HOST ?? '127.0.0.1'
const token = process.env.IDM_HELPER_TOKEN ?? 'local-helper-demo-token'

function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin ?? '*'
  res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

function findIdmExecutable(): string | null {
  const candidates = [
    process.env.IDM_PATH,
    'C:\\Program Files\\Internet Download Manager\\IDMan.exe',
    'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe',
  ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

function sanitizeFileName(name: string): string {
  return String(name || 'download.mp4')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.+$/g, '')
    .slice(0, 180) || 'download.mp4'
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 1024 * 1024) {
        reject(new Error('Request too large'))
        req.destroy()
        return
      }

      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw) as Record<string, unknown>)
      } catch {
        reject(new Error('Invalid JSON payload'))
      }
    })

    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${host}`)
  const authHeader = req.headers.authorization ?? ''

  setCorsHeaders(req, res)
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (authHeader !== `Bearer ${token}`) {
    res.statusCode = 401
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
    return
  }

  if (url.pathname === '/health') {
    const idmPath = findIdmExecutable()
    res.end(JSON.stringify({
      ok: true,
      connected: true,
      idmDetected: Boolean(idmPath),
      status: idmPath ? 'ready' : 'idm-missing',
      message: idmPath ? 'Local helper is ready for localhost use.' : 'IDM was not found on this machine.',
      idmPath,
    }))
    return
  }

  if (url.pathname === '/checkStatus' || url.pathname === '/idm/status') {
    const idmPath = findIdmExecutable()
    res.end(JSON.stringify({
      ok: Boolean(idmPath),
      helper: true,
      service: 'idm-helper',
      idmInstalled: Boolean(idmPath),
      idmPath: idmPath ?? null,
      found: Boolean(idmPath),
      path: idmPath ?? null,
      status: idmPath ? 'Connected' : 'Not Found',
    }))
    return
  }

  if (url.pathname === '/sendDownload') {
    try {
      const payload = await readJsonBody(req)
      const directUrl = typeof payload.url === 'string' ? payload.url.trim() : ''
      const fileName = sanitizeFileName(typeof payload.fileName === 'string' ? payload.fileName : 'download.mp4')
      const outputPath = typeof payload.outputPath === 'string' ? payload.outputPath.trim() : ''
      const selectedQuality = Number(payload.selectedQuality ?? payload.targetQuality ?? 0)
      const fallback = typeof payload.fallback === 'string' ? payload.fallback : 'nearest-lower'
      const qualityOptions = Array.isArray(payload.qualityOptions)
        ? payload.qualityOptions.filter((item): item is number => typeof item === 'number')
        : []
      const qualityLabel = typeof payload.qualityLabel === 'string' && payload.qualityLabel.trim().length > 0
        ? payload.qualityLabel.trim()
        : `${selectedQuality || 0}p`

      if (!directUrl || !/^https?:\/\//i.test(directUrl)) {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: 'Invalid URL supplied for IDM download.' }))
        return
      }

      const idmPath = findIdmExecutable()
      if (!idmPath) {
        res.statusCode = 400
        res.end(JSON.stringify({ ok: false, error: 'Internet Download Manager is not installed or not accessible.' }))
        return
      }

      const downloadDir = outputPath ? path.dirname(outputPath) : 'C:\\Users\\Public\\Downloads'
      const safeDir = path.resolve(downloadDir)
      const safeFile = fileName

      fs.mkdirSync(safeDir, { recursive: true })

      const args = [
        '/d', directUrl,
        '/p', safeDir,
        '/f', safeFile,
        '/n',
        '/a',
      ]

      const child = spawn(idmPath, args, { stdio: 'ignore', windowsHide: true })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', () => resolve())
        child.once('error', (error) => {
          console.error('IDM launch failed:', error)
          reject(new Error(`Could not start IDM: ${error.message}`))
        })
      })

      console.info(`[IDM HELPER] Started IDM for ${safeFile} in ${safeDir}`)
      res.end(JSON.stringify({
        ok: true,
        jobId: `idm-${Date.now()}`,
        message: 'IDM process started; the resolver is checking for the downloaded media file.',
        quality: selectedQuality,
        selectedQuality,
        qualityLabel,
        fallback,
        qualityOptions,
        fileName: safeFile,
        outputPath: path.join(safeDir, safeFile),
      }))
      return
    } catch (error) {
      res.statusCode = 400
      res.end(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Download request rejected.',
      }))
      return
    }
  }

  res.statusCode = 404
  res.end(JSON.stringify({ ok: false, error: 'Not found' }))
})

server.listen(port, host, () => {
  const idmPath = findIdmExecutable()
  console.log(`[IDM HELPER] Listening on http://${host}:${port}`)
  console.log(`[IDM HELPER] IDM detected: ${idmPath ? 'yes' : 'no'}`)
  if (idmPath) {
    console.log(`[IDM HELPER] IDM executable: ${idmPath}`)
  }
})
