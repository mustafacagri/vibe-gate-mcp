import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractCriticalSnippets } from './extract-critical-snippets.js'

describe('extractCriticalSnippets', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `vibe-snippets-test-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('extracts files matching Auth, DB, and API patterns into respective categories', async () => {
    await mkdir(join(testDir, 'src', 'auth'), { recursive: true })
    await mkdir(join(testDir, 'src', 'prisma'), { recursive: true })
    await mkdir(join(testDir, 'src', 'api'), { recursive: true })

    await writeFile(join(testDir, 'src', 'auth', 'login.ts'), 'export const login = () => {}')
    await writeFile(join(testDir, 'src', 'prisma', 'schema.prisma'), 'datasource db {}')
    await writeFile(join(testDir, 'src', 'api', 'handler.ts'), 'export const handler = () => {}')
    await writeFile(join(testDir, 'src', 'utils.ts'), 'export const util = () => {}')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toEqual(['src/auth/login.ts'])
    expect(result.db).toEqual(['src/prisma/schema.prisma'])
    expect(result.api).toEqual(['src/api/handler.ts'])
  })

  it('ignores files in SCAN_IGNORE_DIRS directories', async () => {
    await mkdir(join(testDir, 'node_modules', 'auth'), { recursive: true })
    await mkdir(join(testDir, '.git', 'hooks'), { recursive: true })
    await mkdir(join(testDir, 'dist', 'api'), { recursive: true })
    await mkdir(join(testDir, '.vibe', 'db'), { recursive: true })
    await mkdir(join(testDir, '.yarn', 'cache'), { recursive: true })

    await writeFile(join(testDir, 'node_modules', 'auth', 'login.ts'), 'content')
    await writeFile(join(testDir, '.git', 'hooks', 'session.sh'), 'content')
    await writeFile(join(testDir, 'dist', 'api', 'server.js'), 'content')
    await writeFile(join(testDir, '.vibe', 'db', 'schema.json'), 'content')
    await writeFile(join(testDir, '.yarn', 'cache', 'token.js'), 'content')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toHaveLength(0)
    expect(result.db).toHaveLength(0)
    expect(result.api).toHaveLength(0)
  })

  it('caps the extracted files at MAX_CRITICAL_FILES_PER_CATEGORY (10)', async () => {
    const authDir = join(testDir, 'auth')
    await mkdir(authDir, { recursive: true })

    for (let i = 1; i <= 15; i++) {
      await writeFile(join(authDir, `login_${i}.ts`), 'content')
    }

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toHaveLength(10)
  })

  it('returns empty lists for empty workspace or non-existent workspace root', async () => {
    const emptyResult = await extractCriticalSnippets(testDir)

    expect(emptyResult.auth).toHaveLength(0)
    expect(emptyResult.db).toHaveLength(0)
    expect(emptyResult.api).toHaveLength(0)

    const nonExistentPath = join(testDir, 'non-existent-folder')
    const nonExistentResult = await extractCriticalSnippets(nonExistentPath)

    expect(nonExistentResult.auth).toHaveLength(0)
    expect(nonExistentResult.db).toHaveLength(0)
    expect(nonExistentResult.api).toHaveLength(0)
  })

  it('matches patterns case-insensitively', async () => {
    await mkdir(join(testDir, 'AUTH'), { recursive: true })
    await mkdir(join(testDir, 'API'), { recursive: true })

    await writeFile(join(testDir, 'AUTH', 'Login.ts'), 'content')
    await writeFile(join(testDir, 'API', 'Route.ts'), 'content')

    const result = await extractCriticalSnippets(testDir)

    expect(result.auth).toEqual(['AUTH/Login.ts'])
    expect(result.api).toEqual(['API/Route.ts'])
  })
})
