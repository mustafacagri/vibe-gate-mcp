/**
 * MCP tool: submit_phase_review
 * Implementer reports phase completion; triggers Critic review.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { loadConfig, getEffectiveModel } from '@/config'
import {
  BLOAT_WARNING_MESSAGE,
  CASE_FILE_MESSAGES,
  CASE_PARTIES,
  CONCERN_REVIEW_STATUS,
  CONFLICT_LOOP,
  CRITIC_THRESHOLDS,
  CRITIC_VERDICTS,
  DEFAULT_ROUND,
  DEPENDENCY_THRESHOLDS,
  ERROR_MESSAGES,
  JSON_INDENT_SPACES,
  NONE_PLACEHOLDER,
  PATHS
} from '@/constants'
import {
  appendRound,
  clearSession,
  readSession,
  writeSession,
  verifyConcern,
  allConcernsReviewed,
  hasActiveConcerns
} from '@/conflict-loop/session'
import { appendToDebt } from '@/debt/append'
import { formatRulesForPrompt, loadRules } from '@/rules/loader'
import { getStatus, updatePhaseOnAccept, updateConflictCount } from '@/roadmap'
import { shouldPersistPhaseStatus } from '@/roadmap/phase-status-policy'
import { loadSemanticDiffFromWorkspacePath } from '@/utils/resolve-semantic-diff-from-path'
import { buildSemanticDiffFromSourceFiles } from '@/utils/build-semantic-diff-from-files'
import { createLLMProvider } from '@/llm'
import { getPersonaPrompt, buildSystemPrompt } from '@/prompts'
import { parseSemanticDiff } from '@/summarizer/parse-semantic-diff'
import { extractProjectBlueprint } from '@/summarizer/extract-project-blueprint'
import { parseDependencyListFromPackageJson } from '@/summarizer/parse-dependency-list'
import { readPreferencesLog } from '@/preferences/index'

import { estimateTokens } from '@/utils/tokenEstimator'
import {
  parseConcernsFromResponse,
  parseVerificationsFromResponse,
  parseVerdictFromResponse,
  hasStructuredProseMismatch,
  hasRequestBlocks,
  filterConcernsBySemanticDiff
} from '@/utils/criticResponseParser'
import { buildCriticResponse, checkTokenThreshold, requiresDebtLog } from '@/utils/responseBuilder'
import { getErrorMessage } from '@/utils/error'
import { computeSemanticDiffLineHints } from '@/utils/semantic-diff-line-hints'
import { getWorkspaceRoot } from '@/workspace'
import { debugLog } from '@/utils/debug'
import type { LLMMessage } from '@/llm/types'
import type { Concern, ReviewRound, ReviewSession } from '@/conflict-loop/types'

type VerdictId = (typeof CRITIC_VERDICTS)[keyof typeof CRITIC_VERDICTS]

/**
 * Build a structured history summary from prior rounds.
 *
 * Character truncation loses semantic content and creates false Critic context.
 *
 * This implementation: extracts only the fields the Critic actually needs:
 *  - Which round and what verdict
 *  - Which concerns were raised (ruleId + severity)
 *  - Which concerns were VERIFIED or NOT_VERIFIED
 *
 * No char limits. No truncation. Compact by structure, not by cutting.
 */
/**
 * Helper to determine if prior concerns exist and are all reviewed & non-active.
 * Empty priorConcerns must NEVER vacuous-ACCEPT a Critic REJECT (Round 1 bug).
 */
export function canPromotePriorConcernsToAccept(priorConcerns: Concern[]): boolean {
  if (!priorConcerns || priorConcerns.length === 0) return false
  const allPriorReviewed = priorConcerns.every(c => c.reviewStatus !== CONCERN_REVIEW_STATUS.PENDING)
  const noActivePriorConcerns = !priorConcerns.some(c => c.reviewStatus === CONCERN_REVIEW_STATUS.REVIEWED_VALID)
  return allPriorReviewed && noActivePriorConcerns
}

function buildHistorySummary(
  history: ReviewRound[],
  maxTokens: number = CRITIC_THRESHOLDS.HISTORY_SUMMARY_MAX_TOKENS
): string {
  const parts: string[] = []
  let usedTokens = 0

  for (const h of history) {
    const lines: string[] = [`## Round ${h.round} — ${h.verdict}`]

    const fullContext = `Report:\n${h.report}\n\nCritic Response:\n${h.criticResponse}`
    const contextTokens = estimateTokens(fullContext)

    if (usedTokens + contextTokens <= maxTokens) {
      lines.push(fullContext)
      usedTokens += contextTokens
    } else {
      lines.push(`(Full text omitted to save context budget)`)
      if (h.concerns?.length) {
        const concernLines = h.concerns.map(c => `  - [${c.severity.toUpperCase()}] ${c.ruleId}: ${c.description}`)
        lines.push(`Concerns raised:\n${concernLines.join('\n')}`)
      }

      if (h.verifications?.length) {
        const verLines = h.verifications.map(
          v => `  - ${v.verified ? 'VERIFIED' : 'NOT_VERIFIED'}: ${v.ruleId} → ${v.verificationEvidence}`
        )
        lines.push(`Verifications:\n${verLines.join('\n')}`)
      }
    }

    parts.push(lines.join('\n\n'))
  }

  return parts.join('\n\n---\n\n')
}

function buildUserContent(args: SubmitPhaseReviewArgs, historySummary?: string): string {
  const parts: string[] = [`Phase: ${args.phaseId}`, `<developer_report>\n${args.report}\n</developer_report>`]

  if (historySummary) parts.unshift(`Previous rounds:\n${historySummary}\n`)

  if (args.semanticDiff?.trim()) {
    parts.push(
      `## CHANGED FILES (MCP resolved payload from files[], semanticDiffPath, or inline semanticDiff — this is the review corpus):\n<code_content>\n${args.semanticDiff.trim()}\n</code_content>`
    )
  }

  if (args.dependencies?.length) parts.push(`Dependencies: ${args.dependencies.join(', ')}`)

  debugLog(`buildUserContent - semanticDiff length: ${args.semanticDiff?.length ?? 0}`)

  return parts.join('\n\n')
}

async function buildContextBlock(
  workspaceRoot: string,
  newDeps: string[],
  semanticDiff: string | undefined,
  report: string
): Promise<{ context: string; filesAnalyzed: number }> {
  const [blueprint, pkgDeps] = await Promise.all([
    extractProjectBlueprint(workspaceRoot),
    parseDependencyListFromPackageJson(workspaceRoot).catch(() => ({ dependencies: [], devDependencies: [] }))
  ])

  const totalDeps = pkgDeps.dependencies.length + pkgDeps.devDependencies.length
  const bloatWarn =
    newDeps.length >= DEPENDENCY_THRESHOLDS.BLOAT_WARNING_NEW_PACKAGES ||
    totalDeps >= DEPENDENCY_THRESHOLDS.BLOAT_WARNING_TOTAL_DEPS

  const parts: string[] = [
    `Project: ${blueprint.framework}. Structures: ${blueprint.structures.join(', ') || NONE_PLACEHOLDER}.`,
    `Current deps: ${totalDeps}. New/updated: ${newDeps.join(', ') || NONE_PLACEHOLDER}.`
  ]

  if (bloatWarn) parts.push(BLOAT_WARNING_MESSAGE)

  let filesAnalyzed = 0

  const combinedText = [semanticDiff, report].filter(Boolean).join('\n')
  if (combinedText) {
    const parsed = parseSemanticDiff(combinedText)
    filesAnalyzed = parsed.filesChanged.length

    const contentBlock = buildContentBlockFromInput(semanticDiff, report)
    parts.push(contentBlock)
  }

  return { context: parts.join(' '), filesAnalyzed }
}

function buildContentBlockFromInput(semanticDiff: string | undefined, report: string): string {
  const sections: string[] = []

  if (semanticDiff?.trim()) {
    sections.push(
      `## CHANGED FILES (MCP resolved FILE:...CONTENT: payload from files[], semanticDiffPath, or inline semanticDiff):\n${semanticDiff.trim()}`
    )
  }

  if (report?.trim()) sections.push(`## DEVELOPER REPORT:\n${report.trim()}`)

  return sections.join('\n\n')
}

async function appendRequestedFilesToContext(
  workspaceRoot: string,
  originalContext: string,
  criticResponse: string
): Promise<{ context: string; filesAnalyzed: number }> {
  if (!hasRequestBlocks(criticResponse)) return { context: originalContext, filesAnalyzed: 0 }

  return {
    context: `${originalContext}\n\n## CRITIC REQUESTED MORE CONTEXT\nNote: Resubmit with files[] (or semanticDiffPath / inline semanticDiff) covering every path the Critic needs. MCP reads those workspace paths when you provide them.`,
    filesAnalyzed: 0
  }
}

async function appendPreviousRoundsFilesToContext(
  workspaceRoot: string,
  originalContext: string,
  session: ReviewSession
): Promise<{ context: string; filesAnalyzed: number }> {
  const previousContents: string[] = []

  for (const h of session.history) {
    if (h.semanticDiff?.trim()) previousContents.push(`--- Round ${h.round} ---\n${h.semanticDiff.trim()}`)
  }

  if (previousContents.length === 0) return { context: originalContext, filesAnalyzed: 0 }

  return {
    context: `${originalContext}\n\n## PREVIOUS ROUNDS CONTENT (preserved):\n${previousContents.join('\n\n')}`,
    filesAnalyzed: 0
  }
}

function toTextContent(json: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: JSON.stringify(json) }
}

/** Attach optional soft hints (e.g. large FILE: blocks) without breaking existing clients. */
function toTextContentWithHints(
  payload: Record<string, unknown>,
  semanticDiffHints: string[]
): { type: 'text'; text: string } {
  return toTextContent(semanticDiffHints.length > 0 ? { ...payload, semanticDiffHints } : payload)
}

interface CaseFile {
  verdict: string
  conflictAlert: boolean
  caseId: string
  phaseId: string
  timestamp: string
  summary: { rounds: number; lastVerdict: string; message: string }
  parties: { implementer: string; critic: string }
  history: Array<{ round: number; verdict: string; criticResponse: string }>
}

function buildCaseFile(phaseId: string, rounds: number, history: ReviewRound[], lastVerdict?: string): CaseFile {
  return {
    verdict: CONFLICT_LOOP.DEADLOCK,
    conflictAlert: true,
    caseId: `CASE-${crypto.randomUUID()}`,
    phaseId,
    timestamp: new Date().toISOString(),
    summary: {
      rounds,
      lastVerdict: lastVerdict ?? CRITIC_VERDICTS.REJECT,
      message: CASE_FILE_MESSAGES.DEADLOCK_SUMMARY
    },
    parties: {
      implementer: CASE_PARTIES.IMPLEMENTER,
      critic: CASE_PARTIES.CRITIC
    },
    history: history.map(h => ({
      round: h.round,
      verdict: h.verdict,
      criticResponse: h.criticResponse
    }))
  }
}

async function writeCaseFile(workspaceRoot: string, caseFile: CaseFile): Promise<void> {
  const casesDir = join(workspaceRoot, PATHS.VIBE_CASES_DIR)
  await mkdir(casesDir, { recursive: true })
  const path = join(casesDir, `${caseFile.caseId}.json`)
  await writeFile(path, JSON.stringify(caseFile, null, JSON_INDENT_SPACES), 'utf-8')
}

async function checkDeadlockEarly(
  workspaceRoot: string,
  args: { phaseId: string; round?: number },
  session: ReviewSession | null,
  semanticDiffHints: string[]
): Promise<{ content: Array<{ type: 'text'; text: string }> } | null> {
  const round = args.round ?? DEFAULT_ROUND
  if (round > CONFLICT_LOOP.MAX_ROUNDS) {
    await clearSession(workspaceRoot)
    await updateConflictCount(workspaceRoot, 1)
    const caseFile = buildCaseFile(args.phaseId, round, [])
    await writeCaseFile(workspaceRoot, caseFile)
    return { content: [toTextContentWithHints({ ...caseFile, filesAnalyzed: 0 }, semanticDiffHints)] }
  }
  if (round > 1 && session?.phaseId === args.phaseId && session.round >= CONFLICT_LOOP.MAX_ROUNDS) {
    await clearSession(workspaceRoot)
    await updateConflictCount(workspaceRoot, 1)
    const caseFile = buildCaseFile(args.phaseId, session.round, session.history)
    await writeCaseFile(workspaceRoot, caseFile)
    return { content: [toTextContentWithHints({ ...caseFile, filesAnalyzed: 0 }, semanticDiffHints)] }
  }
  return null
}

async function tryUpdateStatusOnAccept(
  workspaceRoot: string,
  phaseId: string,
  updateStatus?: boolean
): Promise<{ statusUpdated: boolean; statusError?: string; statusSkipped?: boolean }> {
  if (!shouldPersistPhaseStatus(phaseId, updateStatus)) {
    return { statusUpdated: false, statusSkipped: true }
  }
  try {
    await updatePhaseOnAccept(workspaceRoot, phaseId)
    return { statusUpdated: true }
  } catch (err) {
    return { statusUpdated: false, statusError: getErrorMessage(err) }
  }
}

interface CriticReviewResult {
  response: { content: string; usage?: { promptTokens: number; completionTokens: number } }
  parsedVerdict: VerdictId | null
  verdict: VerdictId | string
  roundData: ReviewRound
  model: string
  insufficientReview: boolean
  filesAnalyzed: number
  structuredProseMismatch?: boolean
}

function determineVerdict(
  parsedVerdict: string | null,
  _responseContent: string,
  completionTokens: number
): { verdict: string; insufficientReview: boolean } {
  // SECURITY FIX: Only use regex-parsed verdict.
  // The verdict must come from the structured response field to prevent prompt injection bypass.
  // where injecting "ACCEPT" anywhere in user content would override the real verdict.
  const finalVerdict = parsedVerdict

  // If no verdict found, the LLM must output a proper verdict keyword.
  // If it doesn't, it's INSUFFICIENT_REVIEW.
  const checkedVerdict =
    finalVerdict != null ? checkTokenThreshold(finalVerdict, completionTokens) : CRITIC_VERDICTS.INSUFFICIENT_REVIEW
  const insufficientReview = checkedVerdict === CRITIC_VERDICTS.INSUFFICIENT_REVIEW
  return {
    verdict: insufficientReview ? checkedVerdict : (finalVerdict ?? CRITIC_VERDICTS.INSUFFICIENT_REVIEW),
    insufficientReview
  }
}

function applyStructuredProseMismatchGate(
  round: number,
  responseContent: string,
  parsedVerdict: VerdictId | null,
  verdict: string,
  insufficientReview: boolean
): { verdict: string; insufficientReview: boolean; structuredProseMismatch: boolean } {
  const structuredProseMismatch = hasStructuredProseMismatch(responseContent, parsedVerdict)
  if (!structuredProseMismatch) {
    return { verdict, insufficientReview, structuredProseMismatch: false }
  }

  const acceptSide = parsedVerdict === CRITIC_VERDICTS.ACCEPT || parsedVerdict === CRITIC_VERDICTS.CONCERNS_ADDRESSED
  if (acceptSide) {
    debugLog(`Round ${round} - STRUCTURED_PROSE_MISMATCH on ACCEPT-side (structured=${parsedVerdict})`)
    return {
      verdict: CRITIC_VERDICTS.INSUFFICIENT_REVIEW,
      insufficientReview: true,
      structuredProseMismatch: true
    }
  }

  debugLog(`Round ${round} - STRUCTURED_PROSE_MISMATCH kept structured=${parsedVerdict}`)
  return { verdict, insufficientReview, structuredProseMismatch: true }
}

async function runCriticReview(
  workspaceRoot: string,
  args: SubmitPhaseReviewArgs,
  session: ReviewSession | null,
  config: ReturnType<typeof loadConfig>,
  provider: NonNullable<ReturnType<typeof createLLMProvider>>
): Promise<CriticReviewResult> {
  // DIFF FORMAT VALIDATION: Detect if user sent git diff instead of FILE:...CONTENT: format
  if (args.semanticDiff) {
    const trimmed = args.semanticDiff.trim()
    const hasDiffMarkers = trimmed.startsWith('---') || trimmed.startsWith('+++') || trimmed.includes('```diff')
    const hasFileMarker = trimmed.includes('FILE:') && trimmed.includes('CONTENT:')
    if (hasDiffMarkers && !hasFileMarker) {
      debugLog('semanticDiff appears to contain git diff format. This will cause DEADLOCK.')
      debugLog('Use FILE:...CONTENT: format with FULL file content instead.')
    }
  }

  const round = args.round ?? DEFAULT_ROUND
  const personaPrompt = getPersonaPrompt(config.criticPersona)
  const model = getEffectiveModel(config)
  const [status, contextBlockResult, rules, preferencesLog] = await Promise.all([
    getStatus(workspaceRoot),
    buildContextBlock(workspaceRoot, args.dependencies ?? [], args.semanticDiff, args.report),
    loadRules(workspaceRoot),
    readPreferencesLog(workspaceRoot)
  ])

  let enrichedContextBlock = contextBlockResult.context
  let totalFilesRead = contextBlockResult.filesAnalyzed

  // Round 2+: Preserve files from previous rounds and handle REQUEST blocks
  if (round > 1 && session?.history && session.history.length > 0) {
    const previousCriticResponse = session.history[session.history.length - 1].criticResponse

    if (hasRequestBlocks(previousCriticResponse)) {
      const requestedBlockResult = await appendRequestedFilesToContext(
        workspaceRoot,
        enrichedContextBlock,
        previousCriticResponse
      )
      enrichedContextBlock = requestedBlockResult.context
      totalFilesRead += requestedBlockResult.filesAnalyzed
    }

    const previousRoundsResult = await appendPreviousRoundsFilesToContext(workspaceRoot, enrichedContextBlock, session)
    enrichedContextBlock = previousRoundsResult.context
    totalFilesRead += previousRoundsResult.filesAnalyzed
  }

  const rulesBlock = formatRulesForPrompt(rules)
  const historySummary = session?.phaseId === args.phaseId ? buildHistorySummary(session.history) : undefined
  const userContent = buildUserContent(args, historySummary)
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(personaPrompt, status, enrichedContextBlock, rulesBlock, preferencesLog, round)
    },
    { role: 'user', content: userContent }
  ]

  const systemPromptLength = messages[0].content.length
  const userPromptLength = messages[1].content.length
  const estimatedSystemTokens = Math.ceil(systemPromptLength / 4)
  const estimatedUserTokens = Math.ceil(userPromptLength / 4)
  const hasSemanticDiff = userContent.includes('## CHANGED FILES')
  const hasFileContent = userContent.includes('FILE:') && userContent.includes('CONTENT:')

  debugLog(
    `Round ${round} - system=${estimatedSystemTokens}t, user=${estimatedUserTokens}t, files=${hasSemanticDiff}, content=${hasFileContent}`
  )

  const response = await provider.complete(messages)

  debugLog(
    `Round ${round} - LLM response: ${response.content.length} chars, tokens: ${response.usage?.completionTokens ?? 'unknown'}`
  )

  const parsedVerdict = parseVerdictFromResponse(response.content)
  const completionTokens = response.usage?.completionTokens ?? 0
  const determined = determineVerdict(parsedVerdict, response.content, completionTokens)
  const { verdict, insufficientReview, structuredProseMismatch } = applyStructuredProseMismatchGate(
    round,
    response.content,
    parsedVerdict,
    determined.verdict,
    determined.insufficientReview
  )

  debugLog(`Round ${round} - verdict: ${verdict}, insufficient: ${insufficientReview}`)

  const existingConcerns = session?.concerns ?? []
  const rawConcerns = parseConcernsFromResponse(response.content)
  // Option B fix: Filter out concerns citing files NOT in semanticDiff
  const concerns = filterConcernsBySemanticDiff(rawConcerns, args.semanticDiff ?? '')
  const verifications = round > 1 ? parseVerificationsFromResponse(response.content, existingConcerns) : []

  const roundData: ReviewRound = {
    round,
    report: args.report,
    semanticDiff: args.semanticDiff,
    verdict: String(verdict),
    criticResponse: response.content,
    concerns: concerns.length > 0 ? concerns : undefined,
    verifications: verifications.length > 0 ? verifications : undefined
  }
  return {
    response,
    parsedVerdict,
    verdict,
    roundData,
    model,
    insufficientReview,
    filesAnalyzed: totalFilesRead,
    structuredProseMismatch
  }
}

async function handleAcceptVerdict(
  result: CriticReviewResult,
  workspaceRoot: string,
  args: SubmitPhaseReviewArgs,
  semanticDiffHints: string[]
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const statusResult = await tryUpdateStatusOnAccept(workspaceRoot, args.phaseId, args.updateStatus)
  if (statusResult.statusError) {
    return {
      content: [
        toTextContentWithHints(
          {
            verdict: result.parsedVerdict,
            model: result.model,
            usage: result.response.usage,
            statusUpdated: false,
            statusError: statusResult.statusError,
            filesAnalyzed: result.filesAnalyzed
          },
          semanticDiffHints
        )
      ]
    }
  }
  await clearSession(workspaceRoot)
  return {
    content: [
      toTextContentWithHints(
        {
          verdict: result.parsedVerdict,
          model: result.model,
          usage: result.response.usage,
          statusUpdated: statusResult.statusUpdated,
          ...(statusResult.statusSkipped ? { statusSkipped: true } : {}),
          criticResponse: result.response.content,
          filesAnalyzed: result.filesAnalyzed
        },
        semanticDiffHints
      )
    ]
  }
}

async function handleRejectOrContinue(
  result: CriticReviewResult,
  session: ReviewSession | null,
  workspaceRoot: string,
  args: SubmitPhaseReviewArgs,
  semanticDiffHints: string[]
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  let nextSession = appendRound(session, args.phaseId, result.roundData)
  const verifications = result.roundData.verifications ?? []
  for (const verification of verifications) {
    nextSession = verifyConcern(nextSession, verification)
  }
  await writeSession(workspaceRoot, nextSession)
  const round = result.roundData.round

  // Promote REJECT/BLOCK → ACCEPT only when prior concerns existed and are all resolved.
  // Empty priorConcerns must NEVER vacuous-ACCEPT a Critic REJECT (Round 1 bug).
  const priorConcerns = session?.concerns ?? []
  if (canPromotePriorConcernsToAccept(priorConcerns)) {
    return handleAcceptVerdict(result, workspaceRoot, args, semanticDiffHints)
  }

  // Only DEADLOCK if genuinely unresolvable after max rounds
  if (round > CONFLICT_LOOP.MAX_ROUNDS) {
    await clearSession(workspaceRoot)
    await updateConflictCount(workspaceRoot, 1)
    const caseFile = buildCaseFile(args.phaseId, round, nextSession.history, String(result.verdict))
    await writeCaseFile(workspaceRoot, caseFile)
    return {
      content: [toTextContentWithHints({ ...caseFile, filesAnalyzed: result.filesAnalyzed }, semanticDiffHints)]
    }
  }
  return {
    content: [
      toTextContentWithHints(
        {
          verdict: result.verdict,
          model: result.model,
          usage: result.response.usage,
          statusUpdated: false,
          round,
          nextRound: round + 1,
          criticResponse: result.response.content,
          message: CASE_FILE_MESSAGES.NEXT_ROUND_TEMPLATE(round),
          filesAnalyzed: result.filesAnalyzed,
          ...(result.structuredProseMismatch
            ? {
                code: 'STRUCTURED_PROSE_MISMATCH',
                guidance:
                  'Structured VERDICT disagrees with closing prose. Resubmit submit_phase_review (next Critic round) — do NOT call log_human_decision(ACCEPT_IMPLEMENTER). Keep the AI↔AI debate.'
              }
            : {})
        },
        semanticDiffHints
      )
    ]
  }
}

/**
 * Plain ZodObject registered with MCP ListTools.
 * Do NOT attach `.superRefine` here: MCP SDK `normalizeObjectSchema` cannot read ZodEffects shapes,
 * which advertises `properties: {}` to IDEs (agents then cannot discover `files` / `semanticDiffPath`).
 */
export const submitPhaseReviewFieldsSchema = z.object({
  phaseId: z.string().describe('Phase identifier (e.g., phase-6-§1a or 1.1.1)'),
  report: z
    .string()
    .describe(
      'Implementer report. MUST INCLUDE: 1. Specific file paths & line numbers. 2. What changed and why. 3. Confirmation that NO "future solutions" or "TODOs" remain (instant fixes only).'
    ),
  files: z
    .array(z.string())
    .optional()
    .describe(
      'PREFERRED. Workspace-relative source paths under VIBE_WORKSPACE_ROOT. MCP reads each file and builds FILE:...CONTENT: payload. Exactly one of: files | semanticDiffPath | semanticDiff. Max 10 files.'
    ),
  semanticDiffPath: z
    .string()
    .optional()
    .describe(
      'Workspace-relative path to a pre-built FILE:...CONTENT: payload file (raw or JSON {"semanticDiff":"..."}). Exactly one of: files | semanticDiffPath | semanticDiff.'
    ),
  semanticDiff: z
    .string()
    .optional()
    .describe(
      'Inline FILE:...CONTENT: payload. Prefer files[]. Exactly one of: files | semanticDiffPath | semanticDiff. NOT git diff.'
    ),
  updateStatus: z
    .boolean()
    .optional()
    .describe(
      'When false, ACCEPT does not write .vibe/status.json. Default: true except phaseIds with mcp-smoke- / vibe-gate-probe- prefixes.'
    ),
  dependencies: z.array(z.string()).optional().describe('New/updated package names'),
  round: z.number().optional().describe('Round number (1-3), default 1'),
  logToDebt: z
    .object({
      subject: z.string(),
      rationale: z.string()
    })
    .optional()
    .describe('When DEBT verdict and Implementer accepts, log to DEBT.md')
})

function countPayloadSources(data: { semanticDiff?: string; semanticDiffPath?: string; files?: string[] }): number {
  let n = 0
  if (data.semanticDiff !== undefined && data.semanticDiff.trim().length > 0) n += 1
  if (data.semanticDiffPath !== undefined && data.semanticDiffPath.trim().length > 0) n += 1
  if (data.files !== undefined && data.files.some(f => f.trim().length > 0)) n += 1
  return n
}

/** Full validation including exactly-one payload source. Used in the tool handler. */
export const submitPhaseReviewInputSchema = submitPhaseReviewFieldsSchema.superRefine((data, ctx) => {
  if (countPayloadSources(data) !== 1) {
    ctx.addIssue({
      code: 'custom',
      message:
        'Provide exactly one of: files (non-empty path array), semanticDiffPath (non-empty), or semanticDiff (non-empty inline). Prefer files[].'
    })
  }
})

export type SubmitPhaseReviewInput = z.infer<typeof submitPhaseReviewInputSchema>

export const SUBMIT_PHASE_REVIEW_SCHEMA = {
  title: 'Submit Phase Review',
  description:
    'IDE AI (Implementer) submits a phase completion report for Critic review. Prefer files[] (workspace-relative paths; MCP reads disk and builds FILE:...CONTENT:). Alternatives: semanticDiffPath or inline semanticDiff — exactly one. Set updateStatus:false for connectivity probes.',
  inputSchema: submitPhaseReviewFieldsSchema
} as const

/** Resolved args after loading semanticDiff from disk when using files[] or semanticDiffPath. */
export type SubmitPhaseReviewArgs = {
  phaseId: string
  report: string
  semanticDiff: string
  dependencies?: string[]
  round?: number
  logToDebt?: { subject: string; rationale: string }
  updateStatus?: boolean
}

const INSUFFICIENT_REVIEW_GUIDANCE = `
Your phase report needs improvement:

REQUIRED for a proper review:
1. File paths with line numbers (e.g., src/utils/helper.ts:42)
2. Specific code changes - before/after snippets for non-trivial changes
3. Why this change was made
4. INSTANT FIXES ONLY: Do not say "I will fix this later" or leave "TODO" comments. Provide the complete solution NOW.

Example GOOD report:
"Added getUserById() function to src/services/user.ts:15-20. Uses existing USER_CACHE constant. Reason: needed for profile page. No future TODOs left."

Example BAD report (this one):
"Added some helper function. I will fix the types in the next phase."

For string/number literals: Show the actual values and where they should be defined as constants.`

function handleInsufficientReview(
  reviewResult: CriticReviewResult,
  semanticDiffHints: string[]
): {
  content: Array<{ type: 'text'; text: string }>
} {
  const isZeroTokens = (reviewResult.response.usage?.completionTokens ?? 0) === 0
  let errorMessage = isZeroTokens
    ? `No valid verdict found. The LLM produced an empty response.`
    : `No valid verdict found (ACCEPT, REJECT, DEBT, etc.) in the Critic's response.`
  let guidance = INSUFFICIENT_REVIEW_GUIDANCE

  if (reviewResult.structuredProseMismatch) {
    errorMessage =
      'STRUCTURED_PROSE_MISMATCH: Critic VERDICT: line disagrees with closing free-prose. Auto-ACCEPT and ACCEPT_IMPLEMENTER are banned.'
    guidance = `Resubmit submit_phase_review with the same files[] so the Critic emits a consistent VERDICT: line.
Do NOT call log_human_decision(ACCEPT_IMPLEMENTER) — continue the Implementer↔Critic debate.
Post-ACCEPT hygiene always requires a fresh submit_phase_review (new phaseId suffix ok).`
  }

  const structuredResponse = buildCriticResponse(
    CRITIC_VERDICTS.INSUFFICIENT_REVIEW,
    reviewResult.response.content,
    reviewResult.response.usage?.completionTokens ?? 0,
    [],
    [],
    reviewResult.filesAnalyzed
  )
  return {
    content: [
      toTextContentWithHints(
        {
          ...structuredResponse,
          model: reviewResult.model,
          usage: reviewResult.response.usage,
          verdict: CRITIC_VERDICTS.INSUFFICIENT_REVIEW,
          code: reviewResult.structuredProseMismatch ? 'STRUCTURED_PROSE_MISMATCH' : undefined,
          message: errorMessage,
          guidance,
          filesAnalyzed: reviewResult.filesAnalyzed
        },
        semanticDiffHints
      )
    ]
  }
}

function handleAcceptWithUnverifiedConcerns(
  reviewResult: CriticReviewResult,
  session: ReviewSession,
  semanticDiffHints: string[]
): { content: Array<{ type: 'text'; text: string }> } {
  // Only REVIEWED_VALID concerns are blocking. REVIEWED_INVALID are dismissed.
  // PENDING concerns are also blocking (not yet evaluated).
  const activeConcerns = session.concerns.filter(
    c => c.reviewStatus === CONCERN_REVIEW_STATUS.REVIEWED_VALID || c.reviewStatus === CONCERN_REVIEW_STATUS.PENDING
  )
  const structuredResponse = buildCriticResponse(
    CRITIC_VERDICTS.DEBT,
    reviewResult.response.content,
    reviewResult.response.usage?.completionTokens ?? 0,
    session.concerns,
    [],
    reviewResult.filesAnalyzed
  )
  return {
    content: [
      toTextContentWithHints(
        {
          ...structuredResponse,
          model: reviewResult.model,
          usage: reviewResult.response.usage,
          verdict: CRITIC_VERDICTS.DEBT,
          message: `Cannot ACCEPT. ${activeConcerns.length} active concerns remain (REVIEWED_VALID or PENDING).`,
          remainingConcerns: activeConcerns.map(c => c.ruleId),
          filesAnalyzed: reviewResult.filesAnalyzed
        },
        semanticDiffHints
      )
    ]
  }
}

function handleDebtWithoutLog(
  reviewResult: CriticReviewResult,
  round: number,
  semanticDiffHints: string[]
): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      toTextContentWithHints(
        {
          verdict: CRITIC_VERDICTS.REJECT,
          message: `DEBT verdict in Round ${round} requires logToDebt parameter. Please provide { subject, rationale } to log the technical debt.`,
          model: reviewResult.model,
          usage: reviewResult.response.usage,
          filesAnalyzed: reviewResult.filesAnalyzed
        },
        semanticDiffHints
      )
    ]
  }
}

async function processVerdict(
  reviewResult: CriticReviewResult,
  session: ReviewSession | null,
  workspaceRoot: string,
  args: SubmitPhaseReviewArgs,
  round: number,
  semanticDiffHints: string[]
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Guard: INSUFFICIENT_REVIEW
  if (reviewResult.insufficientReview) {
    await writeInsufficientReviewSession(workspaceRoot, session, args.phaseId, reviewResult)
    return handleInsufficientReview(reviewResult, semanticDiffHints)
  }

  // ACCEPT only from a structured VERDICT: ACCEPT line (never free-prose / null).
  if (reviewResult.parsedVerdict === CRITIC_VERDICTS.ACCEPT) {
    return handleAcceptVerdictFlow(reviewResult, session, workspaceRoot, args, semanticDiffHints)
  }

  // CONCERNS_ADDRESSED verdict - all concerns verified, treat as ACCEPT
  if (reviewResult.parsedVerdict === CRITIC_VERDICTS.CONCERNS_ADDRESSED) {
    return handleAcceptVerdictFlow(reviewResult, session, workspaceRoot, args, semanticDiffHints)
  }

  // DEBT verdict - handle verification and logging
  if (reviewResult.parsedVerdict === CRITIC_VERDICTS.DEBT) {
    const debtResult = await handleDebtVerdict(reviewResult, session, workspaceRoot, args, round, semanticDiffHints)
    if (debtResult) return debtResult
  }

  // BLOCK verdict - concerns unresolved after max rounds
  if (reviewResult.parsedVerdict === CRITIC_VERDICTS.BLOCK) {
    return handleRejectOrContinue(reviewResult, session, workspaceRoot, args, semanticDiffHints)
  }

  // REJECT or continue
  return handleRejectOrContinue(reviewResult, session, workspaceRoot, args, semanticDiffHints)
}

async function handleDebtVerdict(
  reviewResult: CriticReviewResult,
  session: ReviewSession | null,
  workspaceRoot: string,
  args: SubmitPhaseReviewArgs,
  round: number,
  semanticDiffHints: string[]
): Promise<{ content: Array<{ type: 'text'; text: string }> } | null> {
  const verifications = reviewResult.roundData.verifications ?? []
  const updatedSession = applyVerifications(session, verifications)

  debugLog(
    `handleDebtVerdict round ${round}: verifications=${verifications.length}, concerns=${session?.concerns.length ?? 0}`
  )
  const sessionStatus = session?.concerns.map(c => c.ruleId + ':' + c.reviewStatus).join(', ') ?? 'none'
  debugLog(`session concerns: ${sessionStatus}`)
  debugLog(`updatedSession concerns: ${updatedSession?.concerns.length ?? 0}`)
  const updatedStatus = updatedSession?.concerns.map(c => c.ruleId + ':' + c.reviewStatus).join(', ') ?? 'none'
  debugLog(`updatedSession status: ${updatedStatus}`)

  // Only check prior concerns for ACCEPT.
  // New concerns raised this round can be addressed in next round.
  // PRIOR concerns must ALL be REVIEWED_INVALID (verified as false positive or resolved).
  const priorConcerns = session?.concerns ?? []
  const allPriorVerified = canPromotePriorConcernsToAccept(priorConcerns)

  if (allPriorVerified)
    return handleAcceptVerdictFlow(reviewResult, updatedSession, workspaceRoot, args, semanticDiffHints)

  if (requiresDebtLog(round, CRITIC_VERDICTS.DEBT) && !args.logToDebt) {
    return handleDebtWithoutLog(reviewResult, round, semanticDiffHints)
  }

  if (args.logToDebt) await appendToDebt(workspaceRoot, args.phaseId, args.logToDebt.subject, args.logToDebt.rationale)

  return null
}

function applyVerifications(
  session: ReviewSession | null,
  verifications: ReturnType<typeof parseVerificationsFromResponse>
): ReviewSession | null {
  let updated = session
  for (const verification of verifications) {
    if (updated) updated = verifyConcern(updated, verification)
  }
  return updated
}

async function writeInsufficientReviewSession(
  workspaceRoot: string,
  session: ReviewSession | null,
  phaseId: string,
  reviewResult: CriticReviewResult
): Promise<void> {
  const nextSession = appendRound(session, phaseId, reviewResult.roundData)
  await writeSession(workspaceRoot, nextSession)
}

async function handleAcceptVerdictFlow(
  reviewResult: CriticReviewResult,
  session: ReviewSession | null,
  workspaceRoot: string,
  args: SubmitPhaseReviewArgs,
  semanticDiffHints: string[]
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const verifications = reviewResult.roundData.verifications ?? []
  const updatedSession = applyVerifications(session, verifications)

  // ACCEPT is allowable when:
  // - All prior concerns have been reviewed (none are PENDING)
  // - No REVIEWED_VALID (active) concerns remain unaddressed
  // REVIEWED_INVALID concerns are dismissed by the Critic and must NOT block ACCEPT.
  let allReviewed = false
  let noActiveConcernsLeft = false
  if (updatedSession) {
    allReviewed = allConcernsReviewed(updatedSession)
    noActiveConcernsLeft = !hasActiveConcerns(updatedSession)
  } else if (session === null && verifications.length > 0) {
    // No session: treat all verifications as reviewed (they are all evaluated in this round)
    allReviewed = true
    noActiveConcernsLeft = verifications.every(v => !v.verified)
  }

  // Stale session + empty current round must NOT auto-ACCEPT (fail-closed).
  const currentRoundHasContent = (reviewResult.roundData.concerns?.length ?? 0) > 0 || verifications.length > 0
  const sessionHasStaleConcerns = session && session.concerns.length > 0 && !currentRoundHasContent

  if (sessionHasStaleConcerns) {
    return handleAcceptWithUnverifiedConcerns(reviewResult, updatedSession ?? session, semanticDiffHints)
  }

  if (session && session.concerns.length > 0 && !(allReviewed && noActiveConcernsLeft)) {
    return handleAcceptWithUnverifiedConcerns(reviewResult, updatedSession ?? session, semanticDiffHints)
  }
  return handleAcceptVerdict(reviewResult, workspaceRoot, args, semanticDiffHints)
}

export async function handleSubmitPhaseReview(
  rawArgs: unknown
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const parsed = submitPhaseReviewInputSchema.safeParse(rawArgs)
  if (!parsed.success) {
    return {
      content: [
        toTextContent({
          error: 'Invalid submit_phase_review arguments',
          issues: z.flattenError(parsed.error)
        })
      ]
    }
  }
  const input = parsed.data

  const config = loadConfig()
  const provider = createLLMProvider(config)

  if (!provider) {
    return { content: [toTextContent({ error: ERROR_MESSAGES.NO_LLM_PROVIDER })] }
  }

  const workspaceRoot = getWorkspaceRoot()

  let semanticDiff: string
  if (input.files && input.files.some(f => f.trim().length > 0)) {
    const built = await buildSemanticDiffFromSourceFiles(workspaceRoot, input.files)
    if (!built.ok) {
      return { content: [toTextContent({ error: built.message, code: built.code })] }
    }
    semanticDiff = built.semanticDiff
    debugLog(`semanticDiff built from files[]: ${built.filesLoaded.join(', ')}`)
  } else if (input.semanticDiffPath?.trim()) {
    const loaded = await loadSemanticDiffFromWorkspacePath(workspaceRoot, input.semanticDiffPath.trim())
    if (!loaded.ok) {
      return { content: [toTextContent({ error: loaded.message, code: loaded.code })] }
    }
    semanticDiff = loaded.semanticDiff
    debugLog(`semanticDiff loaded from file: ${loaded.resolvedFromPath}`)
  } else {
    semanticDiff = input.semanticDiff!.trim()
  }

  const args: SubmitPhaseReviewArgs = {
    phaseId: input.phaseId,
    report: input.report,
    semanticDiff,
    dependencies: input.dependencies,
    round: input.round,
    logToDebt: input.logToDebt,
    updateStatus: input.updateStatus
  }
  const semanticDiffHints = computeSemanticDiffLineHints(semanticDiff)
  // FIX: Only clear session for round 1 (fresh start).
  // Multi-round conflict loop requires session persistence across rounds.
  const round = args.round ?? DEFAULT_ROUND
  if (round <= 1) await clearSession(workspaceRoot)
  const session = await readSession(workspaceRoot)
  const deadlockResult = await checkDeadlockEarly(workspaceRoot, args, session, semanticDiffHints)
  if (deadlockResult) return deadlockResult

  try {
    const reviewResult = await runCriticReview(workspaceRoot, args, session, config, provider)
    return processVerdict(reviewResult, session, workspaceRoot, args, round, semanticDiffHints)
  } catch (err: unknown) {
    const errorMessage = getErrorMessage(err)
    const errorObj = err as Record<string, unknown>
    if (errorMessage.includes('401') || errorObj?.status === 401 || errorObj?.statusCode === 401) {
      return {
        content: [
          toTextContent({
            error: 'Authentication failed (401 Unauthorized). Invalid or missing API keys.',
            details:
              'Vibe-Gate reads keys in this order:\n1. Process Environment (MCP config, shell env)\n2. Workspace .env (if VIBE_WORKSPACE_ROOT is set)\n3. Package .env (where vibe-gate-mcp is installed)\n\nPlease ensure your key is correct.'
          })
        ]
      }
    }
    return { content: [toTextContent({ error: errorMessage })] }
  }
}
