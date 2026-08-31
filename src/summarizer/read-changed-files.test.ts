import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readChangedFilesWithBudget } from './read-changed-files.js'

describe('readChangedFilesWithBudget', () => {
  let testDir: string
  let testId = 0

  beforeEach(async () => {
    testId += 1
    testDir = join(tmpdir(), `vibe-gate-test-${Date.now()}-${testId}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('reads multiple changed files correctly within budget', async () => {
    const file1 = 'file1.ts'
    const file2 = 'file2.ts'
    const content1 = 'console.log("hello file 1")\n'
    const content2 = 'console.log("hello file 2")\n'

    await writeFile(join(testDir, file1), content1)
    await writeFile(join(testDir, file2), content2)

    const result = await readChangedFilesWithBudget(testDir, [file1, file2], 1000)

    expect(result.budgetExceeded).toBe(false)
    expect(result.contents).toHaveLength(2)
    expect(result.contents[0].path).toBe(file1)
    expect(result.contents[0].content).toBe(content1)
    expect(result.contents[1].path).toBe(file2)
    expect(result.contents[1].content).toBe(content2)
  })

  it('respects budget limits and marks budgetExceeded', async () => {
    const file1 = 'file1.ts'
    const file2 = 'file2.ts'
    const longContent = 'const x = 1;\n'.repeat(100)

    await writeFile(join(testDir, file1), longContent)
    await writeFile(join(testDir, file2), longContent)

    // Set maxTokens low enough so budget is exceeded
    const result = await readChangedFilesWithBudget(testDir, [file1, file2], 10, false)

    expect(result.budgetExceeded).toBe(true)
  })

  it('handles line ranges correctly', async () => {
    const file1 = 'file1.ts:1-2'
    await writeFile(join(testDir, 'file1.ts'), 'line1\nline2\nline3\nline4\n')

    const result = await readChangedFilesWithBudget(testDir, [file1], 1000)

    expect(result.budgetExceeded).toBe(false)
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].content).toContain('1 | line1')
    expect(result.contents[0].content).toContain('2 | line2')
    expect(result.contents[0].content).not.toContain('3 | line3')
  })

  it('benchmark reading 50 files', async () => {
    const numFiles = 50
    const files: string[] = []

    for (let i = 0; i < numFiles; i++) {
      const fileName = `file_${i}.ts`
      files.push(fileName)
      const lines = Array.from({ length: 50 }, (_, j) => `// File ${i} line ${j}: export const val${j} = ${j};`)
      await writeFile(join(testDir, fileName), lines.join('\n'))
    }

    const start = performance.now()
    const result = await readChangedFilesWithBudget(testDir, files, 100000, false)
    const duration = performance.now() - start

    expect(result.contents).toHaveLength(numFiles)
    console.log(`[BENCHMARK] Reading ${numFiles} files took ${duration.toFixed(2)}ms`)
  })
})
