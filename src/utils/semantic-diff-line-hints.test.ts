import { describe, expect, it } from 'vitest'
import { SEMANTIC_DIFF_FILE } from '@/constants'
import { computeSemanticDiffLineHints } from '@/utils/semantic-diff-line-hints'

describe('computeSemanticDiffLineHints', () => {
  it('returns empty when all blocks under threshold', () => {
    const small = `FILE: a.ts\nCONTENT:\n${'x\n'.repeat(10)}`
    expect(computeSemanticDiffLineHints(small)).toEqual([])
  })

  it('hints when a FILE block exceeds soft threshold', () => {
    const lines = SEMANTIC_DIFF_FILE.SOFT_WARN_LINES_PER_FILE_BLOCK + 1
    const body = Array.from({ length: lines }, () => 'x').join('\n')
    const payload = `FILE: big.ts\nCONTENT:\n${body}`
    const hints = computeSemanticDiffLineHints(payload)
    expect(hints).toHaveLength(1)
    expect(hints[0]).toContain('big.ts')
    expect(hints[0]).toContain(String(lines))
  })

  it('hints when payload is huge but no FILE blocks parse', () => {
    const filler = 'a'.repeat(SEMANTIC_DIFF_FILE.HINT_MIN_CHARS_WHEN_NO_FILE_BLOCKS_PARSED)
    const hints = computeSemanticDiffLineHints(filler)
    expect(hints).toHaveLength(1)
    expect(hints[0]).toContain('No FILE:')
  })
})
