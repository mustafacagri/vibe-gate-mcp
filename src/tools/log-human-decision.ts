/**
 * MCP tool: log_human_decision
 * Rare escape hatch after true DEADLOCK — not part of the happy path.
 *
 * Design goal: Implementer ↔ Critic debate ruthlessly without humans.
 * Speed + quality = keep the AI loop alive. ACCEPT_IMPLEMENTER mid-debate is banned.
 * Optional VIBE_HUMAN_CONFIRMATION_TOKEN is opt-in only (not required for default flow).
 */

import { z } from 'zod'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CONFLICT_LOOP,
  ENV_VIBE_HUMAN_CONFIRMATION_TOKEN,
  JUDGE_DECISIONS,
  PATHS,
  PREFERENCES_LOG_FORMAT,
  SUCCESS_MESSAGES
} from '@/constants'
import { readSession } from '@/conflict-loop/session'
import { getErrorMessage } from '@/utils/error'
import { getWorkspaceRoot } from '@/workspace'

const judgeDecisionEnum = z.enum([
  JUDGE_DECISIONS.ACCEPT_IMPLEMENTER,
  JUDGE_DECISIONS.ACCEPT_CRITIC,
  JUDGE_DECISIONS.CUSTOM
])

const logHumanDecisionArgsSchema = z.object({
  caseId: z.string(),
  decision: judgeDecisionEnum,
  rationale: z.string().optional(),
  confirmationToken: z.string().optional()
})

const logHumanDecisionInputSchema = {
  caseId: z.string().describe('Conflict case identifier (usually phaseId)'),
  decision: judgeDecisionEnum.describe(
    'Rare deadlock only. Prefer another submit_phase_review round. ACCEPT_IMPLEMENTER is blocked while the Critic loop is still open.'
  ),
  rationale: z.string().optional().describe('Optional rationale for the decision'),
  confirmationToken: z
    .string()
    .optional()
    .describe(
      'Optional. Only if VIBE_HUMAN_CONFIRMATION_TOKEN is set (opt-in). Default flow does not use this — keep AI↔AI debate.'
    )
}

export const LOG_HUMAN_DECISION_SCHEMA = {
  title: 'Log Human Decision',
  description:
    'Last-resort after true DEADLOCK (max Critic rounds). Prefer Implementer↔Critic resubmit. ACCEPT_IMPLEMENTER is rejected while a review session is still open below max rounds.',
  inputSchema: logHumanDecisionInputSchema
} as const

export type LogHumanDecisionArgs = {
  caseId: string
  decision: z.infer<typeof judgeDecisionEnum>
  rationale?: string
  confirmationToken?: string
}

function formatPreferencesEntry(entry: LogHumanDecisionArgs): string {
  return PREFERENCES_LOG_FORMAT.TEMPLATE(new Date().toISOString(), entry.caseId, entry.decision, entry.rationale ?? '')
}

function assertOptionalHumanConfirmation(confirmationToken: string | undefined): string | null {
  const required = process.env[ENV_VIBE_HUMAN_CONFIRMATION_TOKEN]?.trim()
  if (!required) return null
  if (!confirmationToken || confirmationToken !== required) {
    return `Optional human gate is enabled: pass confirmationToken matching ${ENV_VIBE_HUMAN_CONFIRMATION_TOKEN}.`
  }
  return null
}

/**
 * Keep AI↔AI loop alive: Implementer must not preference-poison ACCEPT mid-debate.
 * Allowed only when no matching open session, or session already at max rounds (true deadlock).
 */
async function assertAcceptImplementerAllowed(
  workspaceRoot: string,
  caseId: string
): Promise<{ code: string; error: string } | null> {
  const session = await readSession(workspaceRoot)
  if (!session || session.phaseId !== caseId) return null

  if (session.round < CONFLICT_LOOP.MAX_ROUNDS) {
    return {
      code: 'CONTINUE_CRITIC_DEBATE',
      error: `ACCEPT_IMPLEMENTER blocked: Critic loop still open (round ${session.round}/${CONFLICT_LOOP.MAX_ROUNDS}). Fix concerns and call submit_phase_review again — keep humans out of the loop.`
    }
  }

  return null
}

function jsonText(payload: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

export async function handleLogHumanDecision(
  args: unknown
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const parsed = logHumanDecisionArgsSchema.safeParse(args)
  if (!parsed.success) {
    return jsonText({
      success: false,
      error: 'Invalid decision. Must be ACCEPT_IMPLEMENTER | ACCEPT_CRITIC | CUSTOM (DATA-001)',
      details: z.flattenError(parsed.error)
    })
  }
  const { caseId, decision, rationale, confirmationToken } = parsed.data
  const workspaceRoot = getWorkspaceRoot()

  if (decision === JUDGE_DECISIONS.ACCEPT_IMPLEMENTER) {
    const debateError = await assertAcceptImplementerAllowed(workspaceRoot, caseId)
    if (debateError) return jsonText({ success: false, ...debateError })
  }

  const confirmationError = assertOptionalHumanConfirmation(confirmationToken)
  if (confirmationError) {
    return jsonText({
      success: false,
      error: confirmationError,
      code: 'HUMAN_CONFIRMATION_REQUIRED'
    })
  }

  try {
    await mkdir(join(workspaceRoot, PATHS.VIBE_DIR), { recursive: true })
    const logPath = join(workspaceRoot, PATHS.PREFERENCES_LOG)
    const existing = await readFile(logPath, 'utf-8').catch(() => '')
    const newEntry = formatPreferencesEntry({ caseId, decision, rationale })
    await writeFile(logPath, existing + newEntry, 'utf-8')
    return jsonText({
      success: true,
      path: PATHS.PREFERENCES_LOG,
      message: SUCCESS_MESSAGES.DECISION_LOGGED
    })
  } catch (err) {
    return jsonText({ success: false, error: getErrorMessage(err) })
  }
}
