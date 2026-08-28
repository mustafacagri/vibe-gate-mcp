/**
 * Format critical snippets with file content for Critic prompt.
 */

import { readFile } from 'node:fs/promises'
import { join, resolve, normalize } from 'node:path'
import { CRITICAL_LABELS, CRITICAL_AREAS_PREFIX, SNIPPET_MAX_LINES, SNIPPET_SEPARATOR } from '@/constants'
import type { CriticalSnippets } from '@/summarizer/types'

async function readSnippetContent(workspaceRoot: string, path: string): Promise<string> {
  // Path traversal guard
  const resolved = resolve(workspaceRoot, path)
  if (!normalize(resolved).startsWith(normalize(workspaceRoot))) return ''

  try {
    const fullPath = join(workspaceRoot, path)
    const content = await readFile(fullPath, 'utf-8')
    const lines = content.split('\n').slice(0, SNIPPET_MAX_LINES)
    return lines.join('\n')
  } catch {
    return ''
  }
}

async function formatCategory(workspaceRoot: string, label: string, paths: string[]): Promise<string> {
  if (paths.length === 0) return `${label}: ${CRITICAL_LABELS.NONE}`
  const contents = await Promise.all(paths.map(p => readSnippetContent(workspaceRoot, p)))
  const parts = paths.map((p, i) => {
    const c = contents[i]
    return c ? `[${p}]:\n${c}` : `[${p}]: ${CRITICAL_LABELS.UNREADABLE}`
  })
  return `${label}: ${parts.join(SNIPPET_SEPARATOR)}`
}

export async function formatCriticalSnippetsForPrompt(
  workspaceRoot: string,
  snippets: CriticalSnippets
): Promise<string> {
  const [authStr, dbStr, apiStr] = await Promise.all([
    formatCategory(workspaceRoot, CRITICAL_LABELS.AUTH, snippets.auth),
    formatCategory(workspaceRoot, CRITICAL_LABELS.DB, snippets.db),
    formatCategory(workspaceRoot, CRITICAL_LABELS.API, snippets.api)
  ])
  return `${CRITICAL_AREAS_PREFIX}${authStr}. ${dbStr}. ${apiStr}.`
}
