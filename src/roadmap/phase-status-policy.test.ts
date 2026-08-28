import { describe, expect, it } from 'vitest'
import { PHASE_STATUS_POLICY } from '@/constants'
import { shouldPersistPhaseStatus } from '@/roadmap/phase-status-policy'

describe('shouldPersistPhaseStatus', () => {
  it('skips default probe prefixes', () => {
    for (const prefix of PHASE_STATUS_POLICY.SKIP_STATUS_PREFIXES) {
      expect(shouldPersistPhaseStatus(`${prefix}example`)).toBe(false)
    }
  })

  it('persists normal phase ids by default', () => {
    expect(shouldPersistPhaseStatus('phase-6-§1a')).toBe(true)
    expect(shouldPersistPhaseStatus('1.2.3')).toBe(true)
  })

  it('honors explicit updateStatus false/true', () => {
    expect(shouldPersistPhaseStatus('phase-6-§1a', false)).toBe(false)
    expect(shouldPersistPhaseStatus('mcp-smoke-x', true)).toBe(true)
  })
})
