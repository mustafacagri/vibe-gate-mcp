/**
 * Build FILE:…CONTENT: semanticDiff from workspace-relative source paths.
 * Preferred agent input: tiny MCP call with `files: string[]` only.
 */

import { describe, expect, it } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SEMANTIC_DIFF_PAYLOAD_MARKERS, SEMANTIC_DIFF_SOURCE_FILES } from '@/constants'
import { buildSemanticDiffFromSourceFiles } from '@/utils/build-semantic-diff-from-files'

describe('buildSemanticDiffFromSourceFiles', () => {
  it('builds FILE/CONTENT blocks for relative paths under workspace', async () => {
    const root = join(tmpdir(), `vibe-files-${Date.now()}`)
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1\n', 'utf8')
    await writeFile(join(root, 'src', 'b.ts'), 'export const b = 2\n', 'utf8')

    const result = await buildSemanticDiffFromSourceFiles(root, ['src/a.ts', 'src/b.ts'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.semanticDiff).toContain(`${SEMANTIC_DIFF_PAYLOAD_MARKERS.FILE_LINE_PREFIX}src/a.ts`)
    expect(result.semanticDiff).toContain(`${SEMANTIC_DIFF_PAYLOAD_MARKERS.CONTENT_LINE}`)
    expect(result.semanticDiff).toContain('export const a = 1')
    expect(result.semanticDiff).toContain('export const b = 2')
    expect(result.filesLoaded).toEqual(['src/a.ts', 'src/b.ts'])

    await rm(root, { recursive: true, force: true })
  })

  it('rejects empty files array', async () => {
    const result = await buildSemanticDiffFromSourceFiles('/tmp', [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('EMPTY_FILES')
  })

  it('rejects more than MAX_COUNT files', async () => {
    const paths = Array.from({ length: SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT + 1 }, (_, i) => `f${i}.ts`)
    const result = await buildSemanticDiffFromSourceFiles('/tmp', paths)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('TOO_MANY_FILES')
  })

  it('rejects absolute paths and path traversal', async () => {
    const abs = await buildSemanticDiffFromSourceFiles('/tmp', ['/etc/passwd'])
    expect(abs.ok).toBe(false)
    if (!abs.ok) expect(abs.code).toBe('ABSOLUTE_PATH_FORBIDDEN')

    const root = join(tmpdir(), `vibe-trav-${Date.now()}`)
    await mkdir(root, { recursive: true })
    const trav = await buildSemanticDiffFromSourceFiles(root, ['../outside.ts'])
    expect(trav.ok).toBe(false)
    if (!trav.ok) expect(trav.code).toBe('PATH_OUTSIDE_WORKSPACE')
    await rm(root, { recursive: true, force: true })
  })

  it('rejects missing files', async () => {
    const root = join(tmpdir(), `vibe-miss-${Date.now()}`)
    await mkdir(root, { recursive: true })
    const result = await buildSemanticDiffFromSourceFiles(root, ['nope.ts'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('FILE_NOT_FOUND')
    await rm(root, { recursive: true, force: true })
  })

  it('rejects total size exceeding MAX_TOTAL_BYTES', async () => {
    const root = join(tmpdir(), `vibe-large-${Date.now()}`)
    await mkdir(root, { recursive: true })
    // Each file is 0.6MB; 9 files = 5.4MB > MAX_TOTAL_BYTES (5MB)
    const largeContent = 'a'.repeat(600 * 1024)
    const paths: string[] = []
    for (let i = 0; i < 9; i++) {
      const relPath = `f${i}.txt`
      paths.push(relPath)
      await writeFile(join(root, relPath), largeContent, 'utf8')
    }

    const result = await buildSemanticDiffFromSourceFiles(root, paths)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('TOTAL_TOO_LARGE')
    await rm(root, { recursive: true, force: true })
  })
})
