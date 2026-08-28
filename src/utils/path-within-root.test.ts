import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { isResolvedPathWithinRoot } from '@/utils/path-within-root'

describe('isResolvedPathWithinRoot', () => {
  const root = resolve(tmpdir(), 'vibe-gate-path-root-test')

  it('allows same path', () => expect(isResolvedPathWithinRoot(root, root)).toBe(true))

  it('allows nested path', () => {
    const inner = resolve(root, 'nested', 'b.txt')
    expect(isResolvedPathWithinRoot(root, inner)).toBe(true)
  })

  it('rejects path outside root via parent segment', () => {
    const escaped = resolve(root, '..', 'vibe-gate-escaped-sibling', 'x.txt')
    expect(isResolvedPathWithinRoot(root, escaped)).toBe(false)
  })
})
