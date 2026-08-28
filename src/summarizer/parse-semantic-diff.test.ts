import { describe, expect, it } from 'vitest'
import { parseSemanticDiff } from '@/summarizer/parse-semantic-diff'

describe('parseSemanticDiff', () => {
  it('parses unified diff and extracts files, additions, removals', () => {
    const unified = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const x = 1
+const y = 2
-const z = 3
`
    const parsed = parseSemanticDiff(unified)
    expect(parsed.parseMode).toBe('unified')
    expect(parsed.filesChanged).toContain('src/foo.ts')
    expect(parsed.additions).toBe(1)
    expect(parsed.removals).toBe(1)
  })

  it('returns fallback for empty input', () => {
    const parsed = parseSemanticDiff('')
    expect(parsed.parseMode).toBe('fallback')
    expect(parsed.filesChanged).toEqual([])
    expect(parsed.additions).toBe(0)
    expect(parsed.removals).toBe(0)
  })

  it('returns fallback when not unified diff format', () => {
    const parsed = parseSemanticDiff('just some text')
    expect(parsed.parseMode).toBe('fallback')
  })

  it('extracts file paths from plain-text summaries (fallback_paths)', () => {
    const plain = 'ADD workType String? field to Application model in web/prisma/schema.prisma\nADD index on userId'
    const parsed = parseSemanticDiff(plain)
    expect(parsed.parseMode).toBe('fallback_paths')
    expect(parsed.filesChanged).toContain('web/prisma/schema.prisma')
  })

  it('preserves file:line references for pinpoint reading', () => {
    const text = 'Updated getUser in src/services/application.service.ts:96 — returns cached row'
    const parsed = parseSemanticDiff(text)
    expect(parsed.parseMode).toBe('fallback_paths')
    expect(parsed.filesChanged).toContain('src/services/application.service.ts:96')
  })
})
