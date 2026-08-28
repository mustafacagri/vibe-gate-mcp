/**
 * Conflict loop types for Critic V2.
 */

import type { Verdict, Severity } from '@/constants'

/**
 * Review status for a concern raised by the Critic.
 *
 * - PENDING: Not yet evaluated by the Critic (initial state)
 * - REVIEWED_VALID: Critic confirmed this concern is a real issue (must be fixed)
 * - REVIEWED_INVALID: Critic determined this concern does not apply (NOT_VERIFIED)
 *
 * Distinct from `verified: boolean` which conflated "not yet checked" with "checked and invalid".
 */
export type ConcernReviewStatus = 'PENDING' | 'REVIEWED_VALID' | 'REVIEWED_INVALID'

export interface Concern {
  ruleId: string
  description: string
  severity: Severity
  evidence: string
  verified: boolean
  verifiedEvidence?: string
  /** Tri-state review status. `verified: boolean` alone cannot distinguish PENDING from INVALID. */
  reviewStatus: ConcernReviewStatus
}

export interface ConcernVerification {
  ruleId: string
  claimedFix: string
  verified: boolean
  verificationEvidence: string
}

export interface ReviewRound {
  round: number
  report: string
  semanticDiff?: string
  verdict: string
  criticResponse: string
  concerns?: Concern[]
  verifications?: ConcernVerification[]
}

export interface ReviewSession {
  phaseId: string
  round: number
  concerns: Concern[]
  history: ReviewRound[]
}

export interface CriticResponse {
  verdict: Verdict
  reviewDepth: {
    filesAnalyzed: number
    tokensSpent: number
    issuesFound: number
  }
  concerns: Concern[]
  verifications: ConcernVerification[]
  summary: string
  remainingConcerns: string[]
  fixedConcerns: string[]
}
