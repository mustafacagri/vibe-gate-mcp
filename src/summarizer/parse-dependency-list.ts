/**
 * Parse dependency list from package.json or package.json diff.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { DEP_LINE_REGEX, DIFF_DEP_PREFIXES, PATHS, PACKAGE_JSON_DEP_KEYS, PACKAGE_JSON_NON_DEP_SET } from '@/constants'
import { debugLog } from '@/utils/debug'
import { getErrorMessage } from '@/utils/error'
import type { ParsedDependencyList } from '@/summarizer/types'

const packageJsonDepsSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional()
})

function extractPackagesFromDiff(diffText: string): { added: string[]; removed: string[] } {
  const added: string[] = []
  const removed: string[] = []
  const lines = diffText.split('\n')

  for (const line of lines) {
    const match = DEP_LINE_REGEX.exec(line)
    if (!match) continue
    const pkg = match[1]
    if (PACKAGE_JSON_NON_DEP_SET.has(pkg)) continue
    if (line.startsWith(DIFF_DEP_PREFIXES.ADD)) added.push(pkg)
    else removed.push(pkg)
  }

  return { added: [...new Set(added)], removed: [...new Set(removed)] }
}

function isPackageJsonDiff(text: string): boolean {
  return PACKAGE_JSON_DEP_KEYS.some(k => text.includes(`"${k}"`))
}

export async function parseDependencyListFromPackageJson(
  workspaceRoot: string
): Promise<Omit<ParsedDependencyList, 'added' | 'removed' | 'parseMode'>> {
  const path = join(workspaceRoot, PATHS.PACKAGE_JSON)
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = packageJsonDepsSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      debugLog(`package.json parse failed: ${parsed.error.message}`)
      return { dependencies: [], devDependencies: [] }
    }
    const dependencies = parsed.data.dependencies ? Object.keys(parsed.data.dependencies) : []
    const devDependencies = parsed.data.devDependencies ? Object.keys(parsed.data.devDependencies) : []
    return { dependencies, devDependencies }
  } catch (err) {
    debugLog(`parseDependencyListFromPackageJson failed: ${getErrorMessage(err)}`)
    return { dependencies: [], devDependencies: [] }
  }
}

export function parseDependencyDiff(diffText: string): ParsedDependencyList {
  const trimmed = diffText.trim()
  if (!trimmed || !isPackageJsonDiff(trimmed)) {
    return {
      dependencies: [],
      devDependencies: [],
      added: [],
      removed: [],
      parseMode: 'fallback'
    }
  }

  const { added, removed } = extractPackagesFromDiff(trimmed)
  return {
    dependencies: [],
    devDependencies: [],
    added,
    removed,
    parseMode: 'diff'
  }
}
