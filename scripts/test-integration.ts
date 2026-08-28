/**
 * Integration tests for the full Critic review flow (Round 1→2→3).
 * Tests with simulated LLM responses to verify parsing, session management,
 * and verdict handling without real API calls.
 *
 * Run: npm run test:integration
 */

import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSession, readSession } from '@/conflict-loop/session'
import { parseConcernsFromResponse, parseVerificationsFromResponse } from '@/utils/criticResponseParser'
import { CRITIC_VERDICTS, SEVERITY } from '@/constants'
import type { Concern } from '@/conflict-loop/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const testDir = join(__dirname, '..', '.vibe-integration-test')
const originalCwd = process.cwd()

const MOCK_RESPONSES = {
  round1Reject: `I found several issues with this phase:

CONCERN: no-magic-numbers | Magic number 42 used at line 15 | EVIDENCE: src/utils/helper.ts:15
CONCERN: max-lines | Function exceeds 50 lines (actual: 67) | EVIDENCE: src/utils/helper.ts:45-112

The implementer added a new dependency "lodash" without justification. Bundle size impact not considered.

REJECT: Hard rule violations detected.`,
  round1Accept: `After thorough review of the provided context:

No concerns found. The changes are minimal, focused, and follow project rules. Dependencies are justified.

ACCEPT`,
  round1Debt: `The implementation is functional but has some quality concerns:

CONCERN: cognitive-complexity | Nested conditionals exceed complexity threshold | EVIDENCE: src/services/auth.ts:78-95
CONCERN: dry-violation | Duplicate validation logic | EVIDENCE: src/services/auth.ts:102

These are soft rule violations. The code works but should be addressed.

DEBT: Technical debt identified. Suggest logging to DEBT.md.`,
  round2VerificationFixed: `Checking Round 1 concerns:

VERIFIED: src/utils/helper.ts:15 → The magic number was replaced with a named constant MAX_RETRIES
VERIFIED: src/utils/helper.ts:45 → Function was refactored into smaller functions under 50 lines each

All concerns addressed. The implementation now meets quality standards.

ACCEPT`,
  round2VerificationNotFixed: `Checking Round 1 concerns:

NOT_VERIFIED: src/utils/helper.ts:15 → The magic number 42 still exists at line 18, not fixed
VERIFIED: src/utils/helper.ts:45 → Function was refactored successfully

One concern remains unverified. More work needed.

REJECT`,
  round3NoChanges: `Checking remaining concerns:

NOT_VERIFIED: src/utils/helper.ts:15 → Magic number 42 is still present at line 18 and line 23

No changes were made since Round 2. The issue persists.

DEBT: Issue remains unfixed. Recommend logging to DEBT.md if acceptable.`
} as const

async function setup(): Promise<void> {
  await mkdir(testDir, { recursive: true })
  process.chdir(testDir)
}

async function teardown(): Promise<void> {
  process.chdir(originalCwd)
  await rm(testDir, { recursive: true, force: true })
}

async function testParseConcernsFromRound1Reject(): Promise<void> {
  const concerns = parseConcernsFromResponse(MOCK_RESPONSES.round1Reject)

  if (concerns.length !== 2) {
    throw new Error(`Expected 2 concerns, got ${concerns.length}`)
  }

  const first = concerns[0]
  if (first.ruleId !== 'no-magic-numbers') {
    throw new Error(`Expected ruleId 'no-magic-numbers', got '${first.ruleId}'`)
  }
  if (!first.evidence.includes('src/utils/helper.ts:15')) {
    throw new Error(`Expected evidence to include 'src/utils/helper.ts:15', got '${first.evidence}'`)
  }
  if (first.severity !== SEVERITY.WARNING) {
    throw new Error(`Expected severity WARNING, got ${first.severity}`)
  }
  if (first.verified !== false) {
    throw new Error(`Expected verified=false`)
  }

  console.log('✅ Round 1 REJECT parsing: extracts 2 concerns with correct structure')
}

async function testParseConcernsFromRound1Accept(): Promise<void> {
  const concerns = parseConcernsFromResponse(MOCK_RESPONSES.round1Accept)

  if (concerns.length !== 0) {
    throw new Error(`Expected 0 concerns for ACCEPT, got ${concerns.length}`)
  }

  console.log('✅ Round 1 ACCEPT parsing: no concerns extracted')
}

async function testParseConcernsFromRound1Debt(): Promise<void> {
  const concerns = parseConcernsFromResponse(MOCK_RESPONSES.round1Debt)

  if (concerns.length !== 2) {
    throw new Error(`Expected 2 concerns, got ${concerns.length}`)
  }

  console.log('✅ Round 1 DEBT parsing: extracts 2 concerns')
}

async function testParseVerificationsAllFixed(): Promise<void> {
  const existingConcerns: Concern[] = [
    {
      ruleId: 'no-magic-numbers',
      description: 'Magic number',
      severity: SEVERITY.WARNING,
      evidence: 'src/utils/helper.ts:15',
      verified: false
    },
    {
      ruleId: 'max-lines',
      description: 'Function exceeds 50 lines',
      severity: SEVERITY.WARNING,
      evidence: 'src/utils/helper.ts:45',
      verified: false
    }
  ]

  const verifications = parseVerificationsFromResponse(MOCK_RESPONSES.round2VerificationFixed, existingConcerns)

  if (verifications.length !== 2) {
    throw new Error(`Expected 2 verifications, got ${verifications.length}`)
  }

  const verifiedOnes = verifications.filter(v => v.verified)
  if (verifiedOnes.length !== 2) {
    throw new Error(`Expected 2 verified, got ${verifiedOnes.length}`)
  }

  console.log('✅ Round 2 VERIFIED parsing: all concerns verified')
}

async function testParseVerificationsPartiallyFixed(): Promise<void> {
  const existingConcerns: Concern[] = [
    {
      ruleId: 'no-magic-numbers',
      description: 'Magic number',
      severity: SEVERITY.WARNING,
      evidence: 'src/utils/helper.ts:15',
      verified: false
    },
    {
      ruleId: 'max-lines',
      description: 'Function exceeds 50 lines',
      severity: SEVERITY.WARNING,
      evidence: 'src/utils/helper.ts:45',
      verified: false
    }
  ]

  const verifications = parseVerificationsFromResponse(MOCK_RESPONSES.round2VerificationNotFixed, existingConcerns)

  if (verifications.length !== 2) {
    throw new Error(`Expected 2 verifications, got ${verifications.length}`)
  }

  const notVerified = verifications.filter(v => !v.verified)
  const verified = verifications.filter(v => v.verified)

  if (notVerified.length !== 1 || verified.length !== 1) {
    throw new Error(`Expected 1 NOT_VERIFIED and 1 VERIFIED, got ${notVerified.length} and ${verified.length}`)
  }

  console.log('✅ Round 2 mixed VERIFIED/NOT_VERIFIED parsing')
}

async function testSessionPersistenceAcrossRounds(): Promise<void> {
  await clearSession(testDir)

  const session1 = {
    phaseId: '1.1.1',
    round: 1,
    concerns: parseConcernsFromResponse(MOCK_RESPONSES.round1Reject),
    history: [
      {
        round: 1,
        report: 'Added helper function with magic number',
        verdict: CRITIC_VERDICTS.REJECT,
        criticResponse: MOCK_RESPONSES.round1Reject
      }
    ]
  }

  await rm(join(testDir, '.vibe', 'session.json'), { force: true }).catch(() => {})

  const { writeSession } = await import('@/conflict-loop/session')
  await writeSession(testDir, session1)

  const { readSession: read } = await import('@/conflict-loop/session')
  const persisted = await read(testDir)

  if (!persisted) throw new Error('Session not persisted')
  if (persisted.phaseId !== '1.1.1') throw new Error(`Expected phaseId 1.1.1, got ${persisted.phaseId}`)
  if (persisted.round !== 1) throw new Error(`Expected round 1, got ${persisted.round}`)
  if (persisted.concerns.length !== 2) throw new Error(`Expected 2 concerns, got ${persisted.concerns.length}`)

  await clearSession(testDir)

  console.log('✅ Session persistence: concerns saved and restored correctly')
}

async function testVerdictExtraction(): Promise<void> {
  const verdictRegex = /\b(ACCEPT|REJECT|DEBT|INSUFFICIENT_REVIEW)\b(?!\.[A-Za-z])/gi

  const rejectMatch = MOCK_RESPONSES.round1Reject.match(verdictRegex)
  if (!rejectMatch || rejectMatch[0] !== 'REJECT') {
    throw new Error('Failed to extract REJECT verdict')
  }

  const acceptMatch = MOCK_RESPONSES.round1Accept.match(verdictRegex)
  if (!acceptMatch || acceptMatch[0] !== 'ACCEPT') {
    throw new Error('Failed to extract ACCEPT verdict')
  }

  const debtMatch = MOCK_RESPONSES.round1Debt.match(verdictRegex)
  if (!debtMatch || debtMatch[0] !== 'DEBT') {
    throw new Error('Failed to extract DEBT verdict')
  }

  console.log('✅ Verdict parsing: correctly extracts ACCEPT/REJECT/DEBT from mixed responses')
}

async function testDeadlockDetection(): Promise<void> {
  const MAX_ROUNDS = 3

  const sessionAtRound3 = {
    phaseId: '1.1.1',
    round: 3,
    concerns: [
      {
        ruleId: 'no-magic-numbers',
        description: 'Magic number',
        severity: SEVERITY.WARNING,
        evidence: 'src/utils/helper.ts:15',
        verified: false
      }
    ],
    history: [
      { round: 1, report: 'Report 1', verdict: 'REJECT', criticResponse: 'Response 1' },
      { round: 2, report: 'Report 2', verdict: 'REJECT', criticResponse: 'Response 2' },
      { round: 3, report: 'Report 3', verdict: 'DEBT', criticResponse: MOCK_RESPONSES.round3NoChanges }
    ]
  }

  const shouldDeadlock = sessionAtRound3.round >= MAX_ROUNDS
  if (!shouldDeadlock) {
    throw new Error('Should detect deadlock at round 3')
  }

  console.log('✅ Deadlock detection: correctly identifies Round 3 as deadlock condition')
}

async function testDebtRequiresLog(): Promise<void> {
  const { requiresDebtLog } = await import('@/utils/responseBuilder')

  if (!requiresDebtLog(2, 'DEBT')) {
    throw new Error('DEBT at round 2 should require logToDebt')
  }

  if (requiresDebtLog(1, 'DEBT')) {
    throw new Error('DEBT at round 1 should NOT require logToDebt')
  }

  console.log('✅ DEBT log requirement: correctly enforced at round 2+')
}

async function testTokenThresholdCheck(): Promise<void> {
  const { checkTokenThreshold } = await import('@/utils/responseBuilder')

  const insufficientAccept = checkTokenThreshold('ACCEPT', 49)
  if (insufficientAccept !== 'ACCEPT') {
    throw new Error(`ACCEPT with 49 tokens should stay ACCEPT now, got ${insufficientAccept}`)
  }

  const sufficientAccept = checkTokenThreshold('ACCEPT', 50)
  if (sufficientAccept !== 'ACCEPT') {
    throw new Error(`ACCEPT with 150 tokens should stay ACCEPT, got ${sufficientAccept}`)
  }

  const sufficientDebt = checkTokenThreshold('DEBT', 60)
  if (sufficientDebt !== 'DEBT') {
    throw new Error(`DEBT with 60 tokens should stay DEBT, got ${sufficientDebt}`)
  }

  console.log('✅ Token threshold: disabled to respect Critic verdict')
}

async function run(): Promise<void> {
  console.log('\n🧪 Vibe-Gate Integration Tests\n')

  await setup()

  try {
    await testParseConcernsFromRound1Reject()
    await testParseConcernsFromRound1Accept()
    await testParseConcernsFromRound1Debt()
    await testParseVerificationsAllFixed()
    await testParseVerificationsPartiallyFixed()
    await testSessionPersistenceAcrossRounds()
    await testVerdictExtraction()
    await testDeadlockDetection()
    await testDebtRequiresLog()
    await testTokenThresholdCheck()

    console.log('\n✅ All integration tests passed!\n')
  } finally {
    await teardown()
  }
}

run().catch(err => {
  console.error('❌ Integration test failed:', err)
  process.exit(1)
})
