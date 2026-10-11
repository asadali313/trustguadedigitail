export type QualityValue = 144 | 240 | 360 | 480 | 540 | 720 | 1080 | 1440 | 2160

export type FallbackMode = 'nearest-lower' | 'highest-available' | 'skip' | 'ask'

export interface ResolveTargetQualityInput {
  target: number
  available: number[]
  fallback: FallbackMode
}

export class QualityService {
  static readonly QUALITY_LEVELS: QualityValue[] = [144, 240, 360, 480, 540, 720, 1080, 1440, 2160]

  normalizeQuality(value: number | string): number | null {
    if (typeof value === 'string') {
      const stripped = value.toLowerCase().replace(/[^0-9p]/g, '')
      const match = stripped.match(/(\d+)/)
      if (!match) return null
      const parsed = Number(match[1])
      return this.findClosestSupported(parsed)
    }

    if (typeof value === 'number') {
      return this.findClosestSupported(value)
    }

    return null
  }

  findClosestSupported(value: number): number | null {
    const values = QualityService.QUALITY_LEVELS
    const closest = values.reduce((best, current) => {
      if (best === null) return current
      const bestDiff = Math.abs(best - value)
      const currentDiff = Math.abs(current - value)
      return currentDiff < bestDiff ? current : best
    }, null as number | null)

    return closest
  }

  compareQualities(a: number, b: number): number {
    return a - b
  }

  selectExactQuality(target: number, available: number[]): number | null {
    const normalizedTarget = this.normalizeQuality(target)
    if (normalizedTarget === null) return null
    return available.includes(normalizedTarget) ? normalizedTarget : null
  }

  selectNearestLower(target: number, available: number[]): number | null {
    const normalizedTarget = this.normalizeQuality(target)
    if (normalizedTarget === null) return null
    const candidates = available
      .map((value) => this.normalizeQuality(value))
      .filter((v): v is number => v !== null && v <= normalizedTarget)
      .sort((a, b) => b - a)

    return candidates[0] ?? null
  }

  selectHighestAvailable(available: number[]): number | null {
    const normalized = available
      .map((value) => this.normalizeQuality(value))
      .filter((v): v is number => v !== null)
      .sort((a, b) => b - a)

    return normalized[0] ?? null
  }

  resolveTargetQuality({ target, available, fallback }: ResolveTargetQualityInput): number | null {
    const normalizedAvailable = [...new Set(available.map((value) => this.normalizeQuality(value)).filter((v): v is number => v !== null))]
    const exact = this.selectExactQuality(target, normalizedAvailable)
    if (exact !== null) return exact

    switch (fallback) {
      case 'nearest-lower':
        return this.selectNearestLower(target, normalizedAvailable)
      case 'highest-available':
        return this.selectHighestAvailable(normalizedAvailable)
      case 'skip':
        return null
      case 'ask':
        return this.selectNearestLower(target, normalizedAvailable) ?? null
      default:
        return this.selectNearestLower(target, normalizedAvailable)
    }
  }
}
