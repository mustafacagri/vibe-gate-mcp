/**
 * Parse semantic diff string (unified diff format) into structured object.
 */

import { DIFF_MARKERS, DIFF_REGEXES, EMPTY_SEMANTIC_DIFF, SEMANTIC_DIFF_FALLBACK_FILE_EXTENSIONS } from '@/constants'
import type { ParsedSemanticDiff } from '@/summarizer/types'

function buildFallbackPathRegex(): RegExp {
  const ext = SEMANTIC_DIFF_FALLBACK_FILE_EXTENSIONS.join('|')
  // Match file paths with optional line ranges, handling whitespace and separators more aggressively
  // Valid patterns: "src/app.ts", "src/app.ts:10-20", "web/prisma/schema.prisma:141"
  return new RegExp(
    `(?:^|\\s|\\(|['"\`]|\\b)([a-zA-Z0-9_.-]+(?:\\/[a-zA-Z0-9_.-]+)*\\.(?:${ext})(?::\\d+(?:-\\d+)?)?)(?=\\s|\\)|['"\`]|[,;.]|$)`,
    'g'
  )
}

function extractPathsFromPlainText(trimmed: string): string[] {
  const paths = new Set<string>()
  const re = buildFallbackPathRegex()
  let match: RegExpExecArray | null
  while ((match = re.exec(trimmed)) !== null) {
    // The capture group 1 contains the path
    if (match[1]) {
      paths.add(match[1].trim())
    }
  }
  return [...paths]
}

function extractFilePaths(text: string): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  for (const regex of [DIFF_REGEXES.OLD_FILE, DIFF_REGEXES.NEW_FILE]) {
    let match: RegExpExecArray | null
    const re = new RegExp(regex.source, 'gm')
    while ((match = re.exec(text)) !== null) {
      const path = match[1].trim()
      if (path !== DIFF_MARKERS.DEV_NULL && !seen.has(path)) {
        seen.add(path)
        paths.push(path)
      }
    }
  }

  return [...new Set(paths)]
}

function countAdditions(text: string): number {
  const matches = text.match(new RegExp(DIFF_REGEXES.ADDITION_LINE.source, 'gm'))
  return matches?.length ?? 0
}

function countRemovals(text: string): number {
  const matches = text.match(new RegExp(DIFF_REGEXES.REMOVAL_LINE.source, 'gm'))
  return matches?.length ?? 0
}

function looksLikeUnifiedDiff(text: string): boolean {
  return (
    text.includes(DIFF_MARKERS.OLD_FILE) &&
    text.includes(DIFF_MARKERS.NEW_FILE) &&
    text.includes(DIFF_MARKERS.HUNK_HEADER)
  )
}

export function parseSemanticDiff(raw: string): ParsedSemanticDiff {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ...EMPTY_SEMANTIC_DIFF }
  }

  const isUnified = looksLikeUnifiedDiff(trimmed)
  const unifiedFiles = isUnified ? extractFilePaths(trimmed) : []
  const fallbackFiles = extractPathsFromPlainText(trimmed)

  // Combine both sources, maintaining uniqueness
  const allFiles = [...new Set([...unifiedFiles, ...fallbackFiles])]

  if (allFiles.length > 0) {
    return {
      filesChanged: allFiles,
      additions: isUnified ? countAdditions(trimmed) : 0,
      removals: isUnified ? countRemovals(trimmed) : 0,
      parseMode: isUnified ? 'unified' : 'fallback_paths'
    }
  }

  return { ...EMPTY_SEMANTIC_DIFF }
}
