/**
 * Build FILE:…CONTENT: semanticDiff from workspace-relative source file paths.
 * Preferred MCP input for IDE agents (tiny tool call; server reads disk).
 */

import { readFile, stat } from 'node:fs/promises'
import { SEMANTIC_DIFF_PAYLOAD_MARKERS, SEMANTIC_DIFF_SOURCE_FILES, WORKSPACE_PATH_KIND } from '@/constants'
import {
  resolveSafePathInWorkspace,
  verifyCanonicalPathUnderWorkspace,
  type ResolveSemanticDiffErrorCode
} from '@/utils/resolve-semantic-diff-from-path'

export type BuildSemanticDiffFromFilesErrorCode =
  | 'EMPTY_FILES'
  | 'TOO_MANY_FILES'
  | 'EMPTY_PATH'
  | 'ABSOLUTE_PATH_FORBIDDEN'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_READABLE'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_TOO_LARGE'
  | 'REALPATH_FAILED'
  | 'EMPTY_FILE_CONTENT'

export type BuildSemanticDiffFromFilesResult =
  | { ok: true; semanticDiff: string; filesLoaded: string[] }
  | { ok: false; code: BuildSemanticDiffFromFilesErrorCode; message: string }

const PATH_RESOLVE_CODES = new Set<ResolveSemanticDiffErrorCode>([
  'EMPTY_PATH',
  'ABSOLUTE_PATH_FORBIDDEN',
  'PATH_OUTSIDE_WORKSPACE',
  'FILE_NOT_FOUND',
  'FILE_NOT_READABLE',
  'FILE_TOO_LARGE',
  'REALPATH_FAILED'
])

function mapPathError(code: ResolveSemanticDiffErrorCode, message: string): BuildSemanticDiffFromFilesResult {
  if (!PATH_RESOLVE_CODES.has(code)) {
    return { ok: false, code: 'PATH_OUTSIDE_WORKSPACE', message }
  }
  return { ok: false, code: code as BuildSemanticDiffFromFilesErrorCode, message }
}

function formatFileBlock(relativePath: string, content: string): string {
  const body = content.endsWith('\n') ? content : `${content}\n`
  return `${SEMANTIC_DIFF_PAYLOAD_MARKERS.FILE_LINE_PREFIX}${relativePath}\n${SEMANTIC_DIFF_PAYLOAD_MARKERS.CONTENT_LINE}\n${body}`
}

function validateFilesArray(paths: string[]): BuildSemanticDiffFromFilesResult | null {
  if (paths.length === 0) {
    return {
      ok: false,
      code: 'EMPTY_FILES',
      message: 'files must be a non-empty array of workspace-relative paths.'
    }
  }
  if (paths.length > SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT) {
    return {
      ok: false,
      code: 'TOO_MANY_FILES',
      message: `files exceeds maximum of ${SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT} paths per review (got ${paths.length}).`
    }
  }
  return null
}

type FileMetaResult =
  | { ok: true; relativePath: string; absolutePath: string; size: number }
  | { ok: false; result: BuildSemanticDiffFromFilesResult }

async function checkFileMeta(workspaceRoot: string, relativePath: string): Promise<FileMetaResult> {
  const pathResult = resolveSafePathInWorkspace(workspaceRoot, relativePath, WORKSPACE_PATH_KIND.SOURCE_FILE)
  if (!pathResult.ok) {
    return { ok: false, result: mapPathError(pathResult.code, pathResult.message) }
  }

  const absolutePath = pathResult.absolutePath

  const [statResult, canonicalResult] = await Promise.allSettled([
    stat(absolutePath),
    verifyCanonicalPathUnderWorkspace(workspaceRoot, absolutePath, WORKSPACE_PATH_KIND.SOURCE_FILE)
  ])

  if (statResult.status === 'rejected') {
    return {
      ok: false,
      result: {
        ok: false,
        code: 'FILE_NOT_FOUND',
        message: `${WORKSPACE_PATH_KIND.SOURCE_FILE}: file not found or inaccessible: ${relativePath}`
      }
    }
  }
  const st = statResult.value
  if (!st.isFile()) {
    return {
      ok: false,
      result: {
        ok: false,
        code: 'FILE_NOT_FOUND',
        message: `${WORKSPACE_PATH_KIND.SOURCE_FILE}: not a regular file: ${relativePath}`
      }
    }
  }
  if (st.size > SEMANTIC_DIFF_SOURCE_FILES.MAX_BYTES_PER_FILE) {
    return {
      ok: false,
      result: {
        ok: false,
        code: 'FILE_TOO_LARGE',
        message: `${WORKSPACE_PATH_KIND.SOURCE_FILE}: file exceeds maximum size (${SEMANTIC_DIFF_SOURCE_FILES.MAX_BYTES_PER_FILE} bytes): ${relativePath}`
      }
    }
  }

  if (canonicalResult.status === 'rejected') {
    return {
      ok: false,
      result: mapPathError(
        'REALPATH_FAILED',
        `${WORKSPACE_PATH_KIND.SOURCE_FILE}: could not resolve canonical paths for workspace or file.`
      )
    }
  }
  if (!canonicalResult.value.ok) {
    return { ok: false, result: mapPathError(canonicalResult.value.code, canonicalResult.value.message) }
  }

  return { ok: true, relativePath, absolutePath, size: st.size }
}

async function readFileContent(
  absolutePath: string,
  relativePath: string
): Promise<{ ok: true; content: string } | { ok: false; result: BuildSemanticDiffFromFilesResult }> {
  let content: string
  try {
    content = await readFile(absolutePath, 'utf8')
  } catch {
    return {
      ok: false,
      result: {
        ok: false,
        code: 'FILE_NOT_READABLE',
        message: `${WORKSPACE_PATH_KIND.SOURCE_FILE}: could not read file: ${relativePath}`
      }
    }
  }
  if (!content.trim()) {
    return {
      ok: false,
      result: {
        ok: false,
        code: 'EMPTY_FILE_CONTENT',
        message: `${WORKSPACE_PATH_KIND.SOURCE_FILE}: file is empty: ${relativePath}`
      }
    }
  }
  return { ok: true, content }
}

export async function buildSemanticDiffFromSourceFiles(
  workspaceRoot: string,
  relativePaths: string[]
): Promise<BuildSemanticDiffFromFilesResult> {
  const paths = relativePaths.map(p => p.trim()).filter(Boolean)
  const arrayError = validateFilesArray(paths)
  if (arrayError) return arrayError

  // Stage 1: Lightweight metadata checks (stat, canonical path) for all files
  const metaResults = await Promise.all(paths.map(relativePath => checkFileMeta(workspaceRoot, relativePath)))

  let totalBytes = 0
  const validFiles: Array<{ relativePath: string; absolutePath: string }> = []

  for (const meta of metaResults) {
    if (!meta.ok) return meta.result

    totalBytes += meta.size
    if (totalBytes > SEMANTIC_DIFF_SOURCE_FILES.MAX_TOTAL_BYTES) {
      return {
        ok: false,
        code: 'TOTAL_TOO_LARGE',
        message: `files total size exceeds maximum (${SEMANTIC_DIFF_SOURCE_FILES.MAX_TOTAL_BYTES} bytes).`
      }
    }

    validFiles.push({ relativePath: meta.relativePath, absolutePath: meta.absolutePath })
  }

  // Stage 2: Read file contents concurrently ONLY after ALL metadata & aggregate size checks pass
  const readResults = await Promise.all(validFiles.map(file => readFileContent(file.absolutePath, file.relativePath)))

  const blocks: string[] = []
  const filesLoaded: string[] = []

  for (let i = 0; i < readResults.length; i++) {
    const read = readResults[i]
    if (!read.ok) return read.result

    const file = validFiles[i]
    blocks.push(formatFileBlock(file.relativePath, read.content))
    filesLoaded.push(file.relativePath)
  }

  return {
    ok: true,
    semanticDiff: blocks.join(SEMANTIC_DIFF_PAYLOAD_MARKERS.FILE_BLOCK_SEPARATOR),
    filesLoaded
  }
}
