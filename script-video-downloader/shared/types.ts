export type QualityMode = 'same' | 'individual' | 'smart'
export type FallbackMode = 'nearest-lower' | 'highest-available' | 'skip' | 'ask'
export type VideoStatus = 'Ready' | 'Checking' | 'Waiting' | 'Sending to IDM' | 'Downloading' | 'Completed' | 'Failed' | 'Skipped' | 'Unsupported'

export type QualitySelection = {
  target: number
  selected: number | null
  fallback: FallbackMode
  available: number[]
  reason?: string
}

export type ScriptVideo = {
  id: number
  url: string
  context: string
  line: number
  source: string
  paragraph: string
  availableQualities: number[]
  targetQuality: number
  selectedQuality: number | null
  status: VideoStatus
  fileName: string
  errorMessage: string
  retryCount: number
}

export type ProjectRecord = {
  id: string
  projectName: string
  originalScript: string
  status: string
  createdAt: string
  updatedAt: string
  videos: ScriptVideo[]
  qualityStrategy: QualityMode
  targetQuality: number
  fallback: FallbackMode
  downloadFolder: string
}

export type HelperStatus = {
  connected: boolean
  idmDetected: boolean
  helperVersion: string
  idmPath?: string
  port: number
  message: string
}
