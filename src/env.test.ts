import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadEnvironmentVariables } from './env.js'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

describe('loadEnvironmentVariables', () => {
  const testDir = join(process.cwd(), 'tmp-env-test')
  const workspaceDir = join(testDir, 'workspace')
  const packageDir = join(testDir, 'package')

  const originalEnv = process.env

  beforeEach(async () => {
    process.env = { ...originalEnv }
    delete process.env.VIBE_WORKSPACE_ROOT
    delete process.env.TEST_KEY_FROM_WORKSPACE
    delete process.env.TEST_KEY_FROM_PACKAGE
    delete process.env.TEST_KEY_OVERLAPPING

    await mkdir(workspaceDir, { recursive: true })
    await mkdir(packageDir, { recursive: true })
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(testDir, { recursive: true, force: true })
  })

  it('loads env securely with correct priority and logs behavior', async () => {
    // 1. MCP env (already present)
    process.env.TEST_KEY_OVERLAPPING = 'mcp-value'

    // 2. Workspace env
    process.env.VIBE_WORKSPACE_ROOT = workspaceDir
    await writeFile(
      join(workspaceDir, '.env'),
      'TEST_KEY_FROM_WORKSPACE=workspace-value\nTEST_KEY_OVERLAPPING=workspace-overlap',
      'utf-8'
    )

    // 3. Package env
    await writeFile(
      join(packageDir, '.env'),
      'TEST_KEY_FROM_PACKAGE=package-value\nTEST_KEY_OVERLAPPING=package-overlap\nTEST_KEY_FROM_WORKSPACE=package-should-not-override',
      'utf-8'
    )

    loadEnvironmentVariables(packageDir)

    // Verify MCP wins
    expect(process.env.TEST_KEY_OVERLAPPING).toBe('mcp-value')

    // Verify Workspace wins over package
    expect(process.env.TEST_KEY_FROM_WORKSPACE).toBe('workspace-value')

    // Verify Package fallback works
    expect(process.env.TEST_KEY_FROM_PACKAGE).toBe('package-value')
  })

  it('does not write dotenv status messages to stdout', async () => {
    process.env.VIBE_WORKSPACE_ROOT = workspaceDir
    await writeFile(join(workspaceDir, '.env'), 'TEST_KEY_FROM_WORKSPACE=workspace-value', 'utf-8')

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      loadEnvironmentVariables(packageDir)
      expect(logSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
    }
  })
})
