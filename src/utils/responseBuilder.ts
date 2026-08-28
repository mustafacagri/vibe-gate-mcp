/**
 * Structured Critic response builder for Vibe-Gate Critic V2.
 * Ensures every verdict has concrete evidence and proper tracking.
 */

import { CONCERN_REVIEW_STATUS, CRITIC_THRESHOLDS, CRITIC_VERDICTS, SEVERITY } from '@/constants'
import type { Severity } from '@/constants'
import type { Concern, ConcernVerification, CriticResponse } from '@/conflict-loop/types'
import type { Verdict } from '@/constants'

export function buildCriticResponse(
  verdict: Verdict,
  rawResponse: string,
  completionTokens: number,
  concerns: Concern[],
  verifications: ConcernVerification[],
  filesAnalyzed: number = 0
): CriticResponse {
  const fixedConcerns = verifications.filter(v => v.verified).map(v => v.ruleId)
  const remainingConcerns = concerns.filter(c => !fixedConcerns.includes(c.ruleId)).map(c => c.ruleId)

  return {
    verdict,
    reviewDepth: {
      filesAnalyzed,
      tokensSpent: completionTokens,
      issuesFound: concerns.length
    },
    concerns,
    verifications,
    summary: buildSummary(verdict, concerns, fixedConcerns, remainingConcerns, completionTokens),
    remainingConcerns,
    fixedConcerns
  }
}

function buildSummary(
  verdict: Verdict,
  concerns: Concern[],
  fixedConcerns: string[],
  remainingConcerns: string[],
  completionTokens: number
): string {
  switch (verdict) {
    case CRITIC_VERDICTS.ACCEPT:
      return `All ${concerns.length} concerns verified and resolved. Review depth: ${completionTokens} tokens.`
    case CRITIC_VERDICTS.CONCERNS_ADDRESSED:
      return `All ${concerns.length} concerns verified as addressed. Optional suggestions remain. Review depth: ${completionTokens} tokens.`
    case CRITIC_VERDICTS.REJECT:
      return `Critical issues found. Cannot proceed.`
    case CRITIC_VERDICTS.BLOCK:
      return `Concerns unresolved after maximum rounds. Cannot proceed.`
    case CRITIC_VERDICTS.LOW_QUALITY:
      return `Concerns too generic or lack required detail. Provide specific locations, options, and recommendation.`
    case CRITIC_VERDICTS.DEBT:
      return `${fixedConcerns.length} of ${concerns.length} concerns resolved. ${remainingConcerns.length} remaining.`
    case CRITIC_VERDICTS.INSUFFICIENT_REVIEW:
      return `No valid verdict found in the Critic's response.`
    default:
      return 'Unknown verdict.'
  }
}

export function checkTokenThreshold(verdict: string, _completionTokens: number): Verdict {
  // Token thresholding is disabled. Overriding the Critic's actual verdict with INSUFFICIENT_REVIEW
  // creates a disconnect. The critic's decision must be respected regardless of output length.
  return verdict as Verdict
}

export function checkAllConcernsVerified(concerns: Concern[]): boolean {
  // ALL evaluated (not PENDING) AND NONE active (no REVIEWED_VALID)
  return (
    concerns.every(c => c.reviewStatus !== CONCERN_REVIEW_STATUS.PENDING) &&
    !concerns.some(c => c.reviewStatus === CONCERN_REVIEW_STATUS.REVIEWED_VALID)
  )
}

export function buildConcernFromResponse(
  ruleId: string,
  description: string,
  evidence: string,
  severity: Severity = SEVERITY.WARNING
): Concern {
  return {
    ruleId,
    description,
    severity,
    evidence,
    verified: false,
    // New concerns always start as PENDING
    reviewStatus: CONCERN_REVIEW_STATUS.PENDING
  }
}

export function buildVerification(
  ruleId: string,
  claimedFix: string,
  verified: boolean,
  verificationEvidence: string
): ConcernVerification {
  return {
    ruleId,
    claimedFix,
    verified,
    verificationEvidence
  }
}

export function requiresDebtLog(round: number, verdict: string): boolean {
  return round >= CRITIC_THRESHOLDS.DEBT_LOG_ROUND_REQUIRED && verdict === CRITIC_VERDICTS.DEBT
}
