import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PATHS } from '@/constants'
import {
  parseStatusFromRoadmap,
  readStatus,
  writeStatus,
  updateConflictCount,
  updatePhaseOnAccept
} from '@/roadmap/status'

describe('roadmap/status', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'vibe-status-test-'))
  })

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  describe('parseStatusFromRoadmap', () => {
    it('returns null if neither roadmap file exists', async () => {
      const result = await parseStatusFromRoadmap(tmpDir)
      expect(result).toBeNull()
    })

    it('returns null if roadmap files exist but contain no completed phase matches', async () => {
      await mkdir(join(tmpDir, '.vibe'), { recursive: true })
      await writeFile(join(tmpDir, PATHS.VIBE_ROADMAP), '# Roadmap\n- [ ] Task 1.0\n', 'utf-8')
      const result = await parseStatusFromRoadmap(tmpDir)
      expect(result).toBeNull()
    })

    it('parses status from .vibe/ROADMAP.md when present', async () => {
      await mkdir(join(tmpDir, '.vibe'), { recursive: true })
      await writeFile(join(tmpDir, PATHS.VIBE_ROADMAP), '# Roadmap\n- [x] Phase 1.1\n- [x] Phase 2.3.1\n', 'utf-8')
      const result = await parseStatusFromRoadmap(tmpDir)
      expect(result).toEqual({
        version: '0.1.0',
        currentPhase: 2,
        lastCompletedTask: '2.3.1',
        conflictCount: 0,
        lastUpdated: null
      })
    })

    it('parses status from docs/ROADMAP.md when .vibe/ROADMAP.md is absent', async () => {
      await mkdir(join(tmpDir, 'docs'), { recursive: true })
      await writeFile(join(tmpDir, PATHS.DOCS_ROADMAP), '# Roadmap\n- [x] Phase 3.1\n', 'utf-8')
      const result = await parseStatusFromRoadmap(tmpDir)
      expect(result).toEqual({
        version: '0.1.0',
        currentPhase: 3,
        lastCompletedTask: '3.1',
        conflictCount: 0,
        lastUpdated: null
      })
    })

    it('prefers .vibe/ROADMAP.md over docs/ROADMAP.md when both exist', async () => {
      await mkdir(join(tmpDir, '.vibe'), { recursive: true })
      await mkdir(join(tmpDir, 'docs'), { recursive: true })
      await writeFile(join(tmpDir, PATHS.VIBE_ROADMAP), '# Roadmap Vibe\n- [x] Phase 1.0\n', 'utf-8')
      await writeFile(join(tmpDir, PATHS.DOCS_ROADMAP), '# Roadmap Docs\n- [x] Phase 5.0\n', 'utf-8')
      const result = await parseStatusFromRoadmap(tmpDir)
      expect(result?.lastCompletedTask).toBe('1.0')
      expect(result?.currentPhase).toBe(1)
    })

    it('falls back to docs/ROADMAP.md if .vibe/ROADMAP.md has no valid matches', async () => {
      await mkdir(join(tmpDir, '.vibe'), { recursive: true })
      await mkdir(join(tmpDir, 'docs'), { recursive: true })
      await writeFile(join(tmpDir, PATHS.VIBE_ROADMAP), '# Roadmap Vibe\nNo matches here\n', 'utf-8')
      await writeFile(join(tmpDir, PATHS.DOCS_ROADMAP), '# Roadmap Docs\n- [x] Phase 4.2\n', 'utf-8')
      const result = await parseStatusFromRoadmap(tmpDir)
      expect(result?.lastCompletedTask).toBe('4.2')
      expect(result?.currentPhase).toBe(4)
    })
  })

  describe('readStatus and writeStatus', () => {
    it('reads default status when status.json and roadmaps are missing', async () => {
      const status = await readStatus(tmpDir)
      expect(status).toEqual({
        version: '0.1.0',
        currentPhase: 0,
        lastCompletedTask: null,
        conflictCount: 0,
        lastUpdated: null
      })
    })

    it('reads from status.json if valid JSON', async () => {
      await mkdir(join(tmpDir, '.vibe'), { recursive: true })
      const customStatus = {
        version: '0.2.0',
        currentPhase: 4,
        lastCompletedTask: '4.1',
        conflictCount: 2,
        lastUpdated: '2025-01-01'
      }
      await writeFile(join(tmpDir, PATHS.VIBE_STATUS), JSON.stringify(customStatus), 'utf-8')

      const status = await readStatus(tmpDir)
      expect(status).toEqual(customStatus)
    })

    it('falls back to roadmap when status.json fails schema validation', async () => {
      await mkdir(join(tmpDir, '.vibe'), { recursive: true })
      await writeFile(join(tmpDir, PATHS.VIBE_STATUS), JSON.stringify({ currentPhase: 'invalid-type' }), 'utf-8')
      await writeFile(join(tmpDir, PATHS.VIBE_ROADMAP), '# Roadmap\n- [x] Phase 2.1\n', 'utf-8')

      const status = await readStatus(tmpDir)
      expect(status.lastCompletedTask).toBe('2.1')
    })

    it('returns default status when status.json is invalid JSON and no roadmap exists', async () => {
      await mkdir(join(tmpDir, '.vibe'), { recursive: true })
      await writeFile(join(tmpDir, PATHS.VIBE_STATUS), 'invalid json', 'utf-8')

      const status = await readStatus(tmpDir)
      expect(status).toEqual({
        version: '0.1.0',
        currentPhase: 0,
        lastCompletedTask: null,
        conflictCount: 0,
        lastUpdated: null
      })
    })

    it('writes status correctly to status.json', async () => {
      const statusToSet = {
        version: '0.1.0',
        currentPhase: 2,
        lastCompletedTask: '2.0',
        conflictCount: 1,
        lastUpdated: null
      }
      await writeStatus(tmpDir, statusToSet)

      const writtenRaw = await readFile(join(tmpDir, PATHS.VIBE_STATUS), 'utf-8')
      const parsed = JSON.parse(writtenRaw)
      expect(parsed.currentPhase).toBe(2)
      expect(parsed.lastCompletedTask).toBe('2.0')
      expect(parsed.conflictCount).toBe(1)
      expect(typeof parsed.lastUpdated).toBe('string')
    })
  })

  describe('updateConflictCount and updatePhaseOnAccept', () => {
    it('updates conflict count correctly', async () => {
      const initial = await readStatus(tmpDir)
      expect(initial.conflictCount).toBe(0)

      const updated = await updateConflictCount(tmpDir, 3)
      expect(updated.conflictCount).toBe(3)

      const reRead = await readStatus(tmpDir)
      expect(reRead.conflictCount).toBe(3)
    })

    it('updates phase on accept correctly', async () => {
      const updated = await updatePhaseOnAccept(tmpDir, '3.2.1')
      expect(updated.lastCompletedTask).toBe('3.2.1')
      expect(updated.currentPhase).toBe(3)

      // Test phase number non-decreasing
      const updated2 = await updatePhaseOnAccept(tmpDir, '1.5.0')
      expect(updated2.lastCompletedTask).toBe('1.5.0')
      expect(updated2.currentPhase).toBe(3)
    })
  })
})
