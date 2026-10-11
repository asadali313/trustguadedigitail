import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { QualityService } from './services/qualityService'
import type { FallbackMode, QualityMode, ProjectRecord, ScriptVideo } from '../shared/types'

type AppSettings = {
  defaultTargetQuality: number
  fallback: FallbackMode
  qualityMode: QualityMode
  defaultFolder: string
  sequentialMode: boolean
  retryAttempts: number
}

type DryRunSummary = {
  total: number
  valid: number
  unsupported: number
  invalid: number
  fallbackRequired: number
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultTargetQuality: 1080,
  fallback: 'nearest-lower',
  qualityMode: 'smart',
  defaultFolder: 'D:/Video Projects',
  sequentialMode: true,
  retryAttempts: 3,
}

const qualityLabels = [144, 240, 360, 480, 540, 720, 1080, 1440, 2160]
const qualityService = new QualityService()

function App() {
  const [projectName, setProjectName] = useState('Football Highlights')
  const [scriptText, setScriptText] = useState(`Messi scored the winning goal.

[https://example.com/video1](https://example.com/video1)

The crowd celebrated.
Source: [https://example.com/video2](https://example.com/video2).
Also: https://example.com/video3 and https://example.com/video1, then https://example.com/video4.`)
  const [videos, setVideos] = useState<ScriptVideo[]>([])
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [qualityMode, setQualityMode] = useState<QualityMode>('smart')
  const [targetQuality, setTargetQuality] = useState(1080)
  const [fallback, setFallback] = useState<FallbackMode>('nearest-lower')
  const [status, setStatus] = useState('Ready')
  const [helperStatus, setHelperStatus] = useState({ connected: false, idmDetected: false, message: 'Local helper required' })
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isRunning, setIsRunning] = useState(false)
  const [report, setReport] = useState('')
  const [dryRun, setDryRun] = useState<DryRunSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const payload = await response.json() as ProjectRecord[]
        setProjects(payload)
      }
    } catch {
      setProjects([])
    }
  }

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const payload = (await response.json()) as Record<string, string>
        const nextSettings: AppSettings = {
          ...DEFAULT_SETTINGS,
          defaultTargetQuality: Number(payload.defaultTargetQuality ?? 1080),
          fallback: (payload.fallback as FallbackMode) ?? 'nearest-lower',
          qualityMode: (payload.qualityMode as QualityMode) ?? 'smart',
          defaultFolder: payload.defaultFolder ?? 'D:/Video Projects',
          sequentialMode: payload.sequentialMode !== 'false',
          retryAttempts: Number(payload.retryAttempts ?? 3),
        }
        setSettings(nextSettings)
        setTargetQuality(nextSettings.defaultTargetQuality)
        setFallback(nextSettings.fallback)
        setQualityMode(nextSettings.qualityMode)
      }
    } catch {
      setStatus('Using local defaults')
    }
  }

  const loadHelperStatus = async () => {
    try {
      const response = await fetch('/api/helper/status')
      if (response.ok) {
        const payload = await response.json() as { connected?: boolean; idmDetected?: boolean; message?: string }
        setHelperStatus({
          connected: Boolean(payload.connected),
          idmDetected: Boolean(payload.idmDetected),
          message: payload.message ?? 'Connected to local helper',
        })
      }
    } catch {
      setHelperStatus({ connected: false, idmDetected: false, message: 'Local helper not available' })
    }
  }

  useEffect(() => {
    void loadHelperStatus()
    void loadSettings()
    void loadProjects()
  }, [])

  const summary = useMemo(() => {
    const total = videos.length
    const completed = videos.filter((video) => video.status === 'Completed').length
    const failed = videos.filter((video) => video.status === 'Failed').length
    const skipped = videos.filter((video) => video.status === 'Skipped').length
    return { total, completed, failed, skipped }
  }, [videos])

  const handleNewProject = () => {
    setCurrentProjectId(null)
    setProjectName('New Project')
    setScriptText('')
    setVideos([])
    setReport('')
    setDryRun(null)
    setStatus('Ready')
  }

  const handleAnalyze = async () => {
    const payloadBody = {
      script: scriptText,
      projectName,
      targetQuality,
      fallback,
      qualityMode,
      downloadFolder: settings.defaultFolder,
      projectId: currentProjectId ?? undefined,
    }

    const result = await fetch('/api/scripts/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBody),
    })

    if (!result.ok) {
      setStatus('Analysis failed')
      return
    }

    const payload = await result.json() as { project: ProjectRecord; total: number; supported: number; dryRun: DryRunSummary }
    setCurrentProjectId(payload.project.id)
    setVideos(payload.project.videos)
    setDryRun(payload.dryRun)
    setStatus(`Detected ${payload.total} videos`)
    setReport(`DRY RUN\nTotal: ${payload.dryRun.total}\nValid: ${payload.dryRun.valid}\nUnsupported: ${payload.dryRun.unsupported}\nInvalid: ${payload.dryRun.invalid}\nFallback Required: ${payload.dryRun.fallbackRequired}`)
    await loadProjects()
  }

  const updateQualitySelections = (mode: QualityMode) => {
    setQualityMode(mode)
    setVideos((current) => current.map((video) => {
      if (mode === 'same' || mode === 'smart') {
        return { ...video, selectedQuality: qualityService.resolveTargetQuality({ target: targetQuality, available: video.availableQualities, fallback }) }
      }
      return video
    }))
  }

  const saveSettings = async () => {
    const nextSettings: AppSettings = {
      ...settings,
      defaultTargetQuality: targetQuality,
      fallback,
      qualityMode,
      sequentialMode: true,
    }
    setSettings(nextSettings)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings),
    })
    setStatus('Settings saved')
  }

  const handleUploadScript = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setScriptText(text)
    setStatus(`Loaded ${file.name}`)
    event.target.value = ''
  }

  const startQueue = async () => {
    if (!currentProjectId || !videos.length) return

    setIsRunning(true)
    setStatus('Sequential download started')

    try {
      const response = await fetch(`/api/projects/${currentProjectId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryAttempts: settings.retryAttempts }),
      })

      const payload = await response.json() as { project?: ProjectRecord; summary?: { total: number; completed: number; failed: number; skipped: number } }
      if (response.ok && payload.project) {
        setVideos(payload.project.videos)
        setStatus(`Queue finished: ${payload.summary?.completed ?? 0} complete, ${payload.summary?.failed ?? 0} failed`)
        setReport(`DOWNLOAD COMPLETE\nProject: ${projectName}\nTotal: ${payload.summary?.total ?? payload.project.videos.length}\nCompleted: ${payload.summary?.completed ?? 0}\nFailed: ${payload.summary?.failed ?? 0}\nSkipped: ${payload.summary?.skipped ?? 0}`)
      } else {
        setStatus('Queue failed to start')
      }
    } finally {
      setIsRunning(false)
      await loadProjects()
    }
  }

  const openProject = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId)
    if (!project) return

    setCurrentProjectId(project.id)
    setProjectName(project.projectName)
    setScriptText(project.originalScript)
    setVideos(project.videos)
    setTargetQuality(project.targetQuality)
    setFallback(project.fallback)
    setQualityMode(project.qualityStrategy)
    setStatus(`Opened project: ${project.projectName}`)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">SV</div>
          <div>
            <p className="eyebrow">Web app</p>
            <h1>Script Video Downloader</h1>
          </div>
        </div>

        <div className="section-card">
          <label htmlFor="project-name">Project</label>
          <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <div className="button-row">
            <button type="button" className="primary" onClick={handleNewProject}>New Project</button>
            <label className="secondary file-button">
              Open Project
              <select className="project-select" value={currentProjectId ?? ''} onChange={(event) => void openProject(event.target.value)}>
                <option value="">Select saved project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.projectName}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="section-card">
          <label htmlFor="script-box">Script Input</label>
          <div className="button-row compact">
            <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>Upload Script</button>
            <button type="button" className="secondary" onClick={() => setScriptText(scriptText || '')}>Paste Script</button>
          </div>
          <input ref={fileInputRef} type="file" accept=".txt,.md,.doc,.docx" className="hidden-file-input" onChange={(event) => void handleUploadScript(event)} />
          <textarea id="script-box" value={scriptText} onChange={(event) => setScriptText(event.target.value)} rows={12} />
          <button type="button" className="primary" onClick={() => void handleAnalyze()}>Analyze Script</button>
        </div>

        <div className="section-card status-box">
          <div className="status-line">
            <span>Local Helper</span>
            <strong>{helperStatus.connected ? '✓ Connected' : '✕ Not Connected'}</strong>
          </div>
          <div className="status-line">
            <span>IDM</span>
            <strong>{helperStatus.idmDetected ? '✓ Detected' : '✕ Not Detected'}</strong>
          </div>
          <p className="helper-message">{helperStatus.message}</p>
          <div className="button-row">
            <button type="button" className="secondary" onClick={() => void loadHelperStatus()}>Check Connection</button>
            <button type="button" className="secondary" onClick={() => setStatus('Helper is running locally on 127.0.0.1:43123')}>Install Helper</button>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2>{projectName}</h2>
          </div>
          <div className="inline-actions">
            <button type="button" className="secondary" onClick={() => setReport(dryRun ? `DRY RUN\nTotal: ${dryRun.total}\nValid: ${dryRun.valid}\nUnsupported: ${dryRun.unsupported}\nInvalid: ${dryRun.invalid}\nFallback Required: ${dryRun.fallbackRequired}` : 'No dry run available yet.')}>Dry Run</button>
            <button type="button" className="primary" onClick={() => void startQueue()} disabled={isRunning || videos.length === 0}>Start</button>
            <button type="button" className="secondary">Pause</button>
          </div>
        </header>

        <section className="metrics-row">
          <div className="metric"><span>Total</span><strong>{summary.total}</strong></div>
          <div className="metric"><span>Completed</span><strong>{summary.completed}</strong></div>
          <div className="metric"><span>Failed</span><strong>{summary.failed}</strong></div>
          <div className="metric"><span>Skipped</span><strong>{summary.skipped}</strong></div>
        </section>

        <section className="quality-panel">
          <div>
            <p className="eyebrow">Quality strategy</p>
            <h3>Choose Video Quality</h3>
          </div>

          <div className="quality-grid">
            <label>
              <span>Target quality</span>
              <select value={targetQuality} onChange={(event) => setTargetQuality(Number(event.target.value))}>
                {qualityLabels.map((quality) => (
                  <option key={quality} value={quality}>{quality}p</option>
                ))}
              </select>
            </label>

            <label>
              <span>Fallback</span>
              <select value={fallback} onChange={(event) => setFallback(event.target.value as FallbackMode)}>
                <option value="nearest-lower">Nearest lower</option>
                <option value="highest-available">Highest available</option>
                <option value="skip">Skip video</option>
                <option value="ask">Ask me</option>
              </select>
            </label>
          </div>

          <div className="radio-group">
            <label>
              <input checked={qualityMode === 'same'} onChange={() => updateQualitySelections('same')} type="radio" name="qualityMode" />
              Same Quality
            </label>
            <label>
              <input checked={qualityMode === 'individual'} onChange={() => updateQualitySelections('individual')} type="radio" name="qualityMode" />
              Ask Individually
            </label>
            <label>
              <input checked={qualityMode === 'smart'} onChange={() => updateQualitySelections('smart')} type="radio" name="qualityMode" />
              Smart Automatic
            </label>
          </div>

          <div className="button-row">
            <button type="button" className="primary" onClick={() => void saveSettings()}>Apply Selection</button>
            <button type="button" className="secondary" onClick={() => setVideos((current) => current.map((video) => ({ ...video, selectedQuality: qualityService.resolveTargetQuality({ target: targetQuality, available: video.availableQualities, fallback }) })))}>Auto Select All</button>
            <button type="button" className="secondary" onClick={() => setVideos((current) => current.map((video) => ({ ...video, selectedQuality: null })))}>Reset Individual Selections</button>
          </div>
        </section>

        <section className="table-panel">
          <div className="table-header">
            <h3>Detected videos</h3>
            <span>{status}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Context</th>
                <th>Source</th>
                <th>Target</th>
                <th>Selected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id}>
                  <td>{String(video.id).padStart(2, '0')}</td>
                  <td>{video.context}</td>
                  <td>{video.source}</td>
                  <td>{video.targetQuality}p</td>
                  <td>{video.selectedQuality ? `${video.selectedQuality}p` : '—'}</td>
                  <td><span className={`tag ${video.status.toLowerCase().replace(/\s+/g, '-')}`}>{video.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="report-panel">
          <h3>Completion report</h3>
          <pre>{report || 'No download run yet.'}</pre>
        </section>
      </main>
    </div>
  )
}

export default App
