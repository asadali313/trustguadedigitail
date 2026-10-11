import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { ProjectRecord } from '../shared/types.js'

const dataDir = path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = path.join(dataDir, 'script-video-downloader.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    projectName TEXT NOT NULL,
    originalScript TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    videos TEXT NOT NULL,
    qualityStrategy TEXT NOT NULL,
    targetQuality INTEGER NOT NULL,
    fallback TEXT NOT NULL,
    downloadFolder TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

export function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export function upsertSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run({ key, value })
}

export function saveProject(project: Omit<ProjectRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }) {
  const createdAt = project.createdAt ?? new Date().toISOString()
  const updatedAt = project.updatedAt ?? createdAt

  db.prepare(`
    INSERT INTO projects (id, projectName, originalScript, status, createdAt, updatedAt, videos, qualityStrategy, targetQuality, fallback, downloadFolder)
    VALUES (@id, @projectName, @originalScript, @status, @createdAt, @updatedAt, @videos, @qualityStrategy, @targetQuality, @fallback, @downloadFolder)
    ON CONFLICT(id) DO UPDATE SET
      projectName = excluded.projectName,
      originalScript = excluded.originalScript,
      status = excluded.status,
      updatedAt = excluded.updatedAt,
      videos = excluded.videos,
      qualityStrategy = excluded.qualityStrategy,
      targetQuality = excluded.targetQuality,
      fallback = excluded.fallback,
      downloadFolder = excluded.downloadFolder
  `).run({
    ...project,
    createdAt,
    updatedAt,
    videos: JSON.stringify(project.videos),
  })
}

export function getProject(projectId: string): ProjectRecord | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any
  if (!row) return null

  return {
    id: row.id,
    projectName: row.projectName,
    originalScript: row.originalScript,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    videos: JSON.parse(row.videos),
    qualityStrategy: row.qualityStrategy,
    targetQuality: row.targetQuality,
    fallback: row.fallback,
    downloadFolder: row.downloadFolder,
  }
}

export function listProjects(): ProjectRecord[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updatedAt DESC').all() as any[]
  return rows.map((row) => ({
    id: row.id,
    projectName: row.projectName,
    originalScript: row.originalScript,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    videos: JSON.parse(row.videos),
    qualityStrategy: row.qualityStrategy,
    targetQuality: row.targetQuality,
    fallback: row.fallback,
    downloadFolder: row.downloadFolder,
  }))
}
