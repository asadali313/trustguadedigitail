export interface ParsedVideoItem {
  index: number
  url: string
  context: string
  line: number
  rawText: string
}

export interface ParseResult {
  videos: ParsedVideoItem[]
  textSegments: Array<{ start: number; end: number; text: string }>
}

export class ScriptParser {
  parse(input: string): ParseResult {
    const text = input ?? ''
    const urls = this.extractUrls(text)
    const segments: Array<{ start: number; end: number; text: string }> = []
    const videos: ParsedVideoItem[] = []

    let cursor = 0
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i]
      const start = text.indexOf(url, cursor)
      if (start === -1) continue

      const before = text.slice(cursor, start)
      if (before.trim()) {
        segments.push({ start: cursor, end: start, text: before })
      }

      const contextStart = Math.max(0, start - 180)
      const contextEnd = Math.min(text.length, start + url.length + 180)
      const context = text.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim()

      videos.push({
        index: i + 1,
        url,
        context,
        line: this.findLineNumber(text, start),
        rawText: url,
      })

      cursor = start + url.length
    }

    const remaining = text.slice(cursor)
    if (remaining.trim()) {
      segments.push({ start: cursor, end: text.length, text: remaining })
    }

    return { videos, textSegments: segments }
  }

  private extractUrls(text: string): string[] {
    const markdownRanges: Array<{ start: number; end: number }> = []
    const markdownLinkPattern = /\[[^\]]*?\]\((https?:\/\/[^)\s]+)\)/gi
    let markdownMatch: RegExpExecArray | null

    while ((markdownMatch = markdownLinkPattern.exec(text)) !== null) {
      const url = this.cleanUrl(markdownMatch[1])
      if (!url) continue

      markdownRanges.push({
        start: markdownMatch.index,
        end: markdownMatch.index + markdownMatch[0].length,
      })
    }

    const occurrences: Array<{ start: number; url: string }> = []
    const plainUrlPattern = /https?:\/\/[^\s<>()\[\]{}"'`]+/gi
    let plainMatch: RegExpExecArray | null

    while ((plainMatch = plainUrlPattern.exec(text)) !== null) {
      const candidate = this.cleanUrl(plainMatch[0])
      if (!candidate) continue

      const start = plainMatch.index
      const end = plainMatch.index + plainMatch[0].length
      const withinMarkdownLink = markdownRanges.some((range) => start >= range.start && end <= range.end)
      if (withinMarkdownLink) continue

      occurrences.push({ start, url: candidate })
    }

    for (const markdownRange of markdownRanges) {
      const markdownTarget = text.slice(markdownRange.start, markdownRange.end)
      const hrefMatch = markdownTarget.match(/\]\((https?:\/\/[^)\s]+)\)/i)
      const href = hrefMatch ? this.cleanUrl(hrefMatch[1]) : null
      if (href) {
        occurrences.push({ start: markdownRange.start, url: href })
      }
    }

    return occurrences
      .sort((a, b) => a.start - b.start)
      .map((entry) => entry.url)
  }

  private cleanUrl(value: string): string | null {
    let cleaned = value.trim()
    cleaned = cleaned.replace(/^\[|\]$/g, '')
    cleaned = cleaned.replace(/[),.;!?]+$/g, '')
    cleaned = cleaned.replace(/^\(|\)$/g, '')
    if (!/^https?:\/\//i.test(cleaned)) return null
    return cleaned
  }

  private findLineNumber(text: string, index: number): number {
    return text.slice(0, index).split(/\r?\n/).length
  }
}
