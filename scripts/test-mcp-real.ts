/**
 * Manual MCP test - tests the actual MCP server with real LLM calls.
 * Run: npm run test:mcp
 */

import 'dotenv/config'
import { handleSubmitPhaseReview } from '@/tools/submit-phase-review'
import { readChangedFilesWithBudget } from '@/summarizer/read-changed-files'
import { getEffectiveContextBudget } from '@/utils/tokenEstimator'
import { PROVIDERS } from '@/constants'
import { writeSession, readSession, clearSession } from '@/conflict-loop/session'

const WORKSPACE_ROOT = process.cwd()

async function testImportExpansionOff(): Promise<void> {
  console.log('\n🔍 Testing Import Expansion (should be OFF)\n')

  const testFile = 'src/tools/submit-phase-review.ts'
  const budget = getEffectiveContextBudget(PROVIDERS.OPENAI)

  const { contents, budgetExceeded, expandedFiles } = await readChangedFilesWithBudget(
    WORKSPACE_ROOT,
    [testFile],
    budget
  )

  console.log('Files read:', contents.length)
  console.log('Expanded imports:', expandedFiles.length)
  console.log('Budget exceeded:', budgetExceeded)

  if (expandedFiles.length === 0) {
    console.log('✅ Import expansion DISABLED - On-Demand mode active')
  } else {
    console.log('⚠️ Import expansion still enabled:', expandedFiles)
  }

  console.log('\n✅ Import expansion test complete')
}

async function testRound1ToRound2RequestFlow(): Promise<void> {
  console.log('\n🤖 Testing Round 1 → Round 2 REQUEST Flow\n')

  await clearSession(WORKSPACE_ROOT)

  // Realistic semantic diff
  const semanticDiff = `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,10 +1,20 @@
-import { Request } from 'express'
+import { Request, Response } from 'express'
+import { validateCredentials } from './validators'
+import { auditLog } from '@/services/audit'
+import { AUTH_CONFIG } from '@/config/auth'

-export function login(req: Request) {
-  const { username, password } = req.body
-  if (username === 'admin' && password === 'admin123') {
-    return { token: 'fake-token' }
+export async function login(req: Request, res: Response) {
+  const { username, password } = req.body
+  if (!username || !password) {
+    return res.status(400).json({ error: 'Missing credentials' })
+  }
+  const isValid = await validateCredentials(username, password)
+  if (!isValid) {
+    await auditLog('login_failed', { username })
+    return res.status(401).json({ error: 'Invalid credentials' })
   }
+  return res.status(200).json({ token: 'generated-token' })
}

--- a/src/config/auth.ts
+++ b/src/config/auth.ts
@@ -1,3 +1,7 @@
+export const AUTH_CONFIG = {
+  TOKEN_EXPIRY: '24h',
+  SALT_ROUNDS: 12
+} as const
-export const JWT_SECRET = getSecretFromConfig()
+export const JWT_SECRET = process.env.JWT_SECRET || 'development-only-placeholder'`

  try {
    // Round 1
    console.log('📍 Round 1...')
    const round1 = await handleSubmitPhaseReview({
      phaseId: '2.1.1-auth-refactor',
      report: 'Refactored auth: added validation, audit logging, moved secrets to env',
      semanticDiff,
      dependencies: ['bcrypt', 'jsonwebtoken'],
      round: 1
    })

    const parsed1 = JSON.parse(round1.content[0].text)
    console.log('Round 1 Verdict:', parsed1.verdict)
    console.log('Round 1 Tokens:', parsed1.usage?.completionTokens)

    if (parsed1.criticResponse) {
      console.log('\n💬 Round 1 Critic Response:')
      console.log(parsed1.criticResponse.slice(0, 300))
    }

    // Read session and check for REQUEST
    const session = await readSession(WORKSPACE_ROOT)
    console.log('\n📁 Session after Round 1:', session ? `round=${session.round}` : 'NONE')

    // Inject REQUEST into session for Round 2
    if (session && parsed1.criticResponse && parsed1.criticResponse.includes('REQUEST:')) {
      // Extract REQUEST lines
      const requestLines = parsed1.criticResponse.split('\n').filter(line => line.includes('REQUEST:'))
      const lastCriticResponse = session.history[session.history.length - 1]?.criticResponse || ''
      session.history[session.history.length - 1].criticResponse = lastCriticResponse + '\n\n' + requestLines.join('\n')
      await writeSession(WORKSPACE_ROOT, session)
      console.log('\n📍 Injected REQUEST into session for Round 2')
    }

    // Round 2
    console.log('\n📍 Round 2 (with REQUEST handling)...')
    const round2 = await handleSubmitPhaseReview({
      phaseId: '2.1.1-auth-refactor',
      report: 'Round 2: REQUEST files now provided',
      semanticDiff,
      dependencies: ['bcrypt', 'jsonwebtoken'],
      round: 2
    })

    const parsed2 = JSON.parse(round2.content[0].text)
    console.log('Round 2 Verdict:', parsed2.verdict)
    console.log('Round 2 Tokens:', parsed2.usage?.completionTokens)
    console.log('Round 2 Next Round:', parsed2.nextRound)

    if (parsed2.criticResponse) {
      console.log('\n💬 Round 2 Critic Response:')
      console.log('---START---')
      console.log(parsed2.criticResponse)
      console.log('---END---')
    }

    // Success criteria
    if (parsed2.verdict === 'ACCEPT') {
      console.log('\n✅ SUCCESS: Round 2 ACCEPTED the changes')
    } else if (parsed2.verdict === 'DEBT') {
      console.log('\n⚠️ DEBT verdict - some concerns found')
    } else {
      console.log('\n❌ Verdict:', parsed2.verdict)
    }

    await clearSession(WORKSPACE_ROOT)
  } catch (err) {
    console.error('❌ Test failed:', err)
    await clearSession(WORKSPACE_ROOT)
  }
}

async function main(): Promise<void> {
  console.log('===========================================')
  console.log('   Vibe-Gate MCP Real LLM Test Suite')
  console.log('===========================================')

  await testImportExpansionOff()
  await testRound1ToRound2RequestFlow()

  console.log('\n===========================================')
  console.log('   All tests completed')
  console.log('===========================================\n')
}

main().catch(console.error)
