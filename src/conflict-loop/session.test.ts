import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendRound,
  clearSession,
  readSession,
  writeSession,
  allConcernsReviewed,
  hasActiveConcerns,
  getUnverifiedConcerns,
  verifyConcern
} from '@/conflict-loop/session'
import { CRITIC_VERDICTS, SEVERITY, CONCERN_REVIEW_STATUS } from '@/constants'
import type { ReviewSession } from '@/conflict-loop/types'

const testDir = join(process.cwd(), '.vibe-session-test')

/** Helper to build a minimal valid concern with reviewStatus */
function makeConcern(
  ruleId: string,
  reviewStatus: (typeof CONCERN_REVIEW_STATUS)[keyof typeof CONCERN_REVIEW_STATUS],
  verified: boolean
) {
  return {
    ruleId,
    description: `${ruleId} desc`,
    severity: SEVERITY.WARNING,
    evidence: `${ruleId.toLowerCase()}.ts:1`,
    verified,
    reviewStatus
  }
}

describe('conflict-loop session', () => {
  it('appendRound creates new session when null', () => {
    const session = appendRound(null, '1.1.1', {
      round: 1,
      report: 'Test',
      verdict: CRITIC_VERDICTS.REJECT,
      criticResponse: 'Response'
    })
    expect(session.phaseId).toBe('1.1.1')
    expect(session.round).toBe(1)
    expect(session.history).toHaveLength(1)
    expect(session.concerns).toHaveLength(0)
  })

  it('appendRound appends when same phaseId', () => {
    const session = appendRound(
      {
        phaseId: '1.1.1',
        round: 1,
        concerns: [],
        history: [{ round: 1, report: 'R1', verdict: CRITIC_VERDICTS.REJECT, criticResponse: 'C1' }]
      },
      '1.1.1',
      { round: 2, report: 'R2', verdict: CRITIC_VERDICTS.ACCEPT, criticResponse: 'C2' }
    )
    expect(session.history).toHaveLength(2)
    expect(session.round).toBe(2)
  })

  it('writeSession and readSession persist round-trip', async () => {
    await mkdir(join(testDir, '.vibe'), { recursive: true })
    try {
      const session = {
        phaseId: '2.3.1',
        round: 1,
        concerns: [],
        history: [{ round: 1, report: 'R', verdict: CRITIC_VERDICTS.REJECT, criticResponse: 'C' }]
      }
      await writeSession(testDir, session)
      const read = await readSession(testDir)
      expect(read?.phaseId).toBe('2.3.1')
      expect(read?.history).toHaveLength(1)
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  it('clearSession removes file', async () => {
    await mkdir(join(testDir, '.vibe'), { recursive: true })
    try {
      await writeSession(testDir, { phaseId: '1.1.1', round: 1, concerns: [], history: [] })
      await clearSession(testDir)
      const read = await readSession(testDir)
      expect(read).toBeNull()
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  // ── allConcernsReviewed ─────────────────────────────────────────────────────

  it('allConcernsReviewed returns true when all concerns have reviewStatus set (valid or invalid)', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        makeConcern('A', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true),
        makeConcern('B', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false)
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(true)
  })

  it('allConcernsReviewed returns false when any concern is PENDING', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        makeConcern('A', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true),
        makeConcern('B', CONCERN_REVIEW_STATUS.PENDING, false)
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(false)
  })

  // ── hasActiveConcerns ───────────────────────────────────────────────────────

  it('hasActiveConcerns returns true when any concern is REVIEWED_VALID', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        makeConcern('DRY-01', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true),
        makeConcern('SRP-02', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false)
      ],
      history: []
    }
    expect(hasActiveConcerns(session)).toBe(true)
  })

  it('hasActiveConcerns returns false when all concerns are REVIEWED_INVALID', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        makeConcern('SRP-02', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false),
        makeConcern('NAMING-03', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false)
      ],
      history: []
    }
    expect(hasActiveConcerns(session)).toBe(false)
  })

  // ── Review status scenario ──────────────────────────────────────────────────

  it('1 VALID + 2 INVALID → allConcernsReviewed=true, hasActiveConcerns=true', () => {
    // This is the correct behaviour: all evaluated, but there IS an active concern (DRY-01)
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 2,
      concerns: [
        makeConcern('DRY-01', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true),
        makeConcern('SRP-02', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false),
        makeConcern('NAMING-03', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false)
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(true)
    expect(hasActiveConcerns(session)).toBe(true)
  })

  it('all INVALID → allConcernsReviewed=true, hasActiveConcerns=false (safe to ACCEPT)', () => {
    // All concerns were dismissed by Critic → ACCEPT should be possible
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 2,
      concerns: [
        makeConcern('SRP-02', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false),
        makeConcern('NAMING-03', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false)
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(true)
    expect(hasActiveConcerns(session)).toBe(false)
  })

  // ── verifyConcern sets reviewStatus ────────────────────────────────────────

  it('verifyConcern sets REVIEWED_INVALID when verification.verified=true (VERIFIED means concern no longer active)', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [makeConcern('DRY-01', CONCERN_REVIEW_STATUS.PENDING, false)],
      history: []
    }
    const updated = verifyConcern(session, {
      ruleId: 'DRY-01',
      claimedFix: 'Fixed it',
      verified: true,
      verificationEvidence: 'src/foo.ts:10 → fixed'
    })
    expect(updated.concerns[0].reviewStatus).toBe(CONCERN_REVIEW_STATUS.REVIEWED_INVALID)
    expect(updated.concerns[0].verified).toBe(true)
  })

  it('verifyConcern sets REVIEWED_VALID when verification.verified=false (NOT_VERIFIED means concern still valid)', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [makeConcern('SRP-02', CONCERN_REVIEW_STATUS.PENDING, false)],
      history: []
    }
    const updated = verifyConcern(session, {
      ruleId: 'SRP-02',
      claimedFix: 'Not actually an issue',
      verified: false,
      verificationEvidence: 'src/bar.ts:5 → REVIEWED_INVALID: follows project convention'
    })
    expect(updated.concerns[0].reviewStatus).toBe(CONCERN_REVIEW_STATUS.REVIEWED_VALID)
    expect(updated.concerns[0].verified).toBe(false)
  })

  // ── getUnverifiedConcerns uses reviewStatus now ─────────────────────────────

  it('getUnverifiedConcerns returns only PENDING concerns (not REVIEWED_INVALID)', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        makeConcern('A', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true),
        makeConcern('B', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false),
        makeConcern('C', CONCERN_REVIEW_STATUS.PENDING, false)
      ],
      history: []
    }
    const unverified = getUnverifiedConcerns(session)
    expect(unverified).toHaveLength(1)
    expect(unverified[0].ruleId).toBe('C')
  })

  it('all REVIEWED_VALID → allConcernsReviewed=true, hasActiveConcerns=true', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        makeConcern('A', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true),
        makeConcern('B', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true)
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(true)
    expect(hasActiveConcerns(session)).toBe(true)
  })

  it('mixed REVIEWED_VALID + REVIEWED_INVALID → allConcernsReviewed=true, hasActiveConcerns=true', () => {
    // REVIEWED_INVALID concerns are dismissed - not blocking - but REVIEWED_VALID still counts
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        makeConcern('A', CONCERN_REVIEW_STATUS.REVIEWED_VALID, true),
        makeConcern('B', CONCERN_REVIEW_STATUS.REVIEWED_INVALID, false)
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(true)
    expect(hasActiveConcerns(session)).toBe(true)
  })

  it('handles BLOCKING severity concerns', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.BLOCKING,
          evidence: 'a.ts:1',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(false)
    expect(hasActiveConcerns(session)).toBe(false) // PENDING is not REVIEWED_VALID
    const unverified = getUnverifiedConcerns(session)
    expect(unverified).toHaveLength(1)
    expect(unverified[0].severity).toBe(SEVERITY.BLOCKING)
  })

  it('mix of all severity types works correctly', () => {
    const session: ReviewSession = {
      phaseId: '1.1.1',
      round: 1,
      concerns: [
        {
          ruleId: 'A',
          description: 'A',
          severity: SEVERITY.CRITICAL,
          evidence: 'a.ts:1',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        },
        {
          ruleId: 'B',
          description: 'B',
          severity: SEVERITY.BLOCKING,
          evidence: 'b.ts:2',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        },
        {
          ruleId: 'C',
          description: 'C',
          severity: SEVERITY.WARNING,
          evidence: 'c.ts:3',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        },
        {
          ruleId: 'D',
          description: 'D',
          severity: SEVERITY.INFO,
          evidence: 'd.ts:4',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        }
      ],
      history: []
    }
    expect(allConcernsReviewed(session)).toBe(true)
    expect(hasActiveConcerns(session)).toBe(true)
  })

  // ── Session JSON normalization: reviewStatus defaults to PENDING ────────────

  it('readSession assigns default PENDING reviewStatus when field missing in stored JSON', async () => {
    await mkdir(join(testDir, '.vibe'), { recursive: true })
    try {
      // Simulates a stored session without reviewStatus field
      const storedSession = {
        phaseId: '1.1.1',
        round: 1,
        concerns: [
          { ruleId: 'TEST-01', description: 'sample', severity: SEVERITY.WARNING, evidence: 'a.ts:1', verified: false }
        ],
        history: []
      }
      const { writeFile, mkdir: mkdirFs } = await import('node:fs/promises')
      const { join: pathJoin } = await import('node:path')
      await mkdirFs(pathJoin(testDir, '.vibe'), { recursive: true })
      await writeFile(pathJoin(testDir, '.vibe/review-session.json'), JSON.stringify(storedSession), 'utf-8')
      const read = await readSession(testDir)
      expect(read?.concerns[0].reviewStatus).toBe(CONCERN_REVIEW_STATUS.PENDING)
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })
})
