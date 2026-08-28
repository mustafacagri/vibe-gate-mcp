/**
 * Review session state for 3-round conflict loop.
 */

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { JSON_INDENT_SPACES, PATHS, SEVERITY, CONCERN_REVIEW_STATUS } from '@/constants'
import { debugLog } from '@/utils/debug'
import { getErrorMessage } from '@/utils/error'
import type { Concern, ConcernVerification, ReviewRound, ReviewSession } from '@/conflict-loop/types'

const concernSchema = z.object({
  ruleId: z.string(),
  description: z.string(),
  severity: z.enum([SEVERITY.CRITICAL, SEVERITY.WARNING, SEVERITY.BLOCKING, SEVERITY.INFO]),
  evidence: z.string(),
  verified: z.boolean(),
  verifiedEvidence: z.string().optional(),
  /**
   * reviewStatus distinguishes PENDING (not yet evaluated) from
   * REVIEWED_INVALID (evaluated, not a real issue). Missing values default to PENDING.
   */
  reviewStatus: z
    .enum([CONCERN_REVIEW_STATUS.PENDING, CONCERN_REVIEW_STATUS.REVIEWED_VALID, CONCERN_REVIEW_STATUS.REVIEWED_INVALID])
    .default(CONCERN_REVIEW_STATUS.PENDING)
})

const concernVerificationSchema = z.object({
  ruleId: z.string(),
  claimedFix: z.string(),
  verified: z.boolean(),
  verificationEvidence: z.string()
})

const reviewRoundSchema = z.object({
  round: z.number(),
  report: z.string(),
  semanticDiff: z.string().optional(),
  verdict: z.string(),
  criticResponse: z.string(),
  concerns: z.array(concernSchema).optional(),
  verifications: z.array(concernVerificationSchema).optional()
})

const reviewSessionSchema = z.object({
  phaseId: z.string(),
  round: z.number(),
  concerns: z.array(concernSchema),
  history: z.array(reviewRoundSchema)
})

export async function readSession(workspaceRoot: string): Promise<ReviewSession | null> {
  const path = join(workspaceRoot, PATHS.VIBE_REVIEW_SESSION)
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = reviewSessionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      debugLog(`review-session.json parse failed: ${parsed.error.message}`)
      return null
    }
    return parsed.data
  } catch (err) {
    debugLog(`readSession failed: ${getErrorMessage(err)}`)
    return null
  }
}

export async function writeSession(workspaceRoot: string, session: ReviewSession): Promise<void> {
  const path = join(workspaceRoot, PATHS.VIBE_REVIEW_SESSION)
  const vibeDir = join(workspaceRoot, PATHS.VIBE_DIR)
  await mkdir(vibeDir, { recursive: true })
  await writeFile(path, JSON.stringify(session, null, JSON_INDENT_SPACES), 'utf-8')
}

export async function clearSession(workspaceRoot: string): Promise<void> {
  const path = join(workspaceRoot, PATHS.VIBE_REVIEW_SESSION)
  try {
    await unlink(path)
  } catch (err) {
    debugLog(`clearSession failed: ${getErrorMessage(err)}`)
  }
}

export function appendRound(session: ReviewSession | null, phaseId: string, round: ReviewRound): ReviewSession {
  if (!session || session.phaseId !== phaseId) {
    return {
      phaseId,
      round: round.round,
      concerns: round.concerns ?? [],
      history: [round]
    }
  }
  const newConcerns = round.concerns ?? []
  const allConcerns = [...session.concerns]
  for (const nc of newConcerns) {
    if (!allConcerns.some(c => c.ruleId === nc.ruleId && c.evidence === nc.evidence)) allConcerns.push(nc)
  }
  return {
    ...session,
    round: round.round,
    concerns: allConcerns,
    history: [...session.history, round]
  }
}

export function addConcerns(session: ReviewSession | null, concerns: Concern[]): ReviewSession {
  if (!session) {
    return {
      phaseId: '',
      round: 0,
      concerns: [],
      history: []
    }
  }
  return {
    ...session,
    concerns: [...session.concerns, ...concerns]
  }
}

/**
 * Apply a verification result to a concern.
 *
 * Sets both `verified` and `reviewStatus` so the boolean and tri-state views stay synchronized:
 * - verified=true  → REVIEWED_INVALID (Critic confirmed: not a real issue, false positive, or resolved)
 * - verified=false → REVIEWED_VALID   (Critic confirmed: real issue that still blocks ACCEPT)
 *
 * When Critic marks something VERIFIED, it means the concern has been addressed
 * (either as fixed, or as a false positive). Only "NOT_VERIFIED" means the concern
 * is still a valid blocking issue.
 */
export function verifyConcern(session: ReviewSession, verification: ConcernVerification): ReviewSession {
  const updatedConcerns = session.concerns.map(c => {
    if (c.ruleId !== verification.ruleId) return c

    const reviewStatus = verification.verified
      ? CONCERN_REVIEW_STATUS.REVIEWED_INVALID
      : CONCERN_REVIEW_STATUS.REVIEWED_VALID

    return {
      ...c,
      verified: verification.verified,
      reviewStatus,
      verifiedEvidence: verification.verificationEvidence
    }
  })
  return {
    ...session,
    concerns: updatedConcerns
  }
}

/**
 * Returns true when all concerns have been evaluated by the Critic.
 *
 * A concern is "reviewed" when its reviewStatus is REVIEWED_VALID or REVIEWED_INVALID.
 * PENDING means the Critic has not yet responded about it.
 *
 */
export function allConcernsReviewed(session: ReviewSession): boolean {
  return session.concerns.every(c => c.reviewStatus !== CONCERN_REVIEW_STATUS.PENDING)
}

/**
 * Returns true when any concern is a genuine issue (REVIEWED_VALID).
 *
 * Only REVIEWED_VALID concerns should block ACCEPT. REVIEWED_INVALID ones are dismissed.
 */
export function hasActiveConcerns(session: ReviewSession): boolean {
  return session.concerns.some(c => c.reviewStatus === CONCERN_REVIEW_STATUS.REVIEWED_VALID)
}

/** Returns true when every concern is reviewed and none remains active. */
export function allConcernsVerified(session: ReviewSession): boolean {
  return allConcernsReviewed(session) && !hasActiveConcerns(session)
}

export function getUnverifiedConcerns(session: ReviewSession): Concern[] {
  return session.concerns.filter(c => c.reviewStatus === CONCERN_REVIEW_STATUS.PENDING)
}
