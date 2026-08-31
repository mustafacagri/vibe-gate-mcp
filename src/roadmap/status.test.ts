import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PATHS } from '@/constants'
import { readStatus, writeStatus, updateConflictCount, updatePhaseOnAccept } from '@/roadmap/status'

const TEST_DIR = join(process.cwd(), '.test-tmp-status')

describe('status.ts', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('returns DEFAULT_STATUS when no files exist', async () => {
    const status = await readStatus(TEST_DIR)
    expect(status).toEqual({
      version: '0.1.0',
      currentPhase: 0,
      lastCompletedTask: null,
      conflictCount: 0,
      lastUpdated: null
    })
  })

  it('reads status from .vibe/status.json when valid', async () => {
    const vibeDir = join(TEST_DIR, PATHS.VIBE_DIR)
    await mkdir(vibeDir, { recursive: true })
    await writeFile(
      join(TEST_DIR, PATHS.VIBE_STATUS),
      JSON.stringify({
        version: '0.1.0',
        currentPhase: 2,
        lastCompletedTask: '2.1.0',
        conflictCount: 1,
        lastUpdated: '2025-01-01'
      })
    )

    const status = await readStatus(TEST_DIR)
    expect(status.currentPhase).toBe(2)
    expect(status.lastCompletedTask).toBe('2.1.0')
    expect(status.conflictCount).toBe(1)
  })

  it('falls back to .vibe/ROADMAP.md when .vibe/status.json is missing or invalid', async () => {
    const vibeDir = join(TEST_DIR, PATHS.VIBE_DIR)
    await mkdir(vibeDir, { recursive: true })
    await writeFile(join(TEST_DIR, PATHS.VIBE_ROADMAP), '# Roadmap\n- [x] Phase 1.2.3 task done\n')

    const status = await readStatus(TEST_DIR)
    expect(status.lastCompletedTask).toBe('1.2.3')
    expect(status.currentPhase).toBe(1)
  })

  it('falls back to docs/ROADMAP.md when .vibe/ROADMAP.md is missing', async () => {
    const docsDir = join(TEST_DIR, 'docs')
    await mkdir(docsDir, { recursive: true })
    await writeFile(join(TEST_DIR, PATHS.DOCS_ROADMAP), '# Docs Roadmap\n- [x] Phase 3.4.1 task done\n')

    const status = await readStatus(TEST_DIR)
    expect(status.lastCompletedTask).toBe('3.4.1')
    expect(status.currentPhase).toBe(3)
  })

  it('prefers .vibe/ROADMAP.md over docs/ROADMAP.md if both exist', async () => {
    const vibeDir = join(TEST_DIR, PATHS.VIBE_DIR)
    const docsDir = join(TEST_DIR, 'docs')
    await mkdir(vibeDir, { recursive: true })
    await mkdir(docsDir, { recursive: true })

    await writeFile(join(TEST_DIR, PATHS.VIBE_ROADMAP), '# Vibe Roadmap\n- [x] Phase 1.1.0\n')
    await writeFile(join(TEST_DIR, PATHS.DOCS_ROADMAP), '# Docs Roadmap\n- [x] Phase 2.2.0\n')

    const status = await readStatus(TEST_DIR)
    expect(status.lastCompletedTask).toBe('1.1.0')
    expect(status.currentPhase).toBe(1)
  })

  it('writes status and updates lastUpdated', async () => {
    await writeStatus(TEST_DIR, {
      version: '0.1.0',
      currentPhase: 1,
      lastCompletedTask: '1.0.0',
      conflictCount: 0,
      lastUpdated: null
    })

    const status = await readStatus(TEST_DIR)
    expect(status.currentPhase).toBe(1)
    expect(status.lastCompletedTask).toBe('1.0.0')
    expect(status.lastUpdated).toBeTruthy()
  })

  it('updates conflict count', async () => {
    await updateConflictCount(TEST_DIR, 1)
    let status = await readStatus(TEST_DIR)
    expect(status.conflictCount).toBe(1)

    await updateConflictCount(TEST_DIR, 2)
    status = await readStatus(TEST_DIR)
    expect(status.conflictCount).toBe(3)
  })

  it('updates phase on accept', async () => {
    await updatePhaseOnAccept(TEST_DIR, '2.1.0')
    const status = await readStatus(TEST_DIR)
    expect(status.lastCompletedTask).toBe('2.1.0')
    expect(status.currentPhase).toBe(2)
  })
})
