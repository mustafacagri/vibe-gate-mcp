/**
 * Append to DEBT.md per format spec.
 * Output is always English (VIBE-GATE.md language policy).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEBT, ISO_DATE_SLICE_END, PATHS, REGEX_SPECIAL_CHARS_STR } from '@/constants'

function formatDebtEntry(date: string, subject: string, phase: string, rationale: string): string {
  return DEBT.ENTRY_TEMPLATE.replace('{{DATE}}', date)
    .replace('{{SUBJECT}}', subject)
    .replace('{{PHASE}}', phase)
    .replace('{{RATIONALE}}', rationale)
}

/** Exact heading line for duplicate check (avoids partial subject match). */
function duplicateHeading(date: string, subject: string): string {
  return `### ${date} - ${subject}`
}

export async function appendToDebt(
  workspaceRoot: string,
  phaseId: string,
  subject: string,
  rationale: string
): Promise<void> {
  const path = join(workspaceRoot, PATHS.DEBT_MD)

  const date = new Date().toISOString().slice(0, ISO_DATE_SLICE_END)
  const entry = formatDebtEntry(date, subject, phaseId, rationale)

  const existing = await readFile(path, 'utf-8').catch(() => '')

  if (existing.includes(duplicateHeading(date, subject))) {
    return
  }
  const sameSubjectAnyDate = new RegExp(String.raw`### \d{4}-\d{2}-\d{2} - ${escapeRegExp(subject)}(?:\s|$)`)

  if (sameSubjectAnyDate.test(existing)) return

  const marker = DEBT.SECTION_MARKER
  const markerWithNewline = `${marker}\n`
  const insertIndex = existing.includes(marker) ? existing.indexOf(marker) + markerWithNewline.length : existing.length

  let updatedContent = existing
  if (existing.includes(DEBT.EMPTY_PLACEHOLDER)) {
    updatedContent = existing.replaceAll(DEBT.EMPTY_PLACEHOLDER, '')
  }

  const updated =
    updatedContent.slice(0, insertIndex) + entry.trimStart() + '\n' + updatedContent.slice(insertIndex).trimStart()

  await writeFile(path, updated, 'utf-8')
}

function escapeRegExp(s: string): string {
  let result = ''
  for (const c of s) {
    result += REGEX_SPECIAL_CHARS_STR.includes(c) ? '\\' + c : c
  }
  return result
}
