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

function processFileEntry(rel: string, authFiles: string[], dbFiles: string[], apiFiles: string[]): void {
  const lower = rel.toLowerCase()
  if (matchesPattern(lower, CRITICAL_PATTERNS.AUTH)) {
    authFiles.push(rel)
  }
  if (matchesPattern(lower, CRITICAL_PATTERNS.DB)) {
    dbFiles.push(rel)
  }
  if (matchesPattern(lower, CRITICAL_PATTERNS.API)) {
    apiFiles.push(rel)
  }
}

async function scanWorkspace(
  root: string,
  dir: string,
  authFiles: string[],
  dbFiles: string[],
  apiFiles: string[]
): Promise<void> {
  const fullPath = join(root, dir)
  try {
    const entries = await readdir(fullPath, { withFileTypes: true })
    const subDirPromises: Promise<void>[] = []

    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!SCAN_IGNORE_SET.has(e.name)) {
          subDirPromises.push(scanWorkspace(root, rel, authFiles, dbFiles, apiFiles))
        }
      } else if (e.isFile()) {
        processFileEntry(rel, authFiles, dbFiles, apiFiles)
      }
    }

    if (subDirPromises.length > 0) {
      await Promise.all(subDirPromises)
    }
  } catch {
    // ignore
  }
}

export async function extractCriticalSnippets(workspaceRoot: string): Promise<CriticalSnippets> {
  const authFiles: string[] = []
  const dbFiles: string[] = []
  const apiFiles: string[] = []

  await scanWorkspace(workspaceRoot, '', authFiles, dbFiles, apiFiles)

  const format = (paths: string[]): string[] => paths.slice(0, MAX_CRITICAL_FILES_PER_CATEGORY)

  return {
    auth: format(authFiles),
    db: format(dbFiles),
    api: format(apiFiles)
  }
}
