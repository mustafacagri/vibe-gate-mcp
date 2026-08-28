/**
 * Workspace utilities. SSoT for workspace root resolution.
 * Use VIBE_WORKSPACE_ROOT env when MCP runs from different cwd (e.g. monorepo).
 */

import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { ENV_KEYS } from '@/constants'

function findPackageJsonRoot(startPath: string): string {
  let current = startPath
  while (current !== dirname(current)) {
    const pkgPath = `${current}/package.json`
    if (existsSync(pkgPath)) return current
    current = dirname(current)
  }
  return startPath
}

export function getWorkspaceRoot(): string {
  const override = process.env[ENV_KEYS.VIBE_WORKSPACE_ROOT]
  if (override?.trim()) {
    const resolved = override.trim()
    if (!existsSync(resolved)) {
      console.error(`[vibe-gate] WARNING: VIBE_WORKSPACE_ROOT="${resolved}" does not exist, using process.cwd()`)
      return process.cwd()
    }
    return resolved
  }
  const packageJsonRoot = findPackageJsonRoot(process.cwd())
  if (packageJsonRoot !== process.cwd()) {
    console.error(`[vibe-gate] DEBUG: Auto-detected package.json root: ${packageJsonRoot}`)
  }
  return packageJsonRoot
}
