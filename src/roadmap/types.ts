/**
 * Roadmap status types.
 */

export interface PhaseStatus {
  version: string
  currentPhase: number
  lastCompletedTask: string | null
  conflictCount: number
  lastUpdated: string | null
}
