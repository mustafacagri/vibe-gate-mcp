import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  readChangedFilesWithBudget,
  readChangedFileContent,
  parseImportsFromContent,
  formatFileContentsForPrompt
} from './read-changed-files.js'

describe('read-changed-files', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibe-read-files-test-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('readChangedFileContent', () => {
    it('reads a file within workspace successfully', async () => {
      const filePath = 'test.ts'
      await writeFile(join(testDir, filePath), 'line 1\nline 2\nline 3', 'utf-8')

      const result = await readChangedFileContent(testDir, filePath)
      expect(result.path).toBe(filePath)
      expect(result.content).toBe('line 1\nline 2\nline 3')
      expect(result.truncated).toBe(false)
    })

    it('denies access to paths outside workspace', async () => {
      const result = await readChangedFileContent(testDir, '../outside.ts')
      expect(result.content).toContain('access denied')
    })
  })

  describe('parseImportsFromContent', () => {
    it('extracts relative and alias imports', () => {
      const code = `
        import { foo } from './foo'
        import { bar } from '@/components/bar'
        import fs from 'node:fs'
        const baz = require('../baz')
      `
      const imports = parseImportsFromContent('src/index.ts', code)
      expect(imports).toEqual(['./foo', '@/components/bar', '../baz'])
    })
  })

  describe('readChangedFilesWithBudget', () => {
    it('reads changed files and expands relative imports within budget', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true })
      await writeFile(
        join(testDir, 'src', 'main.ts'),
        "import { helper } from './helper'\nconsole.log(helper)",
        'utf-8'
      )
      await writeFile(join(testDir, 'src', 'helper.ts'), 'export const helper = 42', 'utf-8')

      const result = await readChangedFilesWithBudget(testDir, ['src/main.ts'], 1000, true)

      expect(result.budgetExceeded).toBe(false)
      expect(result.expandedFiles).toEqual(['src/helper.ts'])
      expect(result.contents).toHaveLength(2)
      expect(result.contents[0].path).toBe('src/main.ts')
      expect(result.contents[1].path).toBe('src/helper.ts')
      expect(result.contents[1].content).toBe('export const helper = 42')
    })

    it('stops expanding when budget is exceeded', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true })
      await writeFile(
        join(testDir, 'src', 'main.ts'),
        "import { helper } from './helper'\nconsole.log(helper)",
        'utf-8'
      )
      await writeFile(join(testDir, 'src', 'helper.ts'), 'export const helper = ' + 'x'.repeat(500), 'utf-8')

      // Very small budget: enough for main.ts, but not for helper.ts
      const result = await readChangedFilesWithBudget(testDir, ['src/main.ts'], 30, true)

      expect(result.expandedFiles).toEqual(['src/helper.ts'])
      expect(result.budgetExceeded).toBe(true)
      expect(result.contents).toHaveLength(1)
      expect(result.contents[0].path).toBe('src/main.ts')
    })

    it('handles multiple expanded files in correct order', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true })
      let mainContent = ''
      const expandedCount = 10
      for (let i = 0; i < expandedCount; i++) {
        mainContent += `import { dep${i} } from './dep${i}'\n`
        await writeFile(join(testDir, 'src', `dep${i}.ts`), `export const dep${i} = ${i}\n`, 'utf-8')
      }
      await writeFile(join(testDir, 'src', 'main.ts'), mainContent, 'utf-8')

      const result = await readChangedFilesWithBudget(testDir, ['src/main.ts'], 50000, true)

      expect(result.budgetExceeded).toBe(false)
      expect(result.expandedFiles).toHaveLength(expandedCount)
      expect(result.contents).toHaveLength(expandedCount + 1)
      expect(result.contents[0].path).toBe('src/main.ts')
      for (let i = 0; i < expandedCount; i++) {
        expect(result.contents[i + 1].path).toBe(`src/dep${i}.ts`)
      }
    })

    it('measures baseline performance for reading multiple expanded files', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true })
      let mainContent = ''
      const fileCount = 15
      for (let i = 0; i < fileCount; i++) {
        mainContent += `import { dep${i} } from './dep${i}'\n`
        await writeFile(join(testDir, 'src', `dep${i}.ts`), `export const dep${i} = ${i}\n`.repeat(10), 'utf-8')
      }
      await writeFile(join(testDir, 'src', 'main.ts'), mainContent, 'utf-8')

      const iterations = 50
      const start = performance.now()
      let lastResult
      for (let i = 0; i < iterations; i++) {
        lastResult = await readChangedFilesWithBudget(testDir, ['src/main.ts'], 50000, true)
      }
      const duration = performance.now() - start
      console.log(
        `[Benchmark] ${iterations} iterations with ${fileCount} expanded files took ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(2)}ms/op)`
      )
      expect(lastResult?.expandedFiles).toHaveLength(fileCount)
    })
  })

  describe('formatFileContentsForPrompt', () => {
    it('formats contents into prompt text', () => {
      const contents = [
        { path: 'src/main.ts', content: 'const a = 1', truncated: false },
        { path: 'src/helper.ts', content: 'const b = 2', truncated: false }
      ]
      const formatted = formatFileContentsForPrompt(contents, ['src/main.ts'], ['src/helper.ts'])
      expect(formatted).toContain('[src/main.ts]:\nconst a = 1')
      expect(formatted).toContain('[src/helper.ts] [import]:\nconst b = 2')
    })
  })
})
