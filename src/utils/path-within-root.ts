/**
 * Cross-platform "path B is inside path A" after both are resolved (e.g. realpath).
 * Uses path.relative — avoids duplicated win32/posix prefix string logic.
 */

import { isAbsolute, relative } from 'node:path'

/**
 * @param rootReal canonical absolute path to workspace root (no trailing sep required)
 * @param candidateReal canonical absolute path to file or directory
 */
export function isResolvedPathWithinRoot(rootReal: string, candidateReal: string): boolean {
  const rel = relative(rootReal, candidateReal)
  if (rel === '') return true
  if (isAbsolute(rel)) return false
  return !rel.startsWith('..')
}
