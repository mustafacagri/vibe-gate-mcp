import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractCriticalSnippets } from '@/summarizer/extract-critical-snippets'

const testDir = join(process.cwd(), '.vibe-extract-snippets-test')

describe('extractCriticalSnippets', () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('categorizes matching files for Auth, DB, and API patterns', async () => {
    await mkdir(join(testDir, 'src', 'auth'), { recursive: true })
    await mkdir(join(testDir, 'src', 'database'), { recursive: true })
    await mkdir(join(testDir, 'src', 'api'), { recursive: true })

    await writeFile(join(testDir, 'src', 'auth', 'login.ts'), '// auth')
    await writeFile(join(testDir, 'src', 'database', 'schema.prisma'), '// db')
    await writeFile(join(testDir, 'src', 'api', 'handler.ts'), '// api')
    await writeFile(join(testDir, 'src', 'utils.ts'), '// non-matching')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toContain('src/auth/login.ts')
    expect(result.db).toContain('src/database/schema.prisma')
    expect(result.api).toContain('src/api/handler.ts')
  })

  it('caps each category to MAX_CRITICAL_FILES_PER_CATEGORY (10)', async () => {
    const authDir = join(testDir, 'src', 'auth-tests')
    await mkdir(authDir, { recursive: true })

    for (let i = 0; i < 15; i++) {
      await writeFile(join(authDir, `auth-file-${i}.ts`), '// auth')
    }

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toHaveLength(10)
  })

  it('ignores configured directories like node_modules, .git, dist, .vibe, .yarn', async () => {
    const ignoredDirs = ['node_modules', '.git', 'dist', '.vibe', '.yarn']

    for (const dir of ignoredDirs) {
      const fullDir = join(testDir, dir)
      await mkdir(fullDir, { recursive: true })
      await writeFile(join(fullDir, 'auth-secret.ts'), '// auth in ignored dir')
    }

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toEqual([])
    expect(result.db).toEqual([])
    expect(result.api).toEqual([])
  })

  it('matches patterns case-insensitively', async () => {
    await mkdir(join(testDir, 'SRC', 'AUTH'), { recursive: true })
    await writeFile(join(testDir, 'SRC', 'AUTH', 'SESSION_MANAGER.TS'), '// auth')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toContain('SRC/AUTH/SESSION_MANAGER.TS')
  })

  it('handles non-existent or unreadable workspace gracefully', async () => {
    const nonExistentPath = join(testDir, 'does-not-exist')

    const result = await extractCriticalSnippets(nonExistentPath)

    expect(result).toEqual({
      auth: [],
      db: [],
      api: []
    })
  })
})
