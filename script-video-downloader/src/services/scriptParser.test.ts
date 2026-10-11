import { describe, expect, it } from 'vitest'
import { ScriptParser } from './scriptParser'

describe('ScriptParser', () => {
  it('extracts URLs in original order while trimming punctuation and preserving duplicates', () => {
    const parser = new ScriptParser()
    const sample = `Messi scored the winning goal.

[https://example.com/video1](https://example.com/video1)

The crowd celebrated.
Source: [https://example.com/video2](https://example.com/video2).
Also: https://example.com/video3 and https://example.com/video1, then https://example.com/video4.`

    const result = parser.parse(sample)

    expect(result.videos.map((video) => video.url)).toEqual([
      'https://example.com/video1',
      'https://example.com/video2',
      'https://example.com/video3',
      'https://example.com/video1',
      'https://example.com/video4',
    ])
    expect(result.videos[0].line).toBe(3)
    expect(result.videos[1].line).toBe(6)
  })
})
