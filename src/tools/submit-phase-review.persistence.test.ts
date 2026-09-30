import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSubmitPhaseReview } from '@/tools/submit-phase-review'

const complete = vi.hoisted(() => vi.fn())
vi.mock('@/llm', () => ({
  createLLMProvider: () => ({ providerId: 'openai', complete }),
  getProviderLabel: () => 'test provider',
  isCliProvider: () => false
}))

const payload = (count: number) =>
  Array.from({ length: count }, (_, i) => `FILE: src/file${i}.ts\nCONTENT:\nexport const value${i} = ${i}\n`).join('\n')
const input = { phaseId: 'release-test', report: 'src/file0.ts:1 complete source change; no TODOs remain.' }
const concern = {
  ruleId: 'SEC-1',
  description: 'validation',
  severity: 'blocking',
  evidence: 'src/file0.ts:1',
  verified: false,
  reviewStatus: 'PENDING'
}
const session = (round = 1, response = 'VERDICT: REJECT') => ({
  phaseId: input.phaseId,
  round,
  concerns: [concern],
  history: [{ round, report: input.report, verdict: 'REJECT', criticResponse: response }]
})

async function inventory(root: string, relative = ''): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      entries[path] = 'directory'
      Object.assign(entries, await inventory(root, path))
    } else
      entries[path] = createHash('sha256')
        .update(await readFile(join(root, path)))
        .digest('hex')
  }
  return entries
}

function resultPayload(result: Awaited<ReturnType<typeof handleSubmitPhaseReview>>): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

let workspace = ''
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vibe-release-'))
  vi.stubEnv('VIBE_WORKSPACE_ROOT', workspace)
  vi.stubEnv('CRITIC_PROVIDER', 'openai')
  complete.mockReset()
  complete.mockResolvedValue({
    content: 'VERDICT: ACCEPT\nComplete source checked.',
    usage: { promptTokens: 200, completionTokens: 200 }
  })
  await mkdir(join(workspace, 'src'))
  for (let i = 0; i < 21; i++) await writeFile(join(workspace, `src/file${i}.ts`), `export const value${i} = ${i}\n`)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(workspace, { recursive: true, force: true })
})

async function seedState(round = 1, response?: string): Promise<void> {
  await mkdir(join(workspace, '.vibe/cases'), { recursive: true })
  await writeFile(join(workspace, '.vibe/review-session.json'), JSON.stringify(session(round, response)))
  await writeFile(
    join(workspace, '.vibe/status.json'),
    JSON.stringify({ currentPhase: 1, completedPhases: [], conflictCount: 4 })
  )
  await writeFile(join(workspace, '.vibe/cases/existing.json'), 'preserved')
  await writeFile(join(workspace, 'DEBT.md'), '# Preserved debt\n')
}

describe('readOnly workspace inventory', () => {
  it.each(['ACCEPT', 'CONCERNS_ADDRESSED', 'REJECT', 'BLOCK', 'DEBT', 'INSUFFICIENT'])(
    'preserves pristine and seeded workspaces for %s',
    async verdict => {
      for (const seeded of [false, true]) {
        if (seeded) await seedState()
        complete.mockResolvedValue({
          content: verdict === 'INSUFFICIENT' ? 'No structured verdict.' : `VERDICT: ${verdict}\nComplete review.`,
          usage: { promptTokens: 200, completionTokens: 200 }
        })
        const before = await inventory(workspace)
        const result = resultPayload(
          await handleSubmitPhaseReview({
            ...input,
            semanticDiff: payload(1),
            readOnly: true,
            updateStatus: true,
            logToDebt: { subject: 'acknowledged', rationale: 'test rationale' }
          })
        )
        expect(result.verdict).toBe(verdict === 'INSUFFICIENT' ? 'INSUFFICIENT_REVIEW' : verdict)
        expect(await inventory(workspace)).toEqual(before)
      }
    }
  )

  it.each([false, true])('keeps DEBT semantics in round two with logToDebt=%s', async logging => {
    await seedState()
    complete.mockResolvedValue({ content: 'VERDICT: DEBT', usage: { completionTokens: 200 } })
    const before = await inventory(workspace)
    const result = resultPayload(
      await handleSubmitPhaseReview({
        ...input,
        semanticDiff: payload(1),
        readOnly: true,
        round: 2,
        ...(logging ? { logToDebt: { subject: 'debt', rationale: 'reason' } } : {})
      })
    )
    expect(result.verdict).toBe(logging ? 'DEBT' : 'REJECT')
    expect(await inventory(workspace)).toEqual(before)
  })

  it.each(['ACCEPT', 'CONCERNS_ADDRESSED'])(
    'blocks %s with unresolved seeded concerns, accepts only verified resolution',
    async verdict => {
      await seedState()
      const before = await inventory(workspace)
      complete.mockResolvedValue({ content: `VERDICT: ${verdict}`, usage: { completionTokens: 200 } })
      expect(
        resultPayload(await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly: true, round: 2 }))
          .verdict
      ).toBe('DEBT')
      complete.mockResolvedValue({
        content: `VERIFIED: src/file0.ts → validation fixed\nVERDICT: ${verdict}`,
        usage: { completionTokens: 200 }
      })
      expect(
        resultPayload(await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly: true, round: 2 }))
          .verdict
      ).toBe(verdict)
      expect(await inventory(workspace)).toEqual(before)
    }
  )

  it.each([2, 3])('returns terminal deadlock data without mutation for seeded round %i', async seededRound => {
    await seedState(seededRound)
    complete.mockResolvedValue({ content: 'VERDICT: BLOCK', usage: { completionTokens: 200 } })
    const before = await inventory(workspace)
    const result = resultPayload(
      await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly: true, round: 3 })
    )
    expect(result.verdict).toBe('DEADLOCK')
    expect(result.caseId).toEqual(expect.any(String))
    expect(complete).toHaveBeenCalledTimes(seededRound === 3 ? 0 : 1)
    expect(await inventory(workspace)).toEqual(before)
  })

  it('preserves workspace for validation and provider errors', async () => {
    await seedState()
    const before = await inventory(workspace)
    expect(
      resultPayload(await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly: 'true' })).error
    ).toBeDefined()
    expect(complete).not.toHaveBeenCalled()
    complete.mockRejectedValue(new Error('provider unavailable'))
    expect(
      resultPayload(await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly: true })).error
    ).toBe('provider unavailable')
    expect(await inventory(workspace)).toEqual(before)
  })
})

describe('carrier and additional source bounds', () => {
  it.each(['files', 'inline', 'raw', 'json'])(
    '%s carrier transmits 1/10 complete sources and rejects 11/21 before invocation',
    async carrier => {
      for (const count of [1, 10, 11, 21]) {
        complete.mockClear()
        const corpus = payload(count)
        await writeFile(
          join(workspace, 'corpus.txt'),
          carrier === 'json' ? JSON.stringify({ semanticDiff: corpus }) : corpus
        )
        let args: { files?: string[]; semanticDiff?: string; semanticDiffPath?: string }
        if (carrier === 'files') args = { files: Array.from({ length: count }, (_, i) => `src/file${i}.ts`) }
        else if (carrier === 'inline') args = { semanticDiff: corpus }
        else args = { semanticDiffPath: 'corpus.txt' }
        const result = resultPayload(await handleSubmitPhaseReview({ ...input, ...args, readOnly: true }))
        expect(complete).toHaveBeenCalledTimes(count <= 10 ? 1 : 0)
        if (count <= 10) {
          expect(result.verdict).toBe('ACCEPT')
          expect(result.filesAnalyzed).toBe(count)
          for (let i = 0; i < count; i++) {
            expect(complete.mock.calls[0][0][1].content).toContain(
              `FILE: src/file${i}.ts\nCONTENT:\nexport const value${i} = ${i}\n`
            )
          }
        } else expect(result.error).toBeDefined()
      }
    }
  )

  it.each([9, 10])('counts initial %i plus one requested source together', async count => {
    await seedState(1, 'REQUEST: src/file20.ts:1-2')
    await writeFile(join(workspace, 'src/file20.ts'), `${'export const line = 1\n'.repeat(200)}// FULL_TAIL\n`)
    const before = await inventory(workspace)
    const result = resultPayload(
      await handleSubmitPhaseReview({ ...input, semanticDiff: payload(count), readOnly: true, round: 2 })
    )
    expect(complete).toHaveBeenCalledTimes(count === 9 ? 1 : 0)
    if (count === 9) expect(complete.mock.calls[0][0][1].content).toContain('// FULL_TAIL')
    else expect(result.error).toContain('full content slots')
    expect(await inventory(workspace)).toEqual(before)
  })

  it.each(['REQUEST: src/file18.ts\nREQUEST: src/file19.ts', 'REQUEST: missing.ts', 'REQUEST: README.md', 'REQUEST:'])(
    'fails unresolved or aggregate requested context: %s',
    async response => {
      await writeFile(join(workspace, 'README.md'), 'const snippet = 1')
      await seedState(1, response)
      const before = await inventory(workspace)
      expect(
        resultPayload(await handleSubmitPhaseReview({ ...input, semanticDiff: payload(9), readOnly: true, round: 2 }))
          .error
      ).toBeDefined()
      expect(complete).not.toHaveBeenCalled()
      expect(await inventory(workspace)).toEqual(before)
    }
  )

  it('does not accept a current unresolved REQUEST', async () => {
    complete.mockResolvedValue({ content: 'REQUEST: missing.ts\nVERDICT: ACCEPT', usage: { completionTokens: 200 } })
    expect(
      resultPayload(await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly: true })).verdict
    ).toBe('INSUFFICIENT_REVIEW')
  })
})

describe('ordinary persistence remains enabled', () => {
  it.each([undefined, false])('persists fresh reject, debt and terminal conflict with readOnly=%s', async readOnly => {
    await seedState(1, 'old history')
    complete.mockResolvedValue({ content: 'VERDICT: REJECT', usage: { completionTokens: 200 } })
    await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly })
    const fresh = JSON.parse(await readFile(join(workspace, '.vibe/review-session.json'), 'utf8')) as {
      history: unknown[]
    }
    expect(fresh.history).toHaveLength(1)
    complete.mockResolvedValue({ content: 'VERDICT: DEBT', usage: { completionTokens: 200 } })
    await handleSubmitPhaseReview({
      ...input,
      semanticDiff: payload(1),
      readOnly,
      round: 2,
      logToDebt: { subject: 'Logged debt', rationale: 'required' }
    })
    expect(await readFile(join(workspace, 'DEBT.md'), 'utf8')).toContain('Logged debt')
    complete.mockResolvedValue({ content: 'VERDICT: BLOCK', usage: { completionTokens: 200 } })
    expect(
      resultPayload(await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), readOnly, round: 3 })).verdict
    ).toBe('DEADLOCK')
    expect(await readdir(join(workspace, '.vibe/cases'))).toHaveLength(2)
    expect(await inventory(workspace)).not.toHaveProperty('.vibe/review-session.json')
  })

  it('persists acceptance status, while updateStatus:false controls only status', async () => {
    await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1) })
    expect(await inventory(workspace)).toHaveProperty('.vibe/status.json')
    complete.mockResolvedValue({ content: 'VERDICT: REJECT', usage: { completionTokens: 200 } })
    await handleSubmitPhaseReview({ ...input, semanticDiff: payload(1), updateStatus: false })
    expect(await inventory(workspace)).toHaveProperty('.vibe/review-session.json')
  })
})
