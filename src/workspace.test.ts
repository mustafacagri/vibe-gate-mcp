import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getWorkspaceRoot } from '@/workspace'

const testDir = join(process.cwd(), '.vibe-workspace-test')

describe('getWorkspaceRoot', () => {
  it('returns VIBE_WORKSPACE_ROOT when set', async () => {
    await mkdir(testDir, { recursive: true })
    try {
      const original = process.env.VIBE_WORKSPACE_ROOT
      process.env.VIBE_WORKSPACE_ROOT = testDir
      try {
        const root = getWorkspaceRoot()
        expect(root).toBe(testDir)
      } finally {
        if (original) {
          process.env.VIBE_WORKSPACE_ROOT = original
        } else {
          delete process.env.VIBE_WORKSPACE_ROOT
        }
      }
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  it('falls back to process.cwd when VIBE_WORKSPACE_ROOT not set', () => {
    const original = process.env.VIBE_WORKSPACE_ROOT
    delete process.env.VIBE_WORKSPACE_ROOT
    try {
      const root = getWorkspaceRoot()
      expect(root).toBe(process.cwd())
    } finally {
      if (original) {
        process.env.VIBE_WORKSPACE_ROOT = original
      }
    }
  })

  it('finds package.json root in parent directories', async () => {
    await mkdir(join(testDir, 'packages', 'my-app'), { recursive: true })
    try {
      await writeFile(join(testDir, 'package.json'), '{"name": "test"}', 'utf-8')
      const original = process.env.VIBE_WORKSPACE_ROOT
      delete process.env.VIBE_WORKSPACE_ROOT
      try {
        const root = getWorkspaceRoot()
        expect(root).toBeDefined()
        expect(root.length).toBeGreaterThan(0)
      } finally {
        process.env.VIBE_WORKSPACE_ROOT = original
      }
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })
})
