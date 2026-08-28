/**
 * Unit tests for responseBuilder.
 */

import { describe, expect, it } from 'vitest'
import {
  buildCriticResponse,
  checkAllConcernsVerified,
  buildConcernFromResponse,
  buildVerification
} from '@/utils/responseBuilder'
import { CRITIC_VERDICTS, SEVERITY, CONCERN_REVIEW_STATUS } from '@/constants'
import type { Concern, ConcernVerification } from '@/conflict-loop/types'

describe('responseBuilder', () => {
  describe('buildCriticResponse', () => {
    it('builds ACCEPT verdict response', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.WARNING,
          evidence: 'a.ts:1',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        }
      ]
      const verifications: ConcernVerification[] = [
        { ruleId: 'DRY-01', claimedFix: 'Fixed', verified: true, verificationEvidence: 'a.ts:1 → fixed' }
      ]
      const result = buildCriticResponse(CRITIC_VERDICTS.ACCEPT, 'All good', 100, concerns, verifications)
      expect(result.verdict).toBe(CRITIC_VERDICTS.ACCEPT)
      expect(result.summary).toContain('verified and resolved')
    })

    it('builds CONCERNS_ADDRESSED verdict response', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.BLOCKING,
          evidence: 'a.ts:1',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        },
        {
          ruleId: 'MAGIC-01',
          description: 'Magic string',
          severity: SEVERITY.WARNING,
          evidence: 'b.ts:5',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        }
      ]
      const verifications: ConcernVerification[] = [
        { ruleId: 'DRY-01', claimedFix: 'Fixed', verified: true, verificationEvidence: 'a.ts:1 → fixed' },
        { ruleId: 'MAGIC-01', claimedFix: 'Fixed', verified: true, verificationEvidence: 'b.ts:5 → fixed' }
      ]
      const result = buildCriticResponse(
        CRITIC_VERDICTS.CONCERNS_ADDRESSED,
        'All concerns addressed',
        150,
        concerns,
        verifications
      )
      expect(result.verdict).toBe(CRITIC_VERDICTS.CONCERNS_ADDRESSED)
      expect(result.summary).toContain('concerns verified as addressed')
      expect(result.summary).toContain('Optional suggestions remain')
      expect(result.fixedConcerns).toContain('DRY-01')
      expect(result.fixedConcerns).toContain('MAGIC-01')
    })

    it('builds CONCERNS_ADDRESSED with mixed verified/unverified', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.BLOCKING,
          evidence: 'a.ts:1',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        },
        {
          ruleId: 'MAGIC-01',
          description: 'Magic string',
          severity: SEVERITY.WARNING,
          evidence: 'b.ts:5',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_INVALID
        }
      ]
      const verifications: ConcernVerification[] = [
        { ruleId: 'DRY-01', claimedFix: 'Fixed', verified: true, verificationEvidence: 'a.ts:1 → fixed' }
      ]
      const result = buildCriticResponse(
        CRITIC_VERDICTS.CONCERNS_ADDRESSED,
        'Some concerns addressed',
        120,
        concerns,
        verifications
      )
      expect(result.verdict).toBe(CRITIC_VERDICTS.CONCERNS_ADDRESSED)
      expect(result.remainingConcerns).toContain('MAGIC-01')
    })

    it('builds REJECT verdict response', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'SEC-01',
          description: 'Security issue',
          severity: SEVERITY.CRITICAL,
          evidence: 'a.ts:1',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const result = buildCriticResponse(CRITIC_VERDICTS.REJECT, 'Critical issues found', 80, concerns, [])
      expect(result.verdict).toBe(CRITIC_VERDICTS.REJECT)
      expect(result.summary).toContain('Critical issues found')
    })

    it('builds BLOCK verdict response', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.BLOCKING,
          evidence: 'a.ts:1',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        },
        {
          ruleId: 'MAGIC-01',
          description: 'Magic string',
          severity: SEVERITY.WARNING,
          evidence: 'b.ts:5',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const result = buildCriticResponse(CRITIC_VERDICTS.BLOCK, 'Concerns unresolved', 100, concerns, [])
      expect(result.verdict).toBe(CRITIC_VERDICTS.BLOCK)
      expect(result.summary).toContain('Concerns unresolved after maximum rounds')
    })

    it('builds LOW_QUALITY verdict response', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.BLOCKING,
          evidence: 'a.ts:1',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const result = buildCriticResponse(CRITIC_VERDICTS.LOW_QUALITY, 'Generic concerns', 80, concerns, [])
      expect(result.verdict).toBe(CRITIC_VERDICTS.LOW_QUALITY)
      expect(result.summary).toContain('too generic')
    })

    it('builds DEBT verdict response', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.WARNING,
          evidence: 'a.ts:1',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        },
        {
          ruleId: 'COMPLEX-01',
          description: 'Complexity',
          severity: SEVERITY.WARNING,
          evidence: 'b.ts:5',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const verifications: ConcernVerification[] = [
        { ruleId: 'DRY-01', claimedFix: 'Fixed', verified: true, verificationEvidence: 'a.ts:1 → fixed' }
      ]
      const result = buildCriticResponse(CRITIC_VERDICTS.DEBT, 'Some issues remain', 100, concerns, verifications)
      expect(result.verdict).toBe(CRITIC_VERDICTS.DEBT)
      expect(result.summary).toContain('1 of 2 concerns resolved')
      expect(result.summary).toContain('1 remaining')
    })

    it('builds INSUFFICIENT_REVIEW verdict response', () => {
      const result = buildCriticResponse(CRITIC_VERDICTS.INSUFFICIENT_REVIEW, 'Too short', 20, [], [])
      expect(result.verdict).toBe(CRITIC_VERDICTS.INSUFFICIENT_REVIEW)
      expect(result.summary).toContain('No valid verdict found')
    })

    it('tracks fixed and remaining concerns correctly', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'A',
          description: 'A',
          severity: SEVERITY.WARNING,
          evidence: 'a.ts:1',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        },
        {
          ruleId: 'B',
          description: 'B',
          severity: SEVERITY.WARNING,
          evidence: 'b.ts:2',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const verifications: ConcernVerification[] = [
        { ruleId: 'A', claimedFix: 'Fixed A', verified: true, verificationEvidence: 'a.ts:1 → fixed' }
      ]
      const result = buildCriticResponse(CRITIC_VERDICTS.DEBT, 'Response', 100, concerns, verifications)
      expect(result.fixedConcerns).toEqual(['A'])
      expect(result.remainingConcerns).toEqual(['B'])
    })
  })

  describe('checkAllConcernsVerified', () => {
    it('returns true when all concerns verified (resolved)', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'A',
          description: 'A',
          severity: SEVERITY.WARNING,
          evidence: 'a.ts:1',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_INVALID
        },
        {
          ruleId: 'B',
          description: 'B',
          severity: SEVERITY.BLOCKING,
          evidence: 'b.ts:2',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_INVALID
        }
      ]
      expect(checkAllConcernsVerified(concerns)).toBe(true)
    })

    it('returns false when some concerns are active (REVIEWED_VALID)', () => {
      const concerns: Concern[] = [
        {
          ruleId: 'A',
          description: 'A',
          severity: SEVERITY.WARNING,
          evidence: 'a.ts:1',
          verified: true,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_VALID
        },
        {
          ruleId: 'B',
          description: 'B',
          severity: SEVERITY.BLOCKING,
          evidence: 'b.ts:2',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.REVIEWED_INVALID
        }
      ]
      expect(checkAllConcernsVerified(concerns)).toBe(false)
    })

    it('returns true for empty array', () => {
      expect(checkAllConcernsVerified([])).toBe(true)
    })
  })

  describe('buildConcernFromResponse', () => {
    it('builds concern with default severity', () => {
      const concern = buildConcernFromResponse('DRY-01', 'Duplication found', 'a.ts:1')
      expect(concern.ruleId).toBe('DRY-01')
      expect(concern.description).toBe('Duplication found')
      expect(concern.evidence).toBe('a.ts:1')
      expect(concern.severity).toBe(SEVERITY.WARNING)
      expect(concern.verified).toBe(false)
    })

    it('builds concern with custom severity', () => {
      const concern = buildConcernFromResponse('SEC-01', 'Security issue', 'a.ts:1', SEVERITY.CRITICAL)
      expect(concern.severity).toBe(SEVERITY.CRITICAL)
    })

    it('builds concern with BLOCKING severity', () => {
      const concern = buildConcernFromResponse('DRY-01', 'Duplication', 'a.ts:1', SEVERITY.BLOCKING)
      expect(concern.severity).toBe(SEVERITY.BLOCKING)
    })

    it('builds concern with INFO severity', () => {
      const concern = buildConcernFromResponse('STYLE-01', 'Style suggestion', 'a.ts:1', SEVERITY.INFO)
      expect(concern.severity).toBe(SEVERITY.INFO)
    })
  })

  describe('buildVerification', () => {
    it('builds verification with verified=true', () => {
      const verification = buildVerification('DRY-01', 'Fixed', true, 'a.ts:1 → fixed')
      expect(verification.ruleId).toBe('DRY-01')
      expect(verification.claimedFix).toBe('Fixed')
      expect(verification.verified).toBe(true)
      expect(verification.verificationEvidence).toBe('a.ts:1 → fixed')
    })

    it('builds verification with verified=false', () => {
      const verification = buildVerification('DRY-01', 'Not fixed', false, 'a.ts:1 → still broken')
      expect(verification.verified).toBe(false)
    })
  })
})
