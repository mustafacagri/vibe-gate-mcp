/**
 * Read/write .vibe/status.json.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { ISO_DATE_SLICE_END, JSON_INDENT_SPACES, PATHS, PHASE_ID_REGEX } from '@/constants'
import { debugLog } from '@/utils/debug'
import { getErrorMessage } from '@/utils/error'
import type { PhaseStatus } from '@/roadmap/types'

const phaseStatusSchema = z.object({
  version: z.string().optional(),
  currentPhase: z.number().optional(),
  lastCompletedTask: z.string().nullable().optional(),
  conflictCount: z.number().optional(),
  lastUpdated: z.string().nullable().optional()
})

const DEFAULT_STATUS: PhaseStatus = {
  version: '0.1.0',
  currentPhase: 0,
  lastCompletedTask: null,
  conflictCount: 0,
  lastUpdated: null
}

async function parseStatusFromRoadmap(workspaceRoot: string): Promise<PhaseStatus | null> {
  const paths = [PATHS.VIBE_ROADMAP, PATHS.DOCS_ROADMAP]
  for (const rel of paths) {
    const path = join(workspaceRoot, rel)
    try {
      const raw = await readFile(path, 'utf-8')
      const matches = [...raw.matchAll(PHASE_ID_REGEX)]
      const lastMatch = matches[matches.length - 1]
      if (!lastMatch) continue
      const lastCompletedTask = lastMatch[1]
      const top = lastCompletedTask.split('.')[0]
      const currentPhase = Number.parseInt(top, 10)
      return {
        ...DEFAULT_STATUS,
        lastCompletedTask,
        currentPhase: Number.isNaN(currentPhase) ? 0 : currentPhase
      }
    } catch {
      continue
    }
  }
  return null
}

export async function readStatus(workspaceRoot: string): Promise<PhaseStatus> {
  const statusPath = join(workspaceRoot, PATHS.VIBE_STATUS)
  try {
    const raw = await readFile(statusPath, 'utf-8')
    const parsed = phaseStatusSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      debugLog(`status.json parse failed: ${parsed.error.message}`)
      return (await parseStatusFromRoadmap(workspaceRoot)) ?? { ...DEFAULT_STATUS }
    }
    return { ...DEFAULT_STATUS, ...parsed.data }
  } catch (err) {
    const isEnoent = err instanceof Error && 'code' in err && (err as { code?: string }).code === 'ENOENT'
    debugLog(`readStatus failed: ${getErrorMessage(err)}`)
    if (isEnoent) {
      const fromRoadmap = await parseStatusFromRoadmap(workspaceRoot)
      if (fromRoadmap) return fromRoadmap
    }
    return { ...DEFAULT_STATUS }
  }
}

export async function writeStatus(workspaceRoot: string, status: PhaseStatus): Promise<void> {
  const path = join(workspaceRoot, PATHS.VIBE_STATUS)
  const vibeDir = join(workspaceRoot, PATHS.VIBE_DIR)
  await mkdir(vibeDir, { recursive: true })
  const updated = {
    ...status,
    lastUpdated: new Date().toISOString().slice(0, ISO_DATE_SLICE_END)
  }
  await writeFile(path, JSON.stringify(updated, null, JSON_INDENT_SPACES), 'utf-8')
}

export async function updateConflictCount(workspaceRoot: string, delta: number): Promise<PhaseStatus> {
  const status = await readStatus(workspaceRoot)
  const next = { ...status, conflictCount: status.conflictCount + delta }
  await writeStatus(workspaceRoot, next)
  return next
}

/**
 * Extract top-level phase number from phaseId (e.g. "2.3.1" → 2).
 */
function extractTopLevelPhase(phaseId: string): number {
  const top = phaseId.split('.')[0]
  const parsed = Number.parseInt(top, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Update status when Critic ACCEPTs a phase.
 * Sets lastCompletedTask and currentPhase.
 */
export async function updatePhaseOnAccept(workspaceRoot: string, phaseId: string): Promise<PhaseStatus> {
  const status = await readStatus(workspaceRoot)
  const topLevelPhase = extractTopLevelPhase(phaseId)
  const next = {
    ...status,
    lastCompletedTask: phaseId,
    currentPhase: Math.max(status.currentPhase, topLevelPhase)
  }
  await writeStatus(workspaceRoot, next)
  return next
}
