import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getProject, listProjects, saveProject, upsertSetting, getSettings } from './database.js'
import { ScriptParser } from '../src/services/scriptParser.js'
import { QualityService } from '../src/services/qualityService.js'
import type { FallbackMode, QualityMode, ScriptVideo, VideoStatus } from '../shared/types.js'

const app = express()
const parser = new ScriptParser()
const qualityService = new QualityService()
const helperToken = process.env.IDM_HELPER_TOKEN ?? 'local-helper-demo-token'
const helperPort = Number(process.env.IDM_HELPER_PORT ?? 43123)
const helperBaseUrl = `http://127.0.0.1:${helperPort}`

app.use(helmet({
  crossOriginResourcePolicy: false,
}))
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))

const sanitizeDownloadFolder = (value: string) => {
  const candidate = value?.trim() || 'D:/Video Projects'
  return candidate.replace(/[<>:"|?*]/g, '').replace(/\\/g, '/')
}

async function probeLocalHelper() {
  try {
    const response = await fetch(`${helperBaseUrl}/health`, {
      headers: { Authorization: `Bearer ${helperToken}` },
    })

    if (!response.ok) {
      return { connected: false, idmDetected: false, helperVersion: '1.0.0', message: 'Local helper is not responding.' }
    }

    const payload = await response.json() as { connected?: boolean; idmDetected?: boolean; status?: string; message?: string }
    return {
      connected: Boolean(payload.connected ?? true),
      idmDetected: Boolean(payload.idmDetected ?? false),
      helperVersion: '1.0.0',
      message: payload.message ?? payload.status ?? 'Local helper is ready for localhost use.',
    }
  } catch {
    return {
      connected: false,
      idmDetected: false,
      helperVersion: '1.0.0',
      message: 'Local helper unavailable on localhost.',
    }
  }
}

async function helperRequest(pathname: string, payload?: Record<string, unknown>) {
  const url = new URL(pathname, helperBaseUrl)
  const body = payload ? JSON.stringify(payload) : undefined

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${helperToken}`,
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Helper request failed: ${response.status}`)
  }

  return response.json()
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy', time: new Date().toISOString() })
})

app.get('/api/helper/status', async (_req, res) => {
  const status = await probeLocalHelper()
  const settings = getSettings()

  res.json({
    ...status,
    port: helperPort,
    connected: status.connected || settings.helperConnected === 'true',
    idmDetected: status.idmDetected || settings.idmDetected === 'true',
  })
})

app.post('/api/projects', (req, res) => {
  const projectName = typeof req.body?.projectName === 'string' ? req.body.projectName : 'New Project'
  const project: Parameters<typeof saveProject>[0] = {
    id: randomUUID(),
    projectName,
    originalScript: typeof req.body?.originalScript === 'string' ? req.body.originalScript : '',
    status: 'Draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    videos: [],
    qualityStrategy: 'smart',
    targetQuality: 1080,
    fallback: 'nearest-lower',
    downloadFolder: sanitizeDownloadFolder(String(req.body?.downloadFolder ?? 'D:/Video Projects')),
  }
  saveProject(project)
  res.status(201).json(project)
})

app.post('/api/scripts/analyze', (req, res) => {
  const script = typeof req.body?.script === 'string' ? req.body.script : ''
  const target = Number(req.body?.targetQuality ?? 1080)
  const fallback = (req.body?.fallback ?? 'nearest-lower') as FallbackMode
  const mode = (req.body?.qualityMode ?? 'smart') as QualityMode
  const projectName = typeof req.body?.projectName === 'string' ? req.body.projectName : 'New Project'
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : randomUUID()
  const downloadFolder = sanitizeDownloadFolder(String(req.body?.downloadFolder ?? 'D:/Video Projects'))

  const parsed = parser.parse(script)
  const available = [144, 240, 360, 480, 540, 720, 1080, 1440, 2160]

  const videos: ScriptVideo[] = parsed.videos.map((video, index) => {
    const selected = qualityService.resolveTargetQuality({ target, available, fallback })
    return {
      id: index + 1,
      url: video.url,
      context: video.context,
      line: video.line,
      source: 'Detected Source',
      paragraph: video.context,
      availableQualities: available,
      targetQuality: target,
      selectedQuality: mode === 'same' || mode === 'smart' ? selected : null,
      status: 'Ready',
      fileName: `${String(index + 1).padStart(2, '0')}.mp4`,
      errorMessage: '',
      retryCount: 0,
    }
  })

  const project: Parameters<typeof saveProject>[0] = {
    id: projectId,
    projectName,
    originalScript: script,
    status: 'Analyzed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    videos,
    qualityStrategy: mode,
    targetQuality: target,
    fallback,
    downloadFolder,
  }

  saveProject(project)
  res.json({
    project,
    total: videos.length,
    supported: videos.length,
    dryRun: {
      total: videos.length,
      valid: videos.length,
      unsupported: 0,
      invalid: 0,
      fallbackRequired: 0,
    },
  })
})

app.get('/api/projects', (_req, res) => {
  res.json(listProjects())
})

app.get('/api/projects/:id', (req, res) => {
  const project = getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  return res.json(project)
})

app.get('/api/projects/:id/videos', (req, res) => {
  const project = getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  res.json(project.videos)
})

app.post('/api/projects/:id/run', async (req, res) => {
  const project = getProject(req.params.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const retryAttempts = Number(req.body?.retryAttempts ?? 3)
  const updatedProject = { ...project, videos: [...project.videos], updatedAt: new Date().toISOString() }
  const helperStatus = await probeLocalHelper()

  for (const video of updatedProject.videos) {
    let attempt = 0
    let lastError = ''

    while (attempt <= retryAttempts) {
      const currentAttempt = attempt + 1
      const nextStatus: VideoStatus = 'Checking'
      const nextVideos = updatedProject.videos.map((item) => item.id === video.id
        ? { ...item, status: nextStatus, errorMessage: '', retryCount: attempt }
        : item)
      updatedProject.videos = nextVideos
      saveProject(updatedProject)

      if (!helperStatus.connected || !helperStatus.idmDetected) {
        updatedProject.videos = updatedProject.videos.map((item) => item.id === video.id
          ? { ...item, status: 'Failed', errorMessage: 'IDM helper is not available locally.' }
          : item)
        saveProject(updatedProject)
        break
      }

      try {
        const selectedQuality = video.selectedQuality ?? video.targetQuality
        const outputPath = path.join(updatedProject.downloadFolder, video.fileName)
        const helperPayload = {
          sequenceNumber: video.id,
          url: video.url,
          fileName: video.fileName,
          outputPath,
          selectedQuality,
          qualityLabel: `${selectedQuality}p`,
          targetQuality: selectedQuality,
          fallback: updatedProject.fallback,
          lineNumber: video.line,
          context: video.context,
          qualityOptions: video.availableQualities,
          qualityStrategy: updatedProject.qualityStrategy,
        }

        const payload = await helperRequest('/sendDownload', helperPayload) as { ok?: boolean; error?: string; jobId?: string }
        if (payload?.ok === false) {
          throw new Error(payload.error ?? 'Helper rejected the download request.')
        }

        updatedProject.videos = updatedProject.videos.map((item) => item.id === video.id
          ? { ...item, status: 'Downloading', errorMessage: '', filePath: outputPath }
          : item)
        saveProject(updatedProject)

        updatedProject.videos = updatedProject.videos.map((item) => item.id === video.id
          ? { ...item, status: 'Completed', errorMessage: '', filePath: outputPath }
          : item)
        saveProject(updatedProject)
        lastError = ''
        break
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Download failed'
        const shouldRetry = attempt < retryAttempts
        updatedProject.videos = updatedProject.videos.map((item) => item.id === video.id
          ? { ...item, status: shouldRetry ? 'Waiting' : 'Failed', errorMessage: lastError, retryCount: currentAttempt }
          : item)
        saveProject(updatedProject)
        if (!shouldRetry) break
        attempt += 1
      }
    }
  }

  updatedProject.status = 'Completed'
  updatedProject.updatedAt = new Date().toISOString()
  saveProject(updatedProject)

  res.json({
    ok: true,
    project: updatedProject,
    summary: {
      total: updatedProject.videos.length,
      completed: updatedProject.videos.filter((item) => item.status === 'Completed').length,
      failed: updatedProject.videos.filter((item) => item.status === 'Failed').length,
      skipped: updatedProject.videos.filter((item) => item.status === 'Skipped').length,
    },
  })
})

app.post('/api/settings', (req, res) => {
  const body = req.body ?? {}
  for (const [key, value] of Object.entries(body)) {
    upsertSetting(String(key), String(value))
  }
  res.json({ ok: true, settings: getSettings() })
})

app.get('/api/settings', (_req, res) => {
  res.json(getSettings())
})

export default app
