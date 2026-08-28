/**
 * Extract project blueprint (framework, structures) from workspace.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  BLUEPRINT_MAX_TOP_LEVEL_DIRS,
  FRAMEWORK_DEPS,
  FRAMEWORK_INDICATORS,
  FRAMEWORK_STRUCTURES,
  PATHS
} from '@/constants'
import { debugLog } from '@/utils/debug'
import { getErrorMessage } from '@/utils/error'
import type { ProjectBlueprint } from '@/summarizer/types'

const packageJsonSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional()
})

async function detectFramework(workspaceRoot: string): Promise<string> {
  const path = join(workspaceRoot, PATHS.PACKAGE_JSON)
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = packageJsonSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      debugLog(`package.json parse failed: ${parsed.error.message}`)
      return FRAMEWORK_INDICATORS.UNKNOWN
    }
    const allDeps = {
      ...(parsed.data.dependencies ?? {}),
      ...(parsed.data.devDependencies ?? {})
    }
    for (const [dep, framework] of Object.entries(FRAMEWORK_DEPS)) {
      if (dep in allDeps) return framework
    }
  } catch (err) {
    debugLog(`detectFramework failed: ${getErrorMessage(err)}`)
  }
  return FRAMEWORK_INDICATORS.UNKNOWN
}

async function listTopLevelDirs(workspaceRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(workspaceRoot, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => `${e.name}/`)
  } catch (err) {
    debugLog(`listTopLevelDirs failed: ${getErrorMessage(err)}`)
    return []
  }
}

export async function extractProjectBlueprint(workspaceRoot: string): Promise<ProjectBlueprint> {
  const framework = await detectFramework(workspaceRoot)
  const structures = FRAMEWORK_STRUCTURES[framework] ?? []
  const dirs = await listTopLevelDirs(workspaceRoot)
  const present = structures.filter(s => dirs.includes(s))
  const features = framework !== FRAMEWORK_INDICATORS.UNKNOWN ? [framework] : []

  return {
    framework,
    structures: present.length > 0 ? present : dirs.slice(0, BLUEPRINT_MAX_TOP_LEVEL_DIRS),
    features
  }
}
