import { describe, bench, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseStatusFromRoadmap } from '@/roadmap/status'

describe('parseStatusFromRoadmap benchmark', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'vibe-status-bench-'))
    await mkdir(join(tmpDir, '.vibe'), { recursive: true })
    await mkdir(join(tmpDir, 'docs'), { recursive: true })

    const roadmapContent = `# Roadmap\n- [x] Phase 1.2 (Completed)\n- [x] Phase 2.3.1 (Done)\n`
    await writeFile(join(tmpDir, 'docs/ROADMAP.md'), roadmapContent, 'utf-8')
  })

  afterAll(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  bench('parseStatusFromRoadmap with docs/ROADMAP.md (first file ENOENT)', async () => {
    await parseStatusFromRoadmap(tmpDir)
  })
})
