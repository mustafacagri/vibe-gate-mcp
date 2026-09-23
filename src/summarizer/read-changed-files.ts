/**
 * Read contents of changed files with truncation.
 * Used for relevance filtering - only read files that were actually changed.
 * Includes auto-import expansion for TypeScript/JavaScript files.
 */

import { readFile, stat } from 'node:fs/promises'
import { accessSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { estimateTokens } from '@/utils/tokenEstimator'
import {
  CONTEXT_LIMITS,
  REVIEW_INPUT_LIMITS,
  SEMANTIC_DIFF_PAYLOAD_MARKERS,
  SEMANTIC_DIFF_SOURCE_FILES,
  WORKSPACE_PATH_KIND
} from '@/constants'
import { resolveSafePathInWorkspace, verifyCanonicalPathUnderWorkspace } from '@/utils/resolve-semantic-diff-from-path'
import { parseRequestsFromResponse } from '@/utils/criticResponseParser'
import { formatSemanticDiffFileBlock } from '@/utils/build-semantic-diff-from-files'

export interface FileContent {
  path: string
  content: string
  truncated: boolean
  error?: string
}

export async function readChangedFileContent(
  workspaceRoot: string,
  filePath: string,
  maxLines: number = CONTEXT_LIMITS.MAX_LINES_PER_FILE,
  lineRange?: string
): Promise<FileContent> {
  const pathResult = resolveSafePathInWorkspace(workspaceRoot, filePath, WORKSPACE_PATH_KIND.SOURCE_FILE)
  if (!pathResult.ok) {
    return { path: filePath, content: CONTEXT_LIMITS.FILE_UNREADABLE, truncated: false, error: pathResult.message }
  }

  try {
    const canonical = await verifyCanonicalPathUnderWorkspace(
      workspaceRoot,
      pathResult.absolutePath,
      WORKSPACE_PATH_KIND.SOURCE_FILE
    )
    if (!canonical.ok) {
      return { path: filePath, content: CONTEXT_LIMITS.FILE_UNREADABLE, truncated: false, error: canonical.message }
    }

    const fileStat = await stat(canonical.canonicalPath)
    if (!fileStat.isFile()) {
      return { path: filePath, content: CONTEXT_LIMITS.FILE_UNREADABLE, truncated: false, error: 'Not a regular file.' }
    }
    if (fileStat.size > SEMANTIC_DIFF_SOURCE_FILES.MAX_BYTES_PER_FILE) {
      return {
        path: filePath,
        content: CONTEXT_LIMITS.FILE_UNREADABLE,
        truncated: false,
        error: 'File exceeds size limit.'
      }
    }

    const raw = await readFile(canonical.canonicalPath, 'utf-8')
    const lines = raw.split('\n')

    if (lineRange) {
      const range = /^(\d+)(?:-(\d+))?$/.exec(lineRange)
      const start = Number(range?.[1])
      const end = range?.[2] ? Number(range[2]) : start
      if (!range || start < 1 || end < start) {
        return {
          path: filePath,
          content: CONTEXT_LIMITS.FILE_UNREADABLE,
          truncated: false,
          error: 'Invalid line range.'
        }
      }

      let startIdx = Math.max(0, start - 1)
      let endIdx = Math.min(lines.length, end)
      if (!range[2]) {
        // If single line is requested, give 50 lines before and after for context
        startIdx = Math.max(0, startIdx - 50)
        endIdx = Math.min(lines.length, startIdx + 100)
      }
      const requestedEndIdx = endIdx
      endIdx = Math.min(endIdx, startIdx + REVIEW_INPUT_LIMITS.MAX_REQUESTED_CONTEXT_LINES)
      // Prepend line numbers so Critic knows exactly where they are
      const content = lines
        .slice(startIdx, endIdx)
        .map((l, i) => `${startIdx + i + 1} | ${l}`)
        .join('\n')
      return { path: filePath, content, truncated: endIdx < requestedEndIdx }
    }

    const content = lines.slice(0, maxLines).join('\n')
    const truncated = lines.length > maxLines
    return { path: filePath, content, truncated }
  } catch {
    return {
      path: filePath,
      content: CONTEXT_LIMITS.FILE_UNREADABLE,
      truncated: false,
      error: 'File could not be read.'
    }
  }
}

export async function readRequestedFiles(
  workspaceRoot: string,
  response: string
): Promise<{ semanticDiff: string; filesAnalyzed: number }> {
  const requests = parseRequestsFromResponse(response)
  if (requests.length > SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT) {
    throw new Error(`Critic requested more than ${SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT} files.`)
  }

  const uniqueRequests = [
    ...new Map(requests.map(request => [`${request.filePath}:${request.lineRange ?? ''}`, request])).values()
  ]
  const blocks: string[] = []
  const files = new Set<string>()
  let totalChars = 0

  for (const request of uniqueRequests) {
    if (request.filePath.length > REVIEW_INPUT_LIMITS.MAX_PATH_CHARS) {
      throw new Error(`Critic requested a path longer than ${REVIEW_INPUT_LIMITS.MAX_PATH_CHARS} characters.`)
    }

    const file = await readChangedFileContent(
      workspaceRoot,
      request.filePath,
      REVIEW_INPUT_LIMITS.MAX_REQUESTED_CONTEXT_LINES,
      request.lineRange
    )
    if (file.error) throw new Error(`Could not read requested file ${request.filePath}: ${file.error}`)

    const block = formatSemanticDiffFileBlock(request.filePath, file.content, file.truncated)
    const nextLength = totalChars + block.length
    if (nextLength > REVIEW_INPUT_LIMITS.MAX_SEMANTIC_DIFF_CHARS) {
      throw new Error(`Critic requested context exceeds ${REVIEW_INPUT_LIMITS.MAX_SEMANTIC_DIFF_CHARS} characters.`)
    }
    blocks.push(block)
    totalChars = nextLength
    files.add(request.filePath)
  }

  return {
    semanticDiff: blocks.join(SEMANTIC_DIFF_PAYLOAD_MARKERS.FILE_BLOCK_SEPARATOR),
    filesAnalyzed: files.size
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

async function addExpandedFileToContents(
  workspaceRoot: string,
  expandedFile: string,
  contents: FileContent[],
  totalTokens: { value: number },
  maxTokens: number
): Promise<boolean> {
  if (totalTokens.value >= maxTokens) return true

  const expandedContent = await readChangedFileContent(
    workspaceRoot,
    expandedFile,
    CONTEXT_LIMITS.TRUNCATED_LINES_FALLBACK
  )
  const expandedTokens = estimateTokens(expandedContent.content)
  if (totalTokens.value + expandedTokens <= maxTokens) {
    contents.push(expandedContent)
    totalTokens.value += expandedTokens
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
    for (const expandedFile of expandedFiles) {
      if (totalTokens.value >= maxTokens) {
        budgetExceeded = true
        break
      }
      if (await addExpandedFileToContents(workspaceRoot, expandedFile, contents, totalTokens, maxTokens)) {
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
