import { describe, expect, it } from 'vitest'
import { QualityService } from './qualityService'
import { ScriptParser } from './scriptParser'

describe('ScriptParser', () => {
  it('preserves script order and extracts video urls from mixed text', () => {
    const text = `Messi scored the winning goal.

[https://example.com/video1](https://example.com/video1)

The crowd went crazy.
Source: https://example.com/video2 and https://example.com/video3.`

    const parsed = new ScriptParser().parse(text)

    expect(parsed.videos.map((video) => video.url)).toEqual([
      'https://example.com/video1',
      'https://example.com/video2',
      'https://example.com/video3',
    ])

    expect(parsed.videos[0].context).toContain('Messi scored the winning goal')
    expect(parsed.videos[1].context).toContain('The crowd went crazy')
  })
})

describe('QualityService', () => {
  it('selects nearest lower quality when target is unavailable', () => {
    const result = new QualityService().resolveTargetQuality({
      target: 1080,
      available: [720, 480],
      fallback: 'nearest-lower',
    })

    expect(result).toBe(720)
  })

  it('uses highest available quality when requested quality is missing', () => {
    const result = new QualityService().resolveTargetQuality({
      target: 1080,
      available: [1440, 720],
      fallback: 'highest-available',
    })

    expect(result).toBe(1440)
  })
})
