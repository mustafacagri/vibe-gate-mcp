/**
 * Whether ACCEPT should persist phaseId into `.vibe/status.json`.
 */

import { PHASE_STATUS_POLICY } from '@/constants'

/**
 * @param phaseId submit_phase_review phaseId
 * @param updateStatus explicit tool flag; undefined → apply default skip prefixes
 */
export function shouldPersistPhaseStatus(phaseId: string, updateStatus?: boolean): boolean {
  if (updateStatus === false) return false
  if (updateStatus === true) return true
  return !PHASE_STATUS_POLICY.SKIP_STATUS_PREFIXES.some(prefix => phaseId.startsWith(prefix))
}
