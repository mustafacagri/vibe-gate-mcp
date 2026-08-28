/**
 * Non-blocking hints when FILE:…CONTENT: blocks are very large (soft threshold in SEMANTIC_DIFF_FILE).
 */

import { SEMANTIC_DIFF_FILE } from '@/constants'
import { extractFileInfosFromSemanticDiff } from '@/utils/criticResponseParser'

export function computeSemanticDiffLineHints(semanticDiff: string): string[] {
  const threshold = SEMANTIC_DIFF_FILE.SOFT_WARN_LINES_PER_FILE_BLOCK
  const files = extractFileInfosFromSemanticDiff(semanticDiff)
  const hints: string[] = []

  if (
    files.length === 0 &&
    semanticDiff.trim().length >= SEMANTIC_DIFF_FILE.HINT_MIN_CHARS_WHEN_NO_FILE_BLOCKS_PARSED
  ) {
    hints.push(
      'No FILE:...CONTENT: blocks were parsed, but the payload is very large. Confirm format (docs/SEMANTIC_DIFF_PAYLOAD.md); unified git diffs are not valid here.'
    )
  }

  for (const f of files) {
    if (f.totalLines > threshold) {
      hints.push(
        `FILE block "${f.filePath}" has ${f.totalLines} content lines (soft advisory threshold: ${threshold}). Consider splitting work across smaller submits if your project limits source file size.`
      )
    }
  }
  return hints
}
