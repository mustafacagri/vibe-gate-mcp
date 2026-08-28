/**
 * Integration tests for verdict parsing - E2E style.
 * Tests the complete flow from LLM response string to parsed structure.
 */

import { describe, expect, it } from 'vitest'
import { parseConcernsFromResponse, parseVerificationsFromResponse } from '@/utils/criticResponseParser'
import { buildCriticResponse } from '@/utils/responseBuilder'
import { CRITIC_VERDICTS, SEVERITY, CONCERN_REVIEW_STATUS } from '@/constants'
import type { Concern } from '@/conflict-loop/types'

describe('E2E: LLM Response → Parsed → Built', () => {
  describe('CONCERNS_ADDRESSED flow', () => {
    it('full flow: LLM CONCERNS_ADDRESSED response → parse → build', () => {
      const llmResponse = `VERDICT: CONCERNS_ADDRESSED

All raised concerns have been verified as addressed.
Implementation is production-ready. Optional suggestions remain.`

      const concerns = parseConcernsFromResponse(llmResponse)
      const verifications = parseVerificationsFromResponse(llmResponse, concerns)

      expect(concerns).toHaveLength(0)

      const result = buildCriticResponse(CRITIC_VERDICTS.CONCERNS_ADDRESSED, llmResponse, 150, concerns, verifications)

      expect(result.verdict).toBe(CRITIC_VERDICTS.CONCERNS_ADDRESSED)
      expect(result.summary).toContain('concerns verified as addressed')
      expect(result.summary).toContain('Optional suggestions remain')
    })
  })

  describe('REJECT with BLOCKING concerns flow', () => {
    it('full flow: LLM REJECT response with BLOCKING → parse → build', () => {
      const llmResponse = `VERDICT: REJECT

CONCERN: DRY-01 | Validation duplicated across 3 places
SEVERITY: BLOCKING
LOCATION:
  - api/index.get.ts (line 31)
FIX REQUIRED: Choose ONE layer for validation`

      const concerns = parseConcernsFromResponse(llmResponse)
      const verifications = parseVerificationsFromResponse(llmResponse, concerns)

      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.BLOCKING)
      expect(concerns[0].ruleId).toBe('DRY-01')
      expect(concerns[0].description).toContain('Choose ONE layer for validation')

      const result = buildCriticResponse(CRITIC_VERDICTS.REJECT, llmResponse, 200, concerns, verifications)

      expect(result.verdict).toBe(CRITIC_VERDICTS.REJECT)
      expect(result.concerns).toHaveLength(1)
      expect(result.concerns[0].severity).toBe(SEVERITY.BLOCKING)
    })

    it('full flow: LLM REJECT with multiple severity levels', () => {
      const llmResponse = `VERDICT: REJECT

CONCERN: SEC-01 | SQL injection vulnerability
SEVERITY: CRITICAL
LOCATION:
  - api/users.ts (lines 20-25)
FIX REQUIRED: Use parameterized queries

CONCERN: DRY-01 | Duplicate validation
SEVERITY: BLOCKING
LOCATION:
  - api/auth.ts (lines 10-15)
FIX REQUIRED: Centralize validation

CONCERN: STYLE-01 | Naming inconsistency
SEVERITY: INFO
LOCATION:
  - utils/helper.ts (line 5)
FIX REQUIRED: Use consistent naming`

      const concerns = parseConcernsFromResponse(llmResponse)

      expect(concerns).toHaveLength(3)

      const sec = concerns.find(c => c.ruleId === 'SEC-01')
      const dry = concerns.find(c => c.ruleId === 'DRY-01')
      const style = concerns.find(c => c.ruleId === 'STYLE-01')

      expect(sec?.severity).toBe(SEVERITY.CRITICAL)
      expect(dry?.severity).toBe(SEVERITY.BLOCKING)
      expect(style?.severity).toBe(SEVERITY.INFO)

      const result = buildCriticResponse(CRITIC_VERDICTS.REJECT, llmResponse, 250, concerns, [])

      expect(result.verdict).toBe(CRITIC_VERDICTS.REJECT)
    })
  })

  describe('Round 2 verification flow', () => {
    it('VERIFIED blocks get matched to existing concerns', () => {
      const llmResponse = `VERIFIED: a.ts → Fixed`
      const existingConcerns: Concern[] = [
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
          evidence: 'b.ts:2',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]

      const verifications = parseVerificationsFromResponse(llmResponse, existingConcerns)

      expect(verifications).toHaveLength(1)
      expect(verifications[0].verified).toBe(true)
      expect(verifications[0].ruleId).toBe('DRY-01')
    })

    it('NOT_VERIFIED blocks correctly identified', () => {
      const llmResponse = `NOT_VERIFIED: a.ts → Still broken`

      const existingConcerns: Concern[] = [
        {
          ruleId: 'DRY-01',
          description: 'Duplication',
          severity: SEVERITY.BLOCKING,
          evidence: 'a.ts:1',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]

      const verifications = parseVerificationsFromResponse(llmResponse, existingConcerns)

      expect(verifications).toHaveLength(1)
      expect(verifications[0].verified).toBe(false)
      expect(verifications[0].ruleId).toBe('DRY-01')
    })

    it('mixed verified and not verified', () => {
      const llmResponse = `VERIFIED: a.ts → Fixed
NOT_VERIFIED: b.ts → Still broken`

      const existingConcerns: Concern[] = [
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
          evidence: 'b.ts:2',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]

      const verifications = parseVerificationsFromResponse(llmResponse, existingConcerns)

      const verified = verifications.filter(v => v.verified)
      const notVerified = verifications.filter(v => !v.verified)

      expect(verified).toHaveLength(1)
      expect(notVerified).toHaveLength(1)
      expect(verified[0].ruleId).toBe('DRY-01')
      expect(notVerified[0].ruleId).toBe('MAGIC-01')
    })
  })

  describe('DEBT verdict flow', () => {
    it('DEBT verdict builds correctly', () => {
      const llmResponse = `VERDICT: DEBT

CONCERN: DRY-01 | Duplicate code
SEVERITY: BLOCKING
LOCATION:
  - api/a.ts (lines 10-20)
FIX REQUIRED: Extract to utility`

      const concerns = parseConcernsFromResponse(llmResponse)
      const verifications = parseVerificationsFromResponse(llmResponse, concerns)

      const result = buildCriticResponse(CRITIC_VERDICTS.DEBT, llmResponse, 180, concerns, verifications)

      expect(result.verdict).toBe(CRITIC_VERDICTS.DEBT)
      expect(result.summary).toContain('concerns resolved')
    })
  })

  describe('i18n pattern - not a magic string', () => {
    it('correctly identifies i18n key as not a concern', () => {
      const llmResponse = `VERDICT: ACCEPT

OBSERVATION: LABELS contains { OPTION_A: 'label.optionA', ... }
CONTEXT CHECK:
  - Is this used as display text? NO - used as i18n key
  - Is this used for comparison? NO - used for lookup
  - Is this a user-facing string? NO - i18n file provides that
ASSESSMENT: This is STANDARD i18n pattern. String keys are acceptable.
IMPACT IF IGNORED: None`

      const concerns = parseConcernsFromResponse(llmResponse)
      expect(concerns).toHaveLength(0)

      const result = buildCriticResponse(CRITIC_VERDICTS.ACCEPT, llmResponse, 100, concerns, [])

      expect(result.verdict).toBe(CRITIC_VERDICTS.ACCEPT)
      expect(result.remainingConcerns).toHaveLength(0)
    })
  })

  describe('SEVERITY parsing E2E', () => {
    it('BLOCKING severity parsed correctly in REJECT flow', () => {
      const llmResponse = `VERDICT: REJECT

CONCERN: DRY-01 | Validation in 3 places
SEVERITY: BLOCKING
LOCATION:
  - api/index.ts (line 31)
FIX REQUIRED: Choose one layer`

      const concerns = parseConcernsFromResponse(llmResponse)

      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.BLOCKING)

      const result = buildCriticResponse(CRITIC_VERDICTS.REJECT, llmResponse, 150, concerns, [])

      expect(result.concerns[0].severity).toBe(SEVERITY.BLOCKING)
    })

    it('WARNING severity parsed correctly', () => {
      const llmResponse = `VERDICT: REJECT

CONCERN: DRY-01 | Could be cleaner
SEVERITY: WARNING
LOCATION:
  - api/index.ts (line 31)
FIX REQUIRED: Consider refactoring`

      const concerns = parseConcernsFromResponse(llmResponse)

      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.WARNING)
    })

    it('INFO severity parsed correctly', () => {
      const llmResponse = `VERDICT: REJECT

CONCERN: STYLE-01 | Naming suggestion
SEVERITY: INFO
LOCATION:
  - utils.ts (line 5)
FIX REQUIRED: Consider renaming`

      const concerns = parseConcernsFromResponse(llmResponse)

      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.INFO)
    })

    it('CRITICAL severity parsed correctly', () => {
      const llmResponse = `VERDICT: REJECT

CONCERN: SEC-01 | SQL injection
SEVERITY: CRITICAL
LOCATION:
  - api/users.ts (lines 20-25)
FIX REQUIRED: Use parameterized queries`

      const concerns = parseConcernsFromResponse(llmResponse)

      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.CRITICAL)
    })

    it('defaults to WARNING when SEVERITY not specified', () => {
      const llmResponse = `VERDICT: REJECT

CONCERN: DRY-01 | Duplication
LOCATION:
  - api/index.ts (line 31)
FIX REQUIRED: Extract to utility`

      const concerns = parseConcernsFromResponse(llmResponse)

      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.WARNING)
    })
  })
})
