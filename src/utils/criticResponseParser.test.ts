/**
 * Unit tests for criticResponseParser.
 */

import { describe, expect, it } from 'vitest'
import {
  parseConcernsFromResponse,
  parseVerificationsFromResponse,
  parseRequestsFromResponse,
  hasConcernBlocks,
  hasVerificationBlocks,
  hasRequestBlocks,
  filterConcernsBySemanticDiff
} from '@/utils/criticResponseParser'
import { SEVERITY, CONCERN_REVIEW_STATUS } from '@/constants'

describe('criticResponseParser', () => {
  describe('parseConcernsFromResponse', () => {
    it('parses SEVERITY: BLOCKING from concern block', () => {
      const response = `CONCERN: DRY-01 | Validation duplicated
LOCATION:
  - api/index.ts (lines 31-35)
SEVERITY: BLOCKING
ANALYSIS:
  Multiple validation layers
FIX REQUIRED: Centralize validation`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.BLOCKING)
      expect(concerns[0].ruleId).toBe('DRY-01')
    })

    it('parses SEVERITY: WARNING from concern block', () => {
      const response = `CONCERN: COMPLEX-01 | High complexity
LOCATION:
  - utils/helper.ts (lines 10-50)
SEVERITY: WARNING
ANALYSIS:
  Function complexity above threshold
FIX REQUIRED: Extract helper function`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.WARNING)
    })

    it('parses SEVERITY: INFO from concern block', () => {
      const response = `CONCERN: STYLE-01 | Naming inconsistency
LOCATION:
  - src/utils.ts (line 5)
SEVERITY: INFO
ANALYSIS:
  Variable naming could be more descriptive
FIX REQUIRED: Consider renaming`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.INFO)
    })

    it('parses SEVERITY: CRITICAL from concern block', () => {
      const response = `CONCERN: SEC-01 | SQL injection vulnerability
LOCATION:
  - api/users.ts (lines 20-25)
SEVERITY: CRITICAL
ANALYSIS:
  User input directly concatenated to query
FIX REQUIRED: Use parameterized queries`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.CRITICAL)
    })

    it('defaults to WARNING when SEVERITY not specified', () => {
      const response = `CONCERN: DRY-01 | Raw string literals duplicated
LOCATION:
  - src/components/Badge.tsx (lines 72-74)
FIX REQUIRED: Create shared constant`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].severity).toBe(SEVERITY.WARNING)
    })

    it('parses multiline concern with all new fields', () => {
      const response = `CONCERN: DRY-01 | Validation duplicated across 3 layers
SEVERITY: BLOCKING
LOCATION:
  - api/index.get.ts (line 31)
  - api/index.post.ts (line 17)
  - service/application.service.ts (line 101)
OBSERVATION:
  Validation exists at 3 layers
ANALYSIS:
  Defense in depth but maintenance overhead
PATTERN A - API validates:
  API: const validated = isValidType(x) ? x : undefined
  Service: if (validated) record.type = validated
PATTERN B - Service validates:
  API: const type = query.type
  Service: if (type && isValidType(type)) record.type = type
FIX REQUIRED: Choose one layer for validation
IMPACT IF IGNORED: Medium`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].ruleId).toBe('DRY-01')
      expect(concerns[0].severity).toBe(SEVERITY.BLOCKING)
      expect(concerns[0].evidence).toBe('service/application.service.ts:101')
      expect(concerns[0].description).toContain('Choose one layer for validation')
    })

    it('parses single concern with compact evidence', () => {
      const response = 'CONCERN: MAGIC-001 | Magic string in filter | EVIDENCE: src/components/Badge.tsx:15'
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0]).toMatchObject({
        ruleId: 'MAGIC-001',
        description: 'Magic string in filter',
        severity: SEVERITY.WARNING,
        evidence: 'src/components/Badge.tsx:15',
        verified: false,
        reviewStatus: CONCERN_REVIEW_STATUS.PENDING
      })
    })

    it('parses multiple concerns in compact format', () => {
      const response = `CONCERN: MAGIC-001 | Magic string in filter | EVIDENCE: src/components/Badge.tsx:15
CONCERN: DRY-002 | Duplicate code detected | EVIDENCE: src/utils/helper.ts:42-45`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(2)
      expect(concerns[0].ruleId).toBe('MAGIC-001')
      expect(concerns[1].ruleId).toBe('DRY-002')
    })

    it('returns empty array when no concerns found', () => {
      const response = 'Everything looks good! ACCEPT.'
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(0)
    })

    it('handles compact evidence with line ranges', () => {
      const response = 'CONCERN: COMPLEX-001 | High cognitive complexity | EVIDENCE: src/utils/parser.ts:100-120'
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].evidence).toBe('src/utils/parser.ts:100-120')
    })

    it('parses multiline concern format with LOCATION', () => {
      const response = `CONCERN: DRY-01 | Raw string literals duplicated across files
LOCATION:
  - web/app/pages/applications/index.vue (lines 72-74)
EVIDENCE:
  - Filter options use hardcoded strings:
    value: 'Active'
FIX REQUIRED: Create shared constant STATUS_OPTIONS in shared/constants/app.ts
EXAMPLE:
  Before: value: 'Active'
  After:  value: STATUS_OPTIONS.ACTIVE`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].ruleId).toBe('DRY-01')
      expect(concerns[0].evidence).toBe('web/app/pages/applications/index.vue:72-74')
    })

    it('parses multiline concern with FIX REQUIRED', () => {
      const response = `CONCERN: DRY-02 | Magic string detected
LOCATION:
  - src/constants.ts (lines 15-20)
EVIDENCE:
  - Hardcoded status values
FIX REQUIRED: Replace with STATUS_CODES constant
EXAMPLE:
  Before: 'active'
  After:  STATUS_CODES.ACTIVE`
      const concerns = parseConcernsFromResponse(response)
      expect(concerns).toHaveLength(1)
      expect(concerns[0].ruleId).toBe('DRY-02')
      expect(concerns[0].description).toContain('Replace with STATUS_CODES constant')
    })
  })

  describe('parseVerificationsFromResponse', () => {
    const existingConcerns = [
      {
        ruleId: 'MAGIC-001',
        description: 'Magic string',
        severity: SEVERITY.WARNING,
        evidence: 'src/components/Badge.tsx:15',
        verified: false,
        reviewStatus: CONCERN_REVIEW_STATUS.PENDING
      }
    ]

    it('parses VERIFIED block', () => {
      const response = 'VERIFIED: src/components/Badge.tsx:15 → Import { STATUS_OPTIONS } added'
      const verifications = parseVerificationsFromResponse(response, existingConcerns)
      expect(verifications).toHaveLength(1)
      expect(verifications[0].verified).toBe(true)
      expect(verifications[0].verificationEvidence).toContain('src/components/Badge.tsx:15')
    })

    it('parses NOT_VERIFIED block', () => {
      const response = 'NOT_VERIFIED: src/components/Badge.tsx:15 → Magic string still present at line 18'
      const verifications = parseVerificationsFromResponse(response, existingConcerns)
      expect(verifications).toHaveLength(1)
      expect(verifications[0].verified).toBe(false)
    })

    it('parses mixed verified and not verified', () => {
      const response = `VERIFIED: src/components/Badge.tsx:15 → Fixed
NOT_VERIFIED: src/utils/helper.ts:42 → Still broken`
      const concerns = [
        {
          ruleId: 'A',
          description: 'A',
          severity: SEVERITY.WARNING,
          evidence: 'src/components/Badge.tsx:15',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        },
        {
          ruleId: 'B',
          description: 'B',
          severity: SEVERITY.WARNING,
          evidence: 'src/utils/helper.ts:42',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const verifications = parseVerificationsFromResponse(response, concerns)
      expect(verifications).toHaveLength(2)
      const verified = verifications.find(v => v.ruleId === 'A')
      const notVerified = verifications.find(v => v.ruleId === 'B')
      expect(verified?.verified).toBe(true)
      expect(notVerified?.verified).toBe(false)
    })

    it('returns empty array when no verifications found', () => {
      const response = 'Everything verified correctly.'
      const verifications = parseVerificationsFromResponse(response, existingConcerns)
      expect(verifications).toHaveLength(0)
    })
  })

  describe('hasConcernBlocks', () => {
    it('returns true when CONCERN: and EVIDENCE: present', () => {
      const response = 'CONCERN: MAGIC-001 | desc | EVIDENCE: src/file.ts:10'
      expect(hasConcernBlocks(response)).toBe(true)
    })

    it('returns false when only CONCERN: present without EVIDENCE:', () => {
      const response = 'CONCERN: MAGIC-001 | desc'
      expect(hasConcernBlocks(response)).toBe(false)
    })

    it('returns false when neither present', () => {
      const response = 'All good!'
      expect(hasConcernBlocks(response)).toBe(false)
    })
  })

  describe('hasVerificationBlocks', () => {
    it('returns true when VERIFIED: present', () => {
      const response = 'VERIFIED: src/file.ts:10 → Fixed'
      expect(hasVerificationBlocks(response)).toBe(true)
    })

    it('returns true when NOT_VERIFIED: present', () => {
      const response = 'NOT_VERIFIED: src/file.ts:10 → Still broken'
      expect(hasVerificationBlocks(response)).toBe(true)
    })

    it('returns false when neither present', () => {
      const response = 'No verifications needed.'
      expect(hasVerificationBlocks(response)).toBe(false)
    })
  })

  describe('hasRequestBlocks', () => {
    it('returns true when REQUEST: is present (uppercase)', () => {
      const response = 'REQUEST: src/file.ts:10-20'
      expect(hasRequestBlocks(response)).toBe(true)
    })

    it('returns true when REQUEST: is present (mixed case)', () => {
      const response = 'Request: src/file.ts:10-20'
      expect(hasRequestBlocks(response)).toBe(true)
    })

    it('returns false when no REQUEST block', () => {
      const response = 'All good, no requests.'
      expect(hasRequestBlocks(response)).toBe(false)
    })
  })

  describe('parseRequestsFromResponse', () => {
    it('parses single file request', () => {
      const response = 'REQUEST: src/utils/helper.ts:45-60'
      const requests = parseRequestsFromResponse(response)
      expect(requests).toHaveLength(1)
      expect(requests[0].filePath).toBe('src/utils/helper.ts')
      expect(requests[0].lineRange).toBe('45-60')
    })

    it('parses multiple file requests separated by comma', () => {
      const response = 'REQUEST: src/utils/helper.ts:45-60, src/constants.ts'
      const requests = parseRequestsFromResponse(response)
      expect(requests).toHaveLength(2)
      expect(requests[0].filePath).toBe('src/utils/helper.ts')
      expect(requests[0].lineRange).toBe('45-60')
      expect(requests[1].filePath).toBe('src/constants.ts')
    })

    it('parses file without line range', () => {
      const response = 'REQUEST: src/constants.ts'
      const requests = parseRequestsFromResponse(response)
      expect(requests).toHaveLength(1)
      expect(requests[0].filePath).toBe('src/constants.ts')
      expect(requests[0].lineRange).toBeUndefined()
    })

    it('returns empty array when no requests found', () => {
      const response = 'Everything looks good, no files needed.'
      const requests = parseRequestsFromResponse(response)
      expect(requests).toHaveLength(0)
    })

    it('handles multiple REQUEST lines', () => {
      const response = `REQUEST: src/file1.ts:10-20
Some other text
REQUEST: src/file2.ts`
      const requests = parseRequestsFromResponse(response)
      expect(requests).toHaveLength(2)
      expect(requests[0].filePath).toBe('src/file1.ts')
      expect(requests[1].filePath).toBe('src/file2.ts')
    })
  })

  describe('filterConcernsBySemanticDiff', () => {
    const semanticDiff = `
FILE: src/utils/helper.ts
CONTENT:
import { sum } from './math'
export function calculateTotal(items: number[]): number {
  return items.reduce((acc, curr) => acc + curr, 0)
}
export function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2)
}
`

    it('returns empty array when concerns array is empty', () => {
      expect(filterConcernsBySemanticDiff([], semanticDiff)).toHaveLength(0)
    })

    it('returns all concerns when semanticDiff is empty', () => {
      const concerns = [
        {
          ruleId: 'DRY-01',
          description: 'Duplicated logic',
          severity: SEVERITY.WARNING,
          evidence: 'src/utils/nonexistent.ts:10',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      expect(filterConcernsBySemanticDiff(concerns, '')).toEqual(concerns)
    })

    it('keeps concern citing a file present in semanticDiff with valid line numbers and keywords', () => {
      const concerns = [
        {
          ruleId: 'COMPLEX-01',
          description: 'High complexity in calculateTotal function reduce',
          severity: SEVERITY.WARNING,
          evidence: 'src/utils/helper.ts:2-4',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const result = filterConcernsBySemanticDiff(concerns, semanticDiff)
      expect(result).toHaveLength(1)
      expect(result[0].ruleId).toBe('COMPLEX-01')
    })

    it('filters out concerns citing files NOT in semanticDiff', () => {
      const concerns = [
        {
          ruleId: 'SEC-01',
          description: 'SQL injection vulnerability in query builder',
          severity: SEVERITY.CRITICAL,
          evidence: 'src/db/users.ts:15-20',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const result = filterConcernsBySemanticDiff(concerns, semanticDiff)
      expect(result).toHaveLength(0)
    })

    it('filters out concerns citing valid files but with line numbers exceeding file total lines', () => {
      const concerns = [
        {
          ruleId: 'DRY-01',
          description: 'Duplicated calculation in formatCurrency function',
          severity: SEVERITY.WARNING,
          evidence: 'src/utils/helper.ts:50-55',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const result = filterConcernsBySemanticDiff(concerns, semanticDiff)
      expect(result).toHaveLength(0)
    })

    it('filters out concerns when function identifier cited in description is missing from content', () => {
      const concerns = [
        {
          ruleId: 'NAMES-01',
          description: 'Bad identifier missingFunction in helper file',
          severity: SEVERITY.WARNING,
          evidence: 'src/utils/helper.ts:3-5',
          verified: false,
          reviewStatus: CONCERN_REVIEW_STATUS.PENDING
        }
      ]
      const result = filterConcernsBySemanticDiff(concerns, semanticDiff)
      expect(result).toHaveLength(0)
    })
  })
})
