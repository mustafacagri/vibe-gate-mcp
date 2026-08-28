import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { SEMANTIC_DIFF_FILE } from '@/constants'
import {
  loadSemanticDiffFromWorkspacePath,
  parseSemanticDiffFileBody,
  resolveSafePathInWorkspace,
  stripUtf8Bom
} from '@/utils/resolve-semantic-diff-from-path'

describe('stripUtf8Bom', () => {
  it('removes BOM for reliable JSON detection', () => {
    const withBom = '\ufeff{"semanticDiff":"x"}'
    expect(stripUtf8Bom(withBom).startsWith('{')).toBe(true)
  })
})

describe('parseSemanticDiffFileBody', () => {
  it('returns raw text when not JSON', () => {
    const raw = 'FILE: a.ts\nCONTENT:\nexport const x = 1\n'
    expect(parseSemanticDiffFileBody(raw)).toEqual({ ok: true, semanticDiff: raw })
  })

  it('parses JSON after UTF-8 BOM', () => {
    const inner = 'FILE: b.ts\nCONTENT:\nok\n'
    const json = JSON.stringify({ semanticDiff: inner })
    const withBom = `\ufeff${json}`
    expect(parseSemanticDiffFileBody(withBom)).toEqual({ ok: true, semanticDiff: inner })
  })

  it('extracts semanticDiff from JSON wrapper', () => {
    const inner = 'FILE: b.ts\nCONTENT:\nexport const y = 2\n'
    const file = JSON.stringify({ semanticDiff: inner })
    expect(parseSemanticDiffFileBody(file)).toEqual({ ok: true, semanticDiff: inner })
  })

  it('rejects JSON without semanticDiff string', () => {
    const r = parseSemanticDiffFileBody('{"files":[]}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('JSON_SCHEMA')
  })
})

describe('resolveSafePathInWorkspace', () => {
  const root = join(tmpdir(), 'vibe-gate-test-root')

  it('rejects absolute paths', () => {
    const r = resolveSafePathInWorkspace(root, '/etc/passwd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('ABSOLUTE_PATH_FORBIDDEN')
  })

  it('rejects traversal outside workspace', () => {
    const r = resolveSafePathInWorkspace(join(root, 'ws'), '../../../etc/passwd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('PATH_OUTSIDE_WORKSPACE')
  })
})

describe('loadSemanticDiffFromWorkspacePath', () => {
  it('reads raw semantic diff file', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vg-sem-'))
    const rel = '.vibe/payload.txt'
    await mkdir(join(base, '.vibe'), { recursive: true })
    const body = 'FILE: x.ts\nCONTENT:\nexport {}\n'
    await writeFile(join(base, rel), body, 'utf8')
    const r = await loadSemanticDiffFromWorkspacePath(base, rel)
    expect(r).toEqual({ ok: true, semanticDiff: body, resolvedFromPath: resolve(base, rel) })
  })

  it('reads JSON wrapper file', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vg-sem-'))
    const rel = 'payload.json'
    const inner = 'FILE: z.ts\nCONTENT:\n// ok\n'
    await writeFile(join(base, rel), JSON.stringify({ semanticDiff: inner }), 'utf8')
    const r = await loadSemanticDiffFromWorkspacePath(base, rel)
    expect(r).toEqual({ ok: true, semanticDiff: inner, resolvedFromPath: resolve(base, rel) })
  })

  it('rejects file larger than MAX_BYTES', async () => {
    const base = await mkdtemp(join(tmpdir(), 'vg-sem-'))
    const rel = 'huge.txt'
    const buf = Buffer.alloc(SEMANTIC_DIFF_FILE.MAX_BYTES + 1, 0x41)
    await writeFile(join(base, rel), buf)
    const r = await loadSemanticDiffFromWorkspacePath(base, rel)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('FILE_TOO_LARGE')
  })
})
