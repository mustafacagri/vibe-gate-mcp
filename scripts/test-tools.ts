/**
 * Manual test for MCP tools.
 * Run: npm run test:tools
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleLogHumanDecision } from '@/tools/log-human-decision'
import { handleSubmitPhaseReview } from '@/tools/submit-phase-review'
import { parseSemanticDiff } from '@/summarizer/parse-semantic-diff'
import { parseDependencyDiff } from '@/summarizer/parse-dependency-list'
import { extractProjectBlueprint } from '@/summarizer/extract-project-blueprint'
import { loadRules, formatRulesForPrompt } from '@/rules/loader'
import { readSession, writeSession, clearSession, appendRound } from '@/conflict-loop/session'
import { updatePhaseOnAccept, readStatus } from '@/roadmap'
import { CRITIC_VERDICTS, ENV_KEYS } from '@/constants'

const __dirname = dirname(fileURLToPath(import.meta.url))
const testDir = join(__dirname, '..', '.vibe-test')
const originalCwd = process.cwd()

async function testLogHumanDecision(): Promise<void> {
  process.env[ENV_KEYS.VIBE_WORKSPACE_ROOT] = testDir
  process.chdir(testDir)
  try {
    const result = await handleLogHumanDecision({
      caseId: 'test-001',
      decision: 'ACCEPT_IMPLEMENTER',
      rationale: 'Test rationale'
    })
    const parsed = JSON.parse(result.content[0].text)
    if (!parsed.success) throw new Error(`Expected success: ${result.content[0].text}`)
    const content = await readFile(join(testDir, '.vibe', 'preferences.log'), 'utf-8')
    if (!content.includes('test-001')) throw new Error('Log entry not found')
    console.log('✅ log_human_decision: PASS')
  } finally {
    delete process.env[ENV_KEYS.VIBE_WORKSPACE_ROOT]
    process.chdir(originalCwd)
  }
}

async function testUpdatePhaseOnAccept(): Promise<void> {
  process.chdir(testDir)
  try {
    await updatePhaseOnAccept(testDir, '2.3.1')
    const status = await readStatus(testDir)
    if (status.lastCompletedTask !== '2.3.1') {
      throw new Error(`Expected lastCompletedTask 2.3.1, got ${status.lastCompletedTask}`)
    }
    if (status.currentPhase !== 2) {
      throw new Error(`Expected currentPhase 2, got ${status.currentPhase}`)
    }
    console.log('✅ updatePhaseOnAccept: PASS')
  } finally {
    process.chdir(originalCwd)
  }
}

async function testParseSemanticDiff(): Promise<void> {
  const unified = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const x = 1
+const y = 2
-const z = 3
`
  const parsed = parseSemanticDiff(unified)
  if (parsed.parseMode !== 'unified') throw new Error(`Expected unified, got ${parsed.parseMode}`)
  if (!parsed.filesChanged.includes('src/foo.ts'))
    throw new Error(`Expected src/foo.ts, got ${parsed.filesChanged.join(', ')}`)
  if (parsed.additions !== 1) throw new Error(`Expected 1 addition, got ${parsed.additions}`)
  if (parsed.removals !== 1) throw new Error(`Expected 1 removal, got ${parsed.removals}`)
  console.log('✅ parseSemanticDiff: PASS')
}

async function testParseDependencyDiff(): Promise<void> {
  const diff = `--- a/package.json
+++ b/package.json
@@ -10,6 +10,7 @@
   "dependencies": {
+    "lodash": "^4.17.21",
     "zod": "^3.24.1"
   }
`
  const parsed = parseDependencyDiff(diff)
  if (parsed.parseMode !== 'diff') throw new Error(`Expected diff, got ${parsed.parseMode}`)
  if (!parsed.added.includes('lodash')) throw new Error(`Expected lodash in added, got ${parsed.added.join(', ')}`)
  console.log('✅ parseDependencyDiff: PASS')
}

async function testExtractProjectBlueprint(): Promise<void> {
  const projectRoot = join(__dirname, '..')
  const blueprint = await extractProjectBlueprint(projectRoot)
  if (typeof blueprint.framework !== 'string') throw new Error('Expected framework string')
  if (!Array.isArray(blueprint.structures)) throw new Error('Expected structures array')
  console.log('✅ extractProjectBlueprint: PASS')
}

async function testRulesLoader(): Promise<void> {
  const projectRoot = join(__dirname, '..')
  const rules = await loadRules(projectRoot)
  if (!Array.isArray(rules.hardRules)) throw new Error('Expected hardRules array')
  if (!Array.isArray(rules.softRules)) throw new Error('Expected softRules array')
  const formatted = formatRulesForPrompt(rules)
  if (typeof formatted !== 'string') throw new Error('Expected string')
  console.log('✅ loadRules + formatRulesForPrompt: PASS')
}

async function testConflictLoopSession(): Promise<void> {
  process.chdir(testDir)
  try {
    const session = appendRound(null, '1.1.1', {
      round: 1,
      report: 'Test',
      verdict: CRITIC_VERDICTS.REJECT,
      criticResponse: 'Test response'
    })
    await writeSession(testDir, session)
    const read = await readSession(testDir)
    if (read?.phaseId !== '1.1.1') throw new Error('Session not persisted')
    if (read.history.length !== 1) throw new Error('Expected 1 round in history')
    await clearSession(testDir)
    const afterClear = await readSession(testDir)
    if (afterClear !== null) throw new Error('Session should be null after clear')
    console.log('✅ conflict-loop session: PASS')
  } finally {
    process.chdir(originalCwd)
  }
}

async function testSubmitPhaseReviewNoProvider(): Promise<void> {
  const prevEnv = process.env.OPENAI_API_KEY
  process.env.CRITIC_PROVIDER = 'openai'
  delete process.env.OPENAI_API_KEY
  try {
    const result = await handleSubmitPhaseReview({
      phaseId: '1.1.1',
      report: 'Test report',
      semanticDiff: 'FILE: test.ts\nCONTENT:\n// placeholder\n'
    })
    const parsed = JSON.parse(result.content[0].text)
    if (!parsed.error) throw new Error('Expected error when no API key')
    if (!parsed.error.includes('No LLM provider')) throw new Error(`Wrong error: ${parsed.error}`)
    console.log('✅ submit_phase_review (no provider): PASS')
  } finally {
    if (prevEnv !== undefined) process.env.OPENAI_API_KEY = prevEnv
  }
}

async function main(): Promise<void> {
  await mkdir(testDir, { recursive: true })
  try {
    await testLogHumanDecision()
    await testUpdatePhaseOnAccept()
    await testParseSemanticDiff()
    await testParseDependencyDiff()
    await testExtractProjectBlueprint()
    await testRulesLoader()
    await testConflictLoopSession()
    await testSubmitPhaseReviewNoProvider()
    console.log('\nAll tests passed.')
  } finally {
    await rm(testDir, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (err) {
  console.error('Test failed:', err)
  process.exit(1)
}
