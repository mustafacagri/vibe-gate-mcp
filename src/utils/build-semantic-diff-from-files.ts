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

type ProcessSourceFileResult =
  | { ok: true; relativePath: string; size: number; content: string }
  | { ok: false; result: BuildSemanticDiffFromFilesResult }

async function processSourceFile(workspaceRoot: string, relativePath: string): Promise<ProcessSourceFileResult> {
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

  return { ok: true, relativePath, size: st.size, content }
}

export async function buildSemanticDiffFromSourceFiles(
  workspaceRoot: string,
  relativePaths: string[]
): Promise<BuildSemanticDiffFromFilesResult> {
  const paths = relativePaths.map(p => p.trim()).filter(Boolean)
  const arrayError = validateFilesArray(paths)
  if (arrayError) return arrayError

  const processed = await Promise.all(paths.map(relativePath => processSourceFile(workspaceRoot, relativePath)))

  const blocks: string[] = []
  const filesLoaded: string[] = []
  let totalBytes = 0

  for (const item of processed) {
    if (!item.ok) return item.result

    totalBytes += item.size
    if (totalBytes > SEMANTIC_DIFF_SOURCE_FILES.MAX_TOTAL_BYTES) {
      return {
        ok: false,
        code: 'TOTAL_TOO_LARGE',
        message: `files total size exceeds maximum (${SEMANTIC_DIFF_SOURCE_FILES.MAX_TOTAL_BYTES} bytes).`
      }
    }

    blocks.push(formatFileBlock(item.relativePath, item.content))
    filesLoaded.push(item.relativePath)
  }

  return {
    ok: true,
    semanticDiff: blocks.join(SEMANTIC_DIFF_PAYLOAD_MARKERS.FILE_BLOCK_SEPARATOR),
    filesLoaded
  }
}
