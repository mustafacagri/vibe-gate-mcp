/**
 * Structured verdict extraction — fail-closed.
 * Only a trailing `VERDICT: <token>` line counts. Free-prose words like
 * "reject" / "ACCEPT this pattern" must not steal the structured field.
 */

import { describe, expect, it } from 'vitest'
import { CRITIC_VERDICTS } from '@/constants'
import { parseVerdictFromResponse, hasStructuredProseMismatch } from '@/utils/criticResponseParser'

describe('parseVerdictFromResponse', () => {
  it('reads the last VERDICT: line (not leftmost free-prose token)', () => {
    const text = `I considered REJECT but the code is fine.
The pattern should reject invalid input.
VERDICT: ACCEPT`
    expect(parseVerdictFromResponse(text)).toBe(CRITIC_VERDICTS.ACCEPT)
  })

  it('does not treat early ACCEPT prose as the verdict when VERDICT: REJECT ends the response', () => {
    const text = `Do not ACCEPT this change without tests.
VERDICT: REJECT`
    expect(parseVerdictFromResponse(text)).toBe(CRITIC_VERDICTS.REJECT)
  })

  it('ignores SEVERITY: BLOCKING and fail-closed wording', () => {
    const text = `SEVERITY: BLOCKING
Analysis: fail-closed path is missing.
VERDICT: DEBT`
    expect(parseVerdictFromResponse(text)).toBe(CRITIC_VERDICTS.DEBT)
  })

  it('returns null when no VERDICT: line exists (fail-closed → INSUFFICIENT_REVIEW upstream)', () => {
    expect(parseVerdictFromResponse('Looks good. ACCEPT.')).toBeNull()
    expect(parseVerdictFromResponse('REJECT this PR.')).toBeNull()
  })

  it('uses the last VERDICT: when multiple lines exist', () => {
    const text = `VERDICT: REJECT
(after re-check)
VERDICT: CONCERNS_ADDRESSED`
    expect(parseVerdictFromResponse(text)).toBe(CRITIC_VERDICTS.CONCERNS_ADDRESSED)
  })
})

describe('hasStructuredProseMismatch', () => {
  it('flags BLOCK structured + closing Ready to ACCEPT prose', () => {
    const text = `CONCERN: X | y
SEVERITY: BLOCKING
Closing: Ready to ACCEPT this batch.
VERDICT: BLOCK`
    expect(hasStructuredProseMismatch(text, CRITIC_VERDICTS.BLOCK)).toBe(true)
  })

  it('flags ACCEPT structured + Do not ACCEPT closing prose', () => {
    const text = `Looks fine overall.
Do not ACCEPT until tests land.
VERDICT: ACCEPT`
    expect(hasStructuredProseMismatch(text, CRITIC_VERDICTS.ACCEPT)).toBe(true)
  })

  it('returns false when structured and prose agree', () => {
    const text = `Ready to ACCEPT this batch after verification.
VERDICT: ACCEPT`
    expect(hasStructuredProseMismatch(text, CRITIC_VERDICTS.ACCEPT)).toBe(false)
  })

  it('returns false when structured is null', () => {
    expect(hasStructuredProseMismatch('Ready to ACCEPT.', null)).toBe(false)
  })
})
