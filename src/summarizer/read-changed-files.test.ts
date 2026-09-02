import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readChangedFilesWithBudget, readChangedFileContent } from './read-changed-files.js'

describe('readChangedFilesWithBudget', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vibe-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('reads multiple files within token budget and preserves order', async () => {
    await writeFile(join(tempDir, 'fileA.txt'), 'Line 1 in A\nLine 2 in A', 'utf-8')
    await writeFile(join(tempDir, 'fileB.txt'), 'Line 1 in B\nLine 2 in B', 'utf-8')

    const res = await readChangedFilesWithBudget(tempDir, ['fileA.txt', 'fileB.txt'], 1000, false)

    expect(res.budgetExceeded).toBe(false)
    expect(res.contents).toHaveLength(2)
    expect(res.contents[0].path).toBe('fileA.txt')
    expect(res.contents[0].content).toBe('Line 1 in A\nLine 2 in A')
    expect(res.contents[1].path).toBe('fileB.txt')
    expect(res.contents[1].content).toBe('Line 1 in B\nLine 2 in B')
  })

  it('respects line range specifications in file paths', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n')
    await writeFile(join(tempDir, 'fileLines.txt'), lines, 'utf-8')

    const res = await readChangedFilesWithBudget(tempDir, ['fileLines.txt:5-7'], 1000, false)

    expect(res.contents).toHaveLength(1)
    expect(res.contents[0].content).toBe('5 | Line 5\n6 | Line 6\n7 | Line 7')
  })

  it('handles unreadable and outside workspace files gracefully', async () => {
    await writeFile(join(tempDir, 'valid.txt'), 'Valid file', 'utf-8')

    const res = await readChangedFilesWithBudget(
      tempDir,
      ['valid.txt', 'nonexistent.txt', '../outside.txt'],
      1000,
      false
    )

    expect(res.contents).toHaveLength(3)
    expect(res.contents[0].content).toBe('Valid file')
    expect(res.contents[1].content).toBe('(unreadable)')
    expect(res.contents[2].content).toBe('(access denied: path outside workspace)')
  })

  it('triggers budgetExceeded when token budget is exhausted', async () => {
    await writeFile(join(tempDir, 'file1.txt'), 'A'.repeat(500), 'utf-8')
    await writeFile(join(tempDir, 'file2.txt'), 'B'.repeat(500), 'utf-8')

    // Set maxTokens to a low number (e.g., 50 tokens) so budget is exceeded
    const res = await readChangedFilesWithBudget(tempDir, ['file1.txt', 'file2.txt'], 50, false)

    expect(res.budgetExceeded).toBe(true)
  })

  it('functions properly with readChangedFileContent directly', async () => {
    await writeFile(join(tempDir, 'sample.ts'), 'console.log("hello")', 'utf-8')

    const content = await readChangedFileContent(tempDir, 'sample.ts')
    expect(content.content).toBe('console.log("hello")')
    expect(content.truncated).toBe(false)
  })
})
