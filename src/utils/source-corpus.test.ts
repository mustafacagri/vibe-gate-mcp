import { describe, expect, it } from 'vitest'
import { validateSourceCorpus } from '@/utils/source-corpus'

const block = 'FILE: same.ts\nCONTENT:\nexport const tail = 1\n'

describe('complete source slot guard', () => {
  it.each([1, 10])('accepts %i actual blocks', count => {
    expect(validateSourceCorpus(block.repeat(count))).toBe(count)
  })
  it.each([11, 21])('rejects %i duplicate blocks without path or content deduplication', count => {
    expect(() => validateSourceCorpus(block.repeat(count))).toThrow('full content slots')
  })
  it.each(['README.md', 'package.json', 'config.jsonc', '.env.local'])('rejects non-source endpoint %s', path => {
    expect(() => validateSourceCorpus(`FILE: ${path}\nCONTENT:\nconst snippet = 1`)).toThrow('Non-source endpoint')
  })
  it.each(['--- a/a.ts\n+++ b/a.ts\n@@ x', 'FILE: a.ts\nmissing marker', 'summary'])(
    'rejects malformed payload %s',
    corpus => {
      expect(() => validateSourceCorpus(corpus)).toThrow()
    }
  )
})
