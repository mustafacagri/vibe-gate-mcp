/**
 * Roadmap tracker: current phase, status.
 */

import { readStatus } from '@/roadmap/status'
import type { PhaseStatus } from '@/roadmap/types'

export type { PhaseStatus } from '@/roadmap/types'
export { readStatus, writeStatus, updateConflictCount, updatePhaseOnAccept } from '@/roadmap/status'
export { shouldPersistPhaseStatus } from '@/roadmap/phase-status-policy'

export async function getCurrentPhase(workspaceRoot: string): Promise<number> {
  const status = await readStatus(workspaceRoot)
  return status.currentPhase
}

export async function getStatus(workspaceRoot: string): Promise<PhaseStatus> {
  return readStatus(workspaceRoot)
}
