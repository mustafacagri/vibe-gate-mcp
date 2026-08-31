/**
 * Read contents of changed files with truncation.
 * Used for relevance filtering - only read files that were actually changed.
 * Includes auto-import expansion for TypeScript/JavaScript files.
 */

import { readFile } from 'node:fs/promises'
import { accessSync } from 'node:fs'
import { join, dirname, relative, resolve, normalize } from 'node:path'
import { estimateTokens } from '@/utils/tokenEstimator'
import { CONTEXT_LIMITS } from '@/constants'

/**
 * Validate that a file path resolves to within the workspace root.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 */
function isWithinWorkspace(workspaceRoot: string, filePath: string): boolean {
  const resolved = resolve(workspaceRoot, filePath)
  const normalizedRoot = normalize(workspaceRoot)
  const normalizedResolved = normalize(resolved)
  return normalizedResolved.startsWith(normalizedRoot)
}

export interface FileContent {
  path: string
  content: string
  truncated: boolean
}

export async function readChangedFileContent(
  workspaceRoot: string,
  filePath: string,
  maxLines: number = CONTEXT_LIMITS.MAX_LINES_PER_FILE,
  lineRange?: string
): Promise<FileContent> {
  // Path traversal guard: reject paths outside workspace
  if (!isWithinWorkspace(workspaceRoot, filePath)) {
    return { path: filePath, content: '(access denied: path outside workspace)', truncated: false }
  }

  try {
    const fullPath = join(workspaceRoot, filePath)
    const raw = await readFile(fullPath, 'utf-8')
    const lines = raw.split('\n')

    if (lineRange) {
      let startIdx = 0
      let endIdx = lines.length
      const parts = lineRange.split('-')
      const start = parseInt(parts[0], 10)
      if (!isNaN(start)) startIdx = Math.max(0, start - 1)
      if (parts.length > 1) {
        const end = parseInt(parts[1], 10)
        if (!isNaN(end)) endIdx = Math.min(lines.length, end)
      } else {
        // If single line is requested, give 50 lines before and after for context
        startIdx = Math.max(0, startIdx - 50)
        endIdx = Math.min(lines.length, startIdx + 100)
      }
      // Prepend line numbers so Critic knows exactly where they are
      const content = lines
        .slice(startIdx, endIdx)
        .map((l, i) => `${startIdx + i + 1} | ${l}`)
        .join('\n')
      return { path: filePath, content, truncated: false }
    }

    const content = lines.slice(0, maxLines).join('\n')
    const truncated = lines.length > maxLines
    return { path: filePath, content, truncated }
  } catch {
    return { path: filePath, content: CONTEXT_LIMITS.FILE_UNREADABLE, truncated: false }
  }
}

function findQuotedString(line: string, startPos: number): string | null {
  const singleQuote = line.indexOf("'", startPos)
  const doubleQuote = line.indexOf('"', startPos)
  if (singleQuote === -1 && doubleQuote === -1) return null
  if (singleQuote !== -1 && (doubleQuote === -1 || singleQuote < doubleQuote)) {
    const end = line.indexOf("'", singleQuote + 1)
    return end === -1 ? null : line.slice(singleQuote + 1, end)
  }
  if (doubleQuote !== -1) {
    const end = line.indexOf('"', doubleQuote + 1)
    return end === -1 ? null : line.slice(doubleQuote + 1, end)
  }
  return null
}

function extractQuotedPath(line: string): string | null {
  if (line.includes('from')) {
    const afterFrom = line.slice(line.indexOf('from') + 4)
    return findQuotedString(afterFrom, 0)
  }
  if (line.includes('require(')) {
    const afterRequire = line.slice(line.indexOf('require(') + 8)
    return findQuotedString(afterRequire, 0)
  }
  return null
}

export function parseImportsFromContent(_filePath: string, content: string): string[] {
  const imports: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('import ') && !trimmed.startsWith('export ') && !trimmed.includes('require(')) {
      continue
    }
    const importPath = extractQuotedPath(trimmed)
    if (importPath && (importPath.startsWith('.') || importPath.startsWith('@/'))) {
      imports.push(importPath)
    }
  }

  return [...new Set(imports)]
}

function resolveImportPath(workspaceRoot: string, fileDir: string, importPath: string): string | null {
  const resolvedPath = importPath.startsWith('@/')
    ? join(workspaceRoot, 'src', importPath.slice(2))
    : join(workspaceRoot, fileDir, importPath)

  const extensions = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']

  for (const ext of extensions) {
    const candidate = resolvedPath + ext
    try {
      accessSync(candidate)
      return relative(workspaceRoot, candidate)
    } catch {
      continue
    }
  }
  return null
}

function gatherExpandedImports(
  workspaceRoot: string,
  files: string[],
  fileContents: Map<string, string>,
  fileDir: string
): string[] {
  const expanded: string[] = []
  const maxExpanded = CONTEXT_LIMITS.MAX_EXPANDED_FILES
  const processed = new Set<string>()
  const toProcess: string[] = [...files]

  while (toProcess.length > 0 && expanded.length < maxExpanded) {
    const file = toProcess.shift()!
    if (processed.has(file)) continue
    processed.add(file)

    const content = fileContents.get(file)
    if (!content) continue

    const imports = parseImportsFromContent(file, content)
    for (const imp of imports) {
      if (expanded.length >= maxExpanded) break
      const resolved = resolveImportPath(workspaceRoot, fileDir, imp)
      if (resolved && !files.includes(resolved) && !expanded.includes(resolved) && !processed.has(resolved)) {
        toProcess.push(resolved)
        expanded.push(resolved)
      }
    }
  }

  return expanded
}

export async function expandImports(
  workspaceRoot: string,
  files: string[],
  fileContents: Map<string, string>
): Promise<string[]> {
  if (!CONTEXT_LIMITS.IMPORT_EXPANSION_ENABLED) return []
  const fileDir = dirname(files[0] || '.')
  return gatherExpandedImports(workspaceRoot, files, fileContents, fileDir)
}

async function addFileToContents(
  workspaceRoot: string,
  file: string,
  contents: FileContent[],
  fileContentMap: Map<string, string>,
  totalTokens: { value: number },
  maxTokens: number,
  allowFullRead: boolean = false
): Promise<boolean> {
  const baseLines = CONTEXT_LIMITS.MAX_LINES_PER_FILE

  // Parse filePath and lineRange (e.g., "src/app.ts:10-20" -> ["src/app.ts", "10-20"])
  const parts = file.split(':')
  const filePath = parts[0]
  const lineRange = parts[1]

  const fileContent = await readChangedFileContent(workspaceRoot, filePath, baseLines, lineRange)
  const fileTokens = estimateTokens(fileContent.content)
  const remainingBudget = maxTokens - totalTokens.value

  if (allowFullRead && !lineRange && fileTokens <= remainingBudget) {
    const fullContent = await readChangedFileContent(workspaceRoot, filePath, Number.MAX_SAFE_INTEGER)
    fileContentMap.set(file, fullContent.content)
    contents.push(fullContent)
    totalTokens.value += estimateTokens(fullContent.content)
    return false
  }

  fileContentMap.set(file, fileContent.content)
  if (totalTokens.value + fileTokens <= maxTokens) {
    contents.push(fileContent)
    totalTokens.value += fileTokens
    return false
  }

  const truncatedContent = await readChangedFileContent(
    workspaceRoot,
    filePath,
    CONTEXT_LIMITS.TRUNCATED_LINES_FALLBACK
  )
  const truncatedTokens = estimateTokens(truncatedContent.content)
  if (totalTokens.value + truncatedTokens <= maxTokens) {
    contents.push(truncatedContent)
    totalTokens.value += truncatedTokens
    return false
  }
  return true
}

export async function readChangedFilesWithBudget(
  workspaceRoot: string,
  filesChanged: string[],
  maxTokens: number,
  expandImports_: boolean = CONTEXT_LIMITS.IMPORT_EXPANSION_ENABLED
): Promise<{ contents: FileContent[]; budgetExceeded: boolean; expandedFiles: string[] }> {
  const contents: FileContent[] = []
  const fileContentMap = new Map<string, string>()
  const totalTokens = { value: 0 }
  let budgetExceeded = false

  for (const file of filesChanged) {
    if (await addFileToContents(workspaceRoot, file, contents, fileContentMap, totalTokens, maxTokens, true)) {
      budgetExceeded = true
      break
    }
  }

  let expandedFiles: string[] = []
  if (expandImports_) {
    expandedFiles = await expandImports(workspaceRoot, filesChanged, fileContentMap)
    const expandedContents = await Promise.all(
      expandedFiles.map(expandedFile =>
        readChangedFileContent(workspaceRoot, expandedFile, CONTEXT_LIMITS.TRUNCATED_LINES_FALLBACK)
      )
    )

    for (const expandedContent of expandedContents) {
      if (totalTokens.value >= maxTokens) {
        budgetExceeded = true
        break
      }
      const expandedTokens = estimateTokens(expandedContent.content)
      if (totalTokens.value + expandedTokens <= maxTokens) {
        contents.push(expandedContent)
        totalTokens.value += expandedTokens
      } else {
        budgetExceeded = true
        break
      }
    }
  }

  return { contents, budgetExceeded, expandedFiles }
}

function hasImportStatements(content: string): boolean {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('import ') || trimmed.startsWith('export ') || trimmed.includes('require(')) {
      return true
    }
  }
  return false
}

export function formatFileContentsForPrompt(
  contents: FileContent[],
  changedFiles: string[],
  expandedFiles: string[] = []
): string {
  if (contents.length === 0) {
    return `Changed files: ${changedFiles.join(', ')}. No file contents available.`
  }

  const allFiles = [...changedFiles, ...expandedFiles.filter(f => !changedFiles.includes(f))]
  const contentMap = new Map(contents.map(c => [c.path, c]))

  const fileContents = allFiles
    .map(file => {
      const fc = contentMap.get(file)
      if (!fc) return null
      const truncNote = fc.truncated ? ' (truncated)' : ''
      const isExpanded = expandedFiles.includes(file) ? ' [import]' : ''
      let truncatedWarning = ''
      if (fc.truncated && hasImportStatements(fc.content)) {
        truncatedWarning =
          '\n⚠️ NOTE: This file was truncated. Imports visible may have usages outside the visible area - do NOT mark them as unused without checking.'
      }
      return `[${file}]${isExpanded}${truncNote}:\n${fc.content}${truncatedWarning}`
    })
    .filter((f): f is string => f !== null)

  return `Changed files:\n${fileContents.join('\n---\n')}`
}
