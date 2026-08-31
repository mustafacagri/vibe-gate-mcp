import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractCriticalSnippets } from '@/summarizer/extract-critical-snippets'

describe('extractCriticalSnippets', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = join(tmpdir(), `vibe-gate-test-${Date.now()}-${randomUUID()}`)
    await mkdir(testDir, { recursive: true })

    // Create sample directory structure
    await mkdir(join(testDir, 'src/auth'), { recursive: true })
    await mkdir(join(testDir, 'src/db'), { recursive: true })
    await mkdir(join(testDir, 'src/api'), { recursive: true })
    await mkdir(join(testDir, 'node_modules/auth-package'), { recursive: true })
    await mkdir(join(testDir, '.git/hooks'), { recursive: true })

    // Matching files
    await writeFile(join(testDir, 'src/auth/login.ts'), '// auth login')
    await writeFile(join(testDir, 'src/auth/session.ts'), '// session')
    await writeFile(join(testDir, 'src/db/schema.prisma'), '// db schema')
    await writeFile(join(testDir, 'src/api/route.ts'), '// api route')

    // Ignored files (in node_modules and .git)
    await writeFile(join(testDir, 'node_modules/auth-package/index.ts'), '// ignored auth')
    await writeFile(join(testDir, '.git/hooks/session.sh'), '// ignored session')

    // Unmatched file
    await writeFile(join(testDir, 'src/utils.ts'), '// utils')

    // Generate > 10 files for auth to test MAX_CRITICAL_FILES_PER_CATEGORY limit
    for (let i = 0; i < 15; i++) {
      await writeFile(join(testDir, `src/auth/token_${i}.ts`), `// token ${i}`)
    }
  })

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('correctly extracts critical snippets and enforces category limits and scan ignores', async () => {
    const result = await extractCriticalSnippets(testDir)

    // Auth files should be capped at 10 (MAX_CRITICAL_FILES_PER_CATEGORY)
    expect(result.auth).toHaveLength(10)
    expect(
      result.auth.every(
        f =>
          f.toLowerCase().includes('auth') ||
          f.toLowerCase().includes('token') ||
          f.toLowerCase().includes('session') ||
          f.toLowerCase().includes('login')
      )
    ).toBe(true)

    // Node modules and .git ignored
    expect(result.auth.some(f => f.includes('node_modules') || f.includes('.git'))).toBe(false)
    expect(result.db.some(f => f.includes('node_modules') || f.includes('.git'))).toBe(false)
    expect(result.api.some(f => f.includes('node_modules') || f.includes('.git'))).toBe(false)

    // DB and API files matched
    expect(result.db).toContain('src/db/schema.prisma')
    expect(result.api).toContain('src/api/route.ts')
  })
})

describe('extractCriticalSnippets Benchmark', () => {
  let benchDir: string

  beforeAll(async () => {
    benchDir = join(tmpdir(), `vibe-gate-bench-${Date.now()}-${randomUUID()}`)
    await mkdir(benchDir, { recursive: true })

    // Build a multi-level nested structure: 3 levels deep, 5 dirs per level, 10 files per dir
    // Total dirs: ~155 dirs, Total files: ~1550 files
    async function populateTree(currentPath: string, depth: number) {
      if (depth > 3) return
      for (let i = 0; i < 5; i++) {
        const dirName = `dir_d${depth}_i${i}`
        const subDirPath = join(currentPath, dirName)
        await mkdir(subDirPath, { recursive: true })

        for (let j = 0; j < 10; j++) {
          let fileName: string
          if (j % 3 === 0) {
            fileName = `auth_handler_${j}.ts`
          } else if (j % 3 === 1) {
            fileName = `db_model_${j}.ts`
          } else {
            fileName = `api_endpoint_${j}.ts`
          }
          await writeFile(join(subDirPath, fileName), '// content')
        }

        await populateTree(subDirPath, depth + 1)
      }
    }

    await populateTree(benchDir, 1)
  }, 30000)

  afterAll(async () => {
    await rm(benchDir, { recursive: true, force: true })
  })

  it('benchmarks performance', async () => {
    const iterations = 5
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      await extractCriticalSnippets(benchDir)
    }
    const end = performance.now()
    const avgDuration = (end - start) / iterations
    expect(avgDuration).toBeGreaterThan(0)
    console.log(`[BENCHMARK BASELINE] Average execution time over ${iterations} runs: ${avgDuration.toFixed(2)}ms`)
  })
})
