/**
 * log_human_decision — keep AI↔AI debate; block mid-loop ACCEPT_IMPLEMENTER
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONFLICT_LOOP, ENV_VIBE_HUMAN_CONFIRMATION_TOKEN, JUDGE_DECISIONS } from '@/constants'
import { handleLogHumanDecision } from '@/tools/log-human-decision'

vi.mock('@/conflict-loop/session', () => ({
  readSession: vi.fn()
}))

vi.mock('@/workspace', () => ({
  getWorkspaceRoot: () => '/workspace'
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  writeFile: vi.fn().mockResolvedValue(undefined)
}))

import { readSession } from '@/conflict-loop/session'

const mockedReadSession = vi.mocked(readSession)

describe('handleLogHumanDecision AI-first gates', () => {
  const prev = process.env[ENV_VIBE_HUMAN_CONFIRMATION_TOKEN]

  afterEach(() => {
    vi.clearAllMocks()
    if (prev === undefined) delete process.env[ENV_VIBE_HUMAN_CONFIRMATION_TOKEN]
    else process.env[ENV_VIBE_HUMAN_CONFIRMATION_TOKEN] = prev
  })

  it('rejects ACCEPT_IMPLEMENTER while Critic loop is still open (round < max)', async () => {
    mockedReadSession.mockResolvedValue({
      phaseId: 'phase-6-§2e',
      round: 1,
      concerns: [],
      history: []
    })

    const result = await handleLogHumanDecision({
      caseId: 'phase-6-§2e',
      decision: JUDGE_DECISIONS.ACCEPT_IMPLEMENTER,
      rationale: 'paper over mismatch'
    })
    const body = JSON.parse(result.content[0].text) as { success: boolean; code?: string }
    expect(body.success).toBe(false)
    expect(body.code).toBe('CONTINUE_CRITIC_DEBATE')
  })

  it('allows ACCEPT_IMPLEMENTER after max rounds (true deadlock escape)', async () => {
    mockedReadSession.mockResolvedValue({
      phaseId: 'phase-6-§2e',
      round: CONFLICT_LOOP.MAX_ROUNDS,
      concerns: [],
      history: []
    })

    const result = await handleLogHumanDecision({
      caseId: 'phase-6-§2e',
      decision: JUDGE_DECISIONS.ACCEPT_IMPLEMENTER,
      rationale: 'deadlock after max rounds'
    })
    const body = JSON.parse(result.content[0].text) as { success: boolean; code?: string }
    expect(body.success).toBe(true)
    expect(body.code).not.toBe('CONTINUE_CRITIC_DEBATE')
  })

  it('rejects when optional token env is set and confirmationToken missing', async () => {
    mockedReadSession.mockResolvedValue(null)
    process.env[ENV_VIBE_HUMAN_CONFIRMATION_TOKEN] = 'human-secret'
    const result = await handleLogHumanDecision({
      caseId: 'phase-6-§2e',
      decision: JUDGE_DECISIONS.ACCEPT_CRITIC,
      rationale: 'agree with critic'
    })
    const body = JSON.parse(result.content[0].text) as { success: boolean; code?: string }
    expect(body.success).toBe(false)
    expect(body.code).toBe('HUMAN_CONFIRMATION_REQUIRED')
  })
})
