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

interface CriticalAccumulator {
  auth: string[]
  db: string[]
  api: string[]
}

function matchAndAccumulate(rel: string, acc: CriticalAccumulator): void {
  const relLower = rel.toLowerCase()
  if (matchesPattern(relLower, CRITICAL_PATTERNS.AUTH)) {
    acc.auth.push(rel)
  }
  if (matchesPattern(relLower, CRITICAL_PATTERNS.DB)) {
    acc.db.push(rel)
  }
  if (matchesPattern(relLower, CRITICAL_PATTERNS.API)) {
    acc.api.push(rel)
  }
}

async function scanDirectory(root: string, dir: string, acc: CriticalAccumulator): Promise<void> {
  const fullPath = join(root, dir)
  try {
    const entries = await readdir(fullPath, { withFileTypes: true })
    const tasks: Promise<void>[] = []

    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!SCAN_IGNORE_SET.has(e.name)) {
          tasks.push(scanDirectory(root, rel, acc))
        }
      } else if (e.isFile()) {
        matchAndAccumulate(rel, acc)
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks)
    }
  } catch {
    // ignore unreadable directories
  }
}

export async function extractCriticalSnippets(workspaceRoot: string): Promise<CriticalSnippets> {
  const acc: CriticalAccumulator = {
    auth: [],
    db: [],
    api: []
  }

  await scanDirectory(workspaceRoot, '', acc)

  const sortFn = (a: string, b: string) => a.localeCompare(b)
  acc.auth.sort(sortFn)
  acc.db.sort(sortFn)
  acc.api.sort(sortFn)

  const format = (paths: string[]): string[] => paths.slice(0, MAX_CRITICAL_FILES_PER_CATEGORY)

  return {
    auth: format(acc.auth),
    db: format(acc.db),
    api: format(acc.api)
  }
}
