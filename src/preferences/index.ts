/**
 * Read Judge decisions from preferences.log for Critic prompt injection.
 * Uses rolling window to limit size.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PATHS, CONTEXT_LIMITS } from '@/constants'

export async function readPreferencesLog(workspaceRoot: string): Promise<string> {
  const path = join(workspaceRoot, PATHS.PREFERENCES_LOG)
  try {
    const content = await readFile(path, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim().length > 0)
    if (lines.length <= CONTEXT_LIMITS.MAX_PREFERENCES_ENTRIES) return content
    const lastLines = lines.slice(-CONTEXT_LIMITS.MAX_PREFERENCES_ENTRIES)
    return lastLines.join('\n') + '\n'
  } catch {
    return ''
  }
}
