import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readChangedFilesWithBudget } from './read-changed-files.js'
import { CONTEXT_LIMITS } from '@/constants'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('readChangedFilesWithBudget', () => {
  const testDir = join(tmpdir(), 'read-changed-files-test-' + Date.now())

  beforeEach(async () => {
    vi.stubEnv('IMPORT_EXPANSION_ENABLED', 'true')
    // @ts-expect-error - overriding constant for testing
    CONTEXT_LIMITS.IMPORT_EXPANSION_ENABLED = true
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    // @ts-expect-error - restoring constant for testing
    CONTEXT_LIMITS.IMPORT_EXPANSION_ENABLED = false
    await rm(testDir, { recursive: true, force: true })
  })

  it('reads changed files within budget', async () => {
    await writeFile(join(testDir, 'a.ts'), 'console.log("hello")', 'utf-8')
    await writeFile(join(testDir, 'b.ts'), 'console.log("world")', 'utf-8')

    const result = await readChangedFilesWithBudget(testDir, ['a.ts', 'b.ts'], 1000, false)
    expect(result.budgetExceeded).toBe(false)
    expect(result.contents).toHaveLength(2)
    expect(result.contents[0].path).toBe('a.ts')
    expect(result.contents[1].path).toBe('b.ts')
  })

  it('handles budget exceeded for main files', async () => {
    await writeFile(join(testDir, 'a.ts'), 'line\n'.repeat(100), 'utf-8')
    await writeFile(join(testDir, 'b.ts'), 'line\n'.repeat(100), 'utf-8')

    // Very low token budget
    const result = await readChangedFilesWithBudget(testDir, ['a.ts', 'b.ts'], 5, false)
    expect(result.budgetExceeded).toBe(true)
  })

  it('expands imports and reads expanded files in order when expandImports=true', async () => {
    await writeFile(join(testDir, 'a.ts'), "import { b } from './b'\nimport { c } from './c'", 'utf-8')
    await writeFile(join(testDir, 'b.ts'), 'export const b = 1', 'utf-8')
    await writeFile(join(testDir, 'c.ts'), 'export const c = 2', 'utf-8')

    const result = await readChangedFilesWithBudget(testDir, ['a.ts'], 1000, true)
    expect(result.budgetExceeded).toBe(false)
    expect(result.expandedFiles).toEqual(['b.ts', 'c.ts'])
    expect(result.contents.map(c => c.path)).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })

  it('respects token budget when processing expanded files', async () => {
    await writeFile(join(testDir, 'a.ts'), "import { b } from './b'\nimport { c } from './c'", 'utf-8')
    await writeFile(join(testDir, 'b.ts'), 'export const b = "' + 'x'.repeat(200) + '"', 'utf-8')
    await writeFile(join(testDir, 'c.ts'), 'export const c = "' + 'y'.repeat(200) + '"', 'utf-8')

    // Set token limit sufficient for a.ts and b.ts (e.g. maxTokens ~ 25 tokens)
    const result = await readChangedFilesWithBudget(testDir, ['a.ts'], 25, true)
    expect(result.budgetExceeded).toBe(true)
    expect(result.contents.length).toBeLessThan(3)
  })
})
