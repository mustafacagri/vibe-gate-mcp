/**
 * Parser for Critic's structured text response.
 * Extracts CONCERN, VERIFICATION, and REQUEST blocks from free-form LLM output.
 */

import {
  SEVERITY,
  RESPONSE_BLOCKS,
  CONCERN_REVIEW_STATUS,
  STRUCTURED_VERDICT_LINE_REGEX,
  CRITIC_VERDICTS,
  type Verdict
} from '@/constants'
import type { Concern, ConcernVerification } from '@/conflict-loop/types'
import type { Severity } from '@/constants'
import { debugLog } from '@/utils/debug'

export interface FileRequest {
  filePath: string
  lineRange?: string
  reason?: string
}

/**
 * Extract structured Critic verdict from the last `VERDICT: <token>` line only.
 * Returns null when absent → caller maps to INSUFFICIENT_REVIEW (fail-closed).
 */
export function parseVerdictFromResponse(text: string): Verdict | null {
  const matches = [...text.matchAll(STRUCTURED_VERDICT_LINE_REGEX)]
  if (matches.length === 0) return null
  const token = matches[matches.length - 1]?.[1]
  if (!token) return null
  return token.toUpperCase() as Verdict
}

/** Closing-window free-prose that contradicts a structured VERDICT line. */
const PROSE_ACCEPT_RECOMMEND =
  /\b(?:READY TO ACCEPT|RECOMMEND(?:ING)? ACCEPT|SHOULD ACCEPT|ACCEPT THIS (?:BATCH|PHASE|CHANGE)|LGTM[,.]?\s*ACCEPT)\b/i
const PROSE_REJECT_RECOMMEND =
  /\b(?:MUST REJECT|RECOMMEND(?:ING)? REJECT|SHOULD REJECT|DO NOT ACCEPT|CANNOT ACCEPT|READY TO REJECT)\b/i

/**
 * True when the last `VERDICT:` token disagrees with closing free-prose advice.
 * Callers must NOT auto-ACCEPT or unlock ACCEPT_IMPLEMENTER — resubmit Critic round 2.
 */
export function hasStructuredProseMismatch(text: string, structured: Verdict | null): boolean {
  if (!structured) return false
  const closing = text.slice(Math.max(0, text.length - 1200))
  const proseWantsAccept = PROSE_ACCEPT_RECOMMEND.test(closing)
  const proseWantsReject = PROSE_REJECT_RECOMMEND.test(closing)

  const structuredIsAccept = structured === CRITIC_VERDICTS.ACCEPT || structured === CRITIC_VERDICTS.CONCERNS_ADDRESSED
  const structuredIsReject = structured === CRITIC_VERDICTS.REJECT || structured === CRITIC_VERDICTS.BLOCK

  if (structuredIsAccept && proseWantsReject) return true
  if (structuredIsReject && proseWantsAccept) return true
  return false
}

export function parseConcernsFromResponse(response: string): Concern[] {
  const concerns: Concern[] = []
  const lines = response.split('\n')
  const concernRegex = /^CONCERN:\s*(\S+)\s*\|\s*(.+)/i

  for (let i = 0; i < lines.length; i++) {
    const match = concernRegex.exec(lines[i])
    if (match) {
      const concern = parseConcernBlock(lines, i, match)
      if (concern) concerns.push(concern)
    }
  }

  if (concerns.length === 0) return parseCompactConcerns(response)

  return concerns
}

function parseSeverityLine(line: string, currentSeverity: Severity): Severity {
  if (!line.startsWith('SEVERITY:')) return currentSeverity
  const sev = line.slice(9).trim().toUpperCase()
  if (sev === 'BLOCKING') return SEVERITY.BLOCKING
  if (sev === 'WARNING') return SEVERITY.WARNING
  if (sev === 'INFO') return SEVERITY.INFO
  if (sev === 'CRITICAL') return SEVERITY.CRITICAL

  return currentSeverity
}

function parseConcernBlock(lines: string[], startIdx: number, headerMatch: RegExpExecArray): Concern | null {
  const ruleId = headerMatch[1].trim()
  const title = headerMatch[2].trim()
  let file = 'unknown'
  let linesStr = 'unknown'
  let fixRequired = ''
  let severity: Severity = SEVERITY.WARNING

  for (let j = startIdx + 1; j < lines.length; j++) {
    const l = lines[j]
    if (l.startsWith('CONCERN:') || l.startsWith('VERIFIED:') || l.startsWith('NOT_VERIFIED:')) break

    const locMatch = parseLocationLine(l)
    if (locMatch) {
      file = locMatch.file
      linesStr = locMatch.lines
    }

    if (l.startsWith('FIX REQUIRED:')) fixRequired = l.slice(13).trim()

    severity = parseSeverityLine(l, severity)
  }

  const description = fixRequired ? `${title} | ${fixRequired}` : title

  if (file === 'unknown' || linesStr === 'unknown') return null

  return {
    ruleId,
    description,
    severity,
    evidence: `${file}:${linesStr}`,
    // New concerns always start as PENDING - not yet evaluated by any party
    verified: false,
    reviewStatus: CONCERN_REVIEW_STATUS.PENDING
  }
}

function parseLocationLine(line: string): { file: string; lines: string } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('-')) return null

  const content = trimmed.slice(1).trim()

  const parenOpen = content.lastIndexOf('(')
  const parenClose = content.lastIndexOf(')')
  if (parenOpen > 0 && parenClose > parenOpen) {
    const file = content.slice(0, parenOpen).trim()
    const linesPart = content.slice(parenOpen + 1, parenClose)
    const linesRegex = /\d+(?:-\d+)?/
    const linesMatch = linesRegex.exec(linesPart)
    if (linesMatch) {
      return { file, lines: linesMatch[0] }
    }
  }

  const colonIdx = content.indexOf(':')
  if (colonIdx > 0) {
    const file = content.slice(0, colonIdx)
    const linesPart = content.slice(colonIdx + 1)
    const linesRegex = /\d+(?:-\d+)?/
    const linesMatch = linesRegex.exec(linesPart)
    if (linesMatch) {
      return { file: file.trim(), lines: linesMatch[0] }
    }
  }

  return null
}

function parseCompactConcerns(response: string): Concern[] {
  const concerns: Concern[] = []
  const lines = response.split('\n')
  const concernStart = /^CONCERN:\s*(\S+)\s*\|\s*/i

  for (const line of lines) {
    const match = concernStart.exec(line)
    if (!match) continue

    const ruleId = match[1].trim()
    const afterHeader = line.slice(match[0].length)

    const pipeIdx = afterHeader.lastIndexOf('| EVIDENCE:')
    if (pipeIdx === -1) continue

    const description = afterHeader.slice(0, pipeIdx).trim()
    const evidencePart = afterHeader.slice(pipeIdx + 11).trim()

    concerns.push({
      ruleId,
      description,
      severity: SEVERITY.WARNING,
      evidence: evidencePart.trim(),
      // New concerns always start as PENDING
      verified: false,
      reviewStatus: CONCERN_REVIEW_STATUS.PENDING
    })
  }

  return concerns
}

const RULE_ID_REGEX = /\b(DRY|SRP|MAGIC|I18N|NAMES|COMPLEX|TYPE|SEC|ARCH|perf|QUAL)-(\d+)\b/gi

function extractRuleId(content: string, existingConcerns: Concern[]): string {
  const ruleIdMatch = RULE_ID_REGEX.exec(content)
  RULE_ID_REGEX.lastIndex = 0
  if (ruleIdMatch) return ruleIdMatch[0].toUpperCase()

  const arrowIdx = content.indexOf('→')
  const fileLine = arrowIdx > 0 ? content.slice(0, arrowIdx).trim() : content
  const filePrefix = fileLine.split(':')[0]

  const matchedConcern = existingConcerns.find(c => {
    if (c.evidence.startsWith(filePrefix)) return true
    const contentUpper = content.toUpperCase()
    return (
      contentUpper.includes(c.ruleId.toUpperCase()) || contentUpper.includes(c.description.toUpperCase().slice(0, 30))
    )
  })
  return matchedConcern?.ruleId ?? 'UNKNOWN'
}

function extractExplanation(content: string): string {
  const arrowIdx = content.indexOf('→')
  return arrowIdx > 0 ? content.slice(arrowIdx + 1).trim() : content
}

export function parseVerificationsFromResponse(response: string, existingConcerns: Concern[]): ConcernVerification[] {
  const verifications: ConcernVerification[] = []
  const lines = response.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    const isVerified = trimmed.startsWith('VERIFIED:')
    const isNotVerified = trimmed.startsWith('NOT_VERIFIED:')
    if (!isVerified && !isNotVerified) continue

    const content = isVerified ? trimmed.slice(9).trim() : trimmed.slice(14).trim()
    const ruleId = extractRuleId(content, existingConcerns)
    const explanation = extractExplanation(content)
    const arrowIdx = content.indexOf('→')
    const filePart = arrowIdx > 0 ? content.slice(0, arrowIdx).trim() : content

    verifications.push({
      ruleId,
      claimedFix: explanation.trim(),
      verified: isVerified,
      verificationEvidence: `${filePart} → ${explanation}`
    })
  }

  return verifications
}

function parseFileRequestPart(part: string): FileRequest | null {
  const colonIndex = part.indexOf(':')
  if (colonIndex === -1) return part ? { filePath: part } : null
  const filePath = part.slice(0, colonIndex)
  const lineRange = part.slice(colonIndex + 1)
  return filePath ? { filePath, lineRange } : null
}

export function parseRequestsFromResponse(response: string): FileRequest[] {
  const requests: FileRequest[] = []
  const requestRegex = /\bREQUEST:\s*(.+)/gi
  let match: RegExpExecArray | null

  while ((match = requestRegex.exec(response)) !== null) {
    const afterColon = match[1].trim()
    const parts = afterColon.split(',').map(p => p.trim())
    for (const part of parts) {
      const req = parseFileRequestPart(part)
      if (req) requests.push(req)
    }
  }

  return requests
}

export function hasConcernBlocks(response: string): boolean {
  return response.includes(RESPONSE_BLOCKS.CONCERN) && response.includes('EVIDENCE:')
}

export function hasVerificationBlocks(response: string): boolean {
  return response.includes(RESPONSE_BLOCKS.VERIFIED) || response.includes(RESPONSE_BLOCKS.NOT_VERIFIED)
}

export function hasRequestBlocks(response: string): boolean {
  if (response.toUpperCase().includes(RESPONSE_BLOCKS.REQUEST)) return true
  const upper = response.toUpperCase()
  return (
    upper.includes('FILE NOT PROVIDED') ||
    upper.includes('FILE NOT AVAILABLE') ||
    upper.includes('CANNOT ACCESS') ||
    upper.includes('UNABLE TO ACCESS') ||
    upper.includes('FILE NOT FOUND') ||
    upper.includes('CONTENT NOT AVAILABLE')
  )
}

/**
 * Detects if the critic explicitly states that no concerns remain.
 * Used to break deadlocks when the model uses conversational language
 * instead of strictly following the VERIFIED: prefix format.
 */
export function isNoneRemaining(response: string): boolean {
  const upper = response.toUpperCase()
  return (
    (upper.includes('CONCERNS:') && upper.includes('NONE REMAINING')) ||
    upper.includes('NO CONCERNS REMAINING') ||
    upper.includes('ALL CONCERNS HAVE BEEN ADDRESSED') ||
    upper.includes('ALL CONCERNS VERIFIED AS ADDRESSED')
  )
}

function extractLineRangeFromEvidence(evidence: string): { start: number; end: number } | null {
  const colonIdx = evidence.indexOf(':')
  if (colonIdx < 0) return null

  const afterColon = evidence.slice(colonIdx + 1)
  const rangeMatch = /^(\d+)(?:-(\d+))?/.exec(afterColon)
  if (!rangeMatch) return null

  const start = parseInt(rangeMatch[1], 10)
  const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : start
  return { start, end }
}

function getContentAtLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n')
  const startIdx = Math.max(0, startLine - 1)
  const endIdx = Math.min(lines.length, endLine)
  return lines.slice(startIdx, endIdx).join('\n')
}

function validateLineNumbers(fileInfo: FileInfo | undefined, evidence: string): boolean {
  if (!fileInfo) return false

  const lineRange = extractLineRangeFromEvidence(evidence)
  if (!lineRange) return true

  if (lineRange.start > fileInfo.totalLines) {
    debugLog(
      `[DEBUG] validateLineNumbers: REJECTING - start line ${lineRange.start} exceeds total lines ${fileInfo.totalLines}`
    )
    return false
  }
  if (lineRange.end > fileInfo.totalLines) {
    debugLog(
      `[DEBUG] validateLineNumbers: REJECTING - end line ${lineRange.end} exceeds total lines ${fileInfo.totalLines}`
    )
    return false
  }
  return true
}

function extractKeywordsFromDescription(description: string): string[] {
  return description
    .toLowerCase()
    .split(/[\s,\-|]+/)
    .filter(w => w.length > 4)
    .filter(w => !['does', 'doesnt', 'without', 'there', 'their'].includes(w))
}

function validateConcernSemanticMatch(fileInfo: FileInfo, concern: Concern, evidence: string): boolean {
  const lineRange = extractLineRangeFromEvidence(evidence)
  if (!lineRange) return true

  const contentAtLines = getContentAtLines(fileInfo.content, lineRange.start, lineRange.end)
  const contentLower = contentAtLines.toLowerCase()

  const keyWords = extractKeywordsFromDescription(concern.description)

  debugLog(` validateConcernSemanticMatch: checking "${concern.ruleId}"`)
  debugLog(` validateConcernSemanticMatch: description: "${concern.description}"`)
  debugLog(` validateConcernSemanticMatch: keywords: ${keyWords.join(', ')}`)
  debugLog(
    `[DEBUG] validateConcernSemanticMatch: content at lines ${lineRange.start}-${lineRange.end} (${contentAtLines.length} chars): "${contentAtLines.slice(0, 150)}"`
  )

  const regex = /\b[a-z]+[A-Z]\w*/
  const concernFunctionNameMatch = regex.exec(concern.description)
  if (concernFunctionNameMatch) {
    const citedIdentifier = concernFunctionNameMatch[0]
    const concernName = citedIdentifier.toLowerCase()
    debugLog(
      `[DEBUG] validateConcernSemanticMatch: checking identifier "${citedIdentifier}" (${concernName}) against content`
    )

    if (!contentLower.includes(concernName)) {
      debugLog(
        `[DEBUG] validateConcernSemanticMatch: REJECTING "${concern.ruleId}" - identifier "${citedIdentifier}" NOT found in content`
      )

      const functionNameInContent = contentAtLines.match(
        /(?:function|const|let|var)\s+(\w+)|export\s+function\s+(\w+)/gi
      )
      debugLog(
        `[DEBUG] validateConcernSemanticMatch: actual function names in cited lines: ${JSON.stringify(functionNameInContent)}`
      )

      return false
    } else {
      debugLog(` validateConcernSemanticMatch: identifier "${citedIdentifier}" FOUND in content`)
    }
  }

  const foundKeywords = keyWords.filter(kw => contentLower.includes(kw))

  debugLog(` validateConcernSemanticMatch: found keywords: ${foundKeywords.join(', ')}`)

  if (foundKeywords.length === 0) {
    debugLog(
      `[DEBUG] validateConcernSemanticMatch: REJECTING "${concern.ruleId}" - NO keywords from description found in cited lines`
    )
    return false
  }

  if (foundKeywords.length < keyWords.length * 0.5) {
    debugLog(
      `[DEBUG] validateConcernSemanticMatch: REJECTING "${concern.ruleId}" - only ${foundKeywords.length}/${keyWords.length} keywords found (less than 50%)`
    )
    return false
  }

  debugLog(` validateConcernSemanticMatch: KEEPING "${concern.ruleId}" - passed all checks`)
  return true
}

function isConcernValidAgainstDiff(c: Concern, providedFiles: FileInfo[]): boolean {
  const citedFile = extractFileFromEvidence(c.evidence)
  debugLog(` filterConcernsBySemanticDiff: checking concern "${c.ruleId}" with evidence "${c.evidence}"`)
  debugLog(` filterConcernsBySemanticDiff: extracted citedFile: "${citedFile}"`)

  if (!citedFile) {
    debugLog(
      `[DEBUG] filterConcernsBySemanticDiff: concern "${c.ruleId}" has no parseable file in evidence "${c.evidence}" - keeping`
    )
    return true
  }

  const matchingFile = providedFiles.find(pf => citedFile.includes(pf.filePath) || pf.filePath.includes(citedFile))
  debugLog(
    `[DEBUG] filterConcernsBySemanticDiff: matchingFile: ${matchingFile ? matchingFile.filePath : 'NOT FOUND'}`
  )

  if (!matchingFile) {
    debugLog(
      `[DEBUG] filterConcernsBySemanticDiff: REJECTING concern "${c.ruleId}" - cites "${citedFile}" which is NOT in semanticDiff`
    )
    return false
  }

  const lineNumbersValid = validateLineNumbers(matchingFile, c.evidence)
  if (!lineNumbersValid) {
    debugLog(
      `[DEBUG] filterConcernsBySemanticDiff: REJECTING concern "${c.ruleId}" - cites invalid line numbers in "${c.evidence}"`
    )
    return false
  }

  const semanticMatchValid = validateConcernSemanticMatch(matchingFile, c, c.evidence)
  if (!semanticMatchValid) {
    debugLog(
      `[DEBUG] filterConcernsBySemanticDiff: REJECTING concern "${c.ruleId}" - description doesn't match content at cited lines`
    )
    return false
  }

  debugLog(
    `[DEBUG] filterConcernsBySemanticDiff: KEEPING concern "${c.ruleId}" - "${citedFile}" found, line numbers valid, semantic match confirmed`
  )
  return true
}

/**
 * Filter concerns that cite files NOT in the semanticDiff OR cite invalid line numbers.
 * This is an automated validation to reject concerns that reference
 * files the LLM hasn't been provided with OR cite line numbers that don't exist.
 *
 * BUG FIX: LLM was hallucinating line numbers from training data (e.g., citing line 265-267
 * when the actual code is at different lines in the provided content). This validates
 * that cited line numbers actually exist within the provided file content.
 */
export function filterConcernsBySemanticDiff(concerns: Concern[], semanticDiff: string): Concern[] {
  debugLog(` filterConcernsBySemanticDiff ENTRY: ${concerns.length} concerns to filter`)
  debugLog(` filterConcernsBySemanticDiff: semanticDiff length: ${semanticDiff.length}`)

  if (concerns.length === 0) {
    debugLog(` filterConcernsBySemanticDiff: No concerns to filter, returning empty array`)
    return []
  }

  if (!semanticDiff || semanticDiff.trim().length === 0) {
    debugLog(` filterConcernsBySemanticDiff: WARNING - semanticDiff is empty! All concerns will be kept.`)
    return concerns
  }

  const providedFiles = extractFileInfosFromSemanticDiff(semanticDiff)
  debugLog(` filterConcernsBySemanticDiff: ${providedFiles.length} files extracted from semanticDiff`)
  for (const pf of providedFiles) {
    debugLog(` filterConcernsBySemanticDiff: FILE ${pf.filePath} (${pf.totalLines} lines)`)
  }

  const filtered = concerns.filter(c => isConcernValidAgainstDiff(c, providedFiles))

  if (filtered.length < concerns.length) {
    const rejected = concerns.length - filtered.length
    debugLog(` filterConcernsBySemanticDiff: ${rejected} concerns rejected`)
  }
  debugLog(` filterConcernsBySemanticDiff EXIT: ${filtered.length} concerns kept out of ${concerns.length}`)
  return filtered
}

interface FileInfo {
  filePath: string
  startLine: number
  endLine: number
  totalLines: number
  content: string
}

/** Used for concern filtering and optional payload size hints (FILE: / CONTENT: blocks). */
export function extractFileInfosFromSemanticDiff(semanticDiff: string): FileInfo[] {
  const files: FileInfo[] = []
  const lines = semanticDiff.split('\n')
  let currentFile: { path: string; startLine: number; contentLines: string[] } | null = null
  let lineNum = 0

  for (const line of lines) {
    lineNum++
    const trimmed = line.trim()

    if (trimmed.startsWith('FILE:')) {
      if (currentFile) {
        files.push({
          filePath: currentFile.path,
          startLine: currentFile.startLine,
          endLine: lineNum - 1,
          totalLines: currentFile.contentLines.length,
          content: currentFile.contentLines.join('\n')
        })
      }
      const filePath = trimmed.slice(5).trim()
      currentFile = { path: filePath, startLine: lineNum + 1, contentLines: [] }
    } else if (currentFile && trimmed.startsWith('CONTENT:')) {
      // Skip the CONTENT: marker line itself
    } else if (currentFile) currentFile.contentLines.push(line)
  }

  if (currentFile) {
    files.push({
      filePath: currentFile.path,
      startLine: currentFile.startLine,
      endLine: lineNum,
      totalLines: currentFile.contentLines.length,
      content: currentFile.contentLines.join('\n')
    })
  }

  return files
}

function extractFileFromEvidence(evidence: string): string | null {
  const colonIdx = evidence.indexOf(':')
  if (colonIdx > 0) return evidence.slice(0, colonIdx).trim()
  const parenOpen = evidence.indexOf('(')
  if (parenOpen > 0) return evidence.slice(0, parenOpen).trim()
  return null
}
