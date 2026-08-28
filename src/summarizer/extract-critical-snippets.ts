/**
 * Extract critical snippets (Auth, DB, API) from workspace.
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CRITICAL_PATTERNS, MAX_CRITICAL_FILES_PER_CATEGORY, SCAN_IGNORE_SET } from '@/constants'
import type { CriticalSnippets } from '@/summarizer/types'

function matchesPattern(pathLower: string, patterns: readonly string[]): boolean {
  return patterns.some(p => pathLower.includes(p))
}

async function findMatchingFiles(root: string, dir: string, patterns: readonly string[], acc: string[]): Promise<void> {
  const fullPath = join(root, dir)
  try {
    const entries = await readdir(fullPath, { withFileTypes: true })
    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!SCAN_IGNORE_SET.has(e.name)) await findMatchingFiles(root, rel, patterns, acc)
      } else if (e.isFile() && matchesPattern(rel.toLowerCase(), patterns)) {
        acc.push(rel)
      }
    }
  } catch {
    // ignore
  }
}

export async function extractCriticalSnippets(workspaceRoot: string): Promise<CriticalSnippets> {
  const authFiles: string[] = []
  const dbFiles: string[] = []
  const apiFiles: string[] = []

  await findMatchingFiles(workspaceRoot, '', CRITICAL_PATTERNS.AUTH, authFiles)
  await findMatchingFiles(workspaceRoot, '', CRITICAL_PATTERNS.DB, dbFiles)
  await findMatchingFiles(workspaceRoot, '', CRITICAL_PATTERNS.API, apiFiles)

  const format = (paths: string[]): string[] => paths.slice(0, MAX_CRITICAL_FILES_PER_CATEGORY)

  return {
    auth: format(authFiles),
    db: format(dbFiles),
    api: format(apiFiles)
  }
}
