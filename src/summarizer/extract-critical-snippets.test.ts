import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MAX_CRITICAL_FILES_PER_CATEGORY } from '@/constants'
import { extractCriticalSnippets } from '@/summarizer/extract-critical-snippets'

describe('extractCriticalSnippets', () => {
  const testDir = join(process.cwd(), 'temp-test-critical-snippets')

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('extracts matching files across auth, db, and api categories', async () => {
    await mkdir(join(testDir, 'src/auth'), { recursive: true })
    await mkdir(join(testDir, 'src/database'), { recursive: true })
    await mkdir(join(testDir, 'src/routes'), { recursive: true })

    await writeFile(join(testDir, 'src/auth/login.ts'), '')
    await writeFile(join(testDir, 'src/database/schema.prisma'), '')
    await writeFile(join(testDir, 'src/routes/api.ts'), '')
    await writeFile(join(testDir, 'src/readme.md'), '')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toEqual(['src/auth/login.ts'])
    expect(result.db).toEqual(['src/database/schema.prisma'])
    expect(result.api).toEqual(['src/routes/api.ts'])
  })

  it('ignores directories present in SCAN_IGNORE_SET', async () => {
    await mkdir(join(testDir, 'node_modules/auth'), { recursive: true })
    await mkdir(join(testDir, '.git/hooks'), { recursive: true })
    await mkdir(join(testDir, 'src'), { recursive: true })

    await writeFile(join(testDir, 'node_modules/auth/index.ts'), '')
    await writeFile(join(testDir, '.git/hooks/session'), '')
    await writeFile(join(testDir, 'src/session.ts'), '')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toEqual(['src/session.ts'])
    expect(result.auth).not.toContain('node_modules/auth/index.ts')
    expect(result.auth).not.toContain('.git/hooks/session')
  })

  it('places a file in multiple categories if it matches multiple patterns', async () => {
    await mkdir(join(testDir, 'src/api'), { recursive: true })
    await writeFile(join(testDir, 'src/api/auth-session.ts'), '')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toContain('src/api/auth-session.ts')
    expect(result.api).toContain('src/api/auth-session.ts')
  })

  it('caps output per category to MAX_CRITICAL_FILES_PER_CATEGORY', async () => {
    await mkdir(join(testDir, 'src/auth'), { recursive: true })

    const count = MAX_CRITICAL_FILES_PER_CATEGORY + 5
    for (let i = 0; i < count; i++) {
      const num = i.toString().padStart(2, '0')
      await writeFile(join(testDir, `src/auth/session_${num}.ts`), '')
    }

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toHaveLength(MAX_CRITICAL_FILES_PER_CATEGORY)
  })

  it('handles empty or non-existent workspace directory gracefully', async () => {
    const nonExistentDir = join(testDir, 'non-existent-folder')
    const result = await extractCriticalSnippets(nonExistentDir)

    expect(result.auth).toEqual([])
    expect(result.db).toEqual([])
    expect(result.api).toEqual([])
  })

  it('returns sorted file lists within each category', async () => {
    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(join(testDir, 'src/token.ts'), '')
    await writeFile(join(testDir, 'src/auth.ts'), '')
    await writeFile(join(testDir, 'src/jwt.ts'), '')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toEqual(['src/auth.ts', 'src/jwt.ts', 'src/token.ts'])
  })
})
