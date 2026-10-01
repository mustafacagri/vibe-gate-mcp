/** Validate FILE/CONTENT framing; callers establish source identity and completeness. */
import { extname } from 'node:path'
import { REVIEW_INPUT_LIMITS, SEMANTIC_DIFF_PAYLOAD_MARKERS, SEMANTIC_DIFF_SOURCE_FILES } from '@/constants'

/** Data/document endpoints are never project source context, even when they contain snippets. */
const NON_SOURCE_EXTENSIONS = new Set(['.md', '.mdx', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml', '.lock'])
const ENV_FILE_PATTERN = /(?:^|[/\\])\.env(?:\.|$)/i
const FILE_HEADER_PATTERN = new RegExp(
  `^${SEMANTIC_DIFF_PAYLOAD_MARKERS.FILE_LINE_PREFIX.trimEnd()}([^\\r\\n]*)\\r?$`,
  'gm'
)
const CONTENT_HEADER_PATTERN = new RegExp(`^\\r?\\n${SEMANTIC_DIFF_PAYLOAD_MARKERS.CONTENT_LINE}\\r?\\n`)
const GIT_PATCH_HEADER_PATTERN = /^diff --git [^\r\n]+\r?\n/
const UNIFIED_PATCH_HEADERS_PATTERN = /^--- [^\r\n]+\r?\n\+\+\+ [^\r\n]+(?:\r?\n|$)/
const UNIFIED_PATCH_HUNK_PATTERN = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/
const FULL_SOURCE_PLACEHOLDER = '[FULL FILE CONTENT]'
const TRUNCATED_CONTEXT_TAIL_PATTERN = /(?:^|\r?\n)\[Context limited to \d+ lines\.\](?:\r?\n)?$/

function validateSourceBlock(path: string, block: string): void {
  if (!CONTENT_HEADER_PATTERN.test(block)) {
    throw new Error(`CONTENT: must immediately follow the FILE: line for source endpoint: ${path}`)
  }
  const body = block.replace(CONTENT_HEADER_PATTERN, '')
  const trimmedBody = body.trim()
  if (!trimmedBody) throw new Error(`Source endpoint has empty CONTENT: ${path}`)
  if (
    GIT_PATCH_HEADER_PATTERN.test(trimmedBody) ||
    UNIFIED_PATCH_HEADERS_PATTERN.test(trimmedBody) ||
    UNIFIED_PATCH_HUNK_PATTERN.test(trimmedBody) ||
    trimmedBody === FULL_SOURCE_PLACEHOLDER ||
    TRUNCATED_CONTEXT_TAIL_PATTERN.test(body)
  ) {
    throw new Error(`Source endpoint requires full source content, not a patch or placeholder: ${path}`)
  }
}

export function validateSourceCorpus(corpus: string): number {
  if (corpus.length > REVIEW_INPUT_LIMITS.MAX_SEMANTIC_DIFF_CHARS) {
    throw new Error(`Source payload exceeds ${REVIEW_INPUT_LIMITS.MAX_SEMANTIC_DIFF_CHARS} characters.`)
  }
  const headers = [...corpus.matchAll(FILE_HEADER_PATTERN)]
  if (headers.length === 0)
    throw new Error(
      'Source payload must contain complete FILE: / CONTENT: blocks; patches and summaries are unsupported.'
    )
  if (corpus.slice(0, headers[0].index).trim()) {
    throw new Error('Source payload must start with a FILE: / CONTENT: block.')
  }
  if (headers.length > SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT) {
    throw new Error(
      `Source payload exceeds maximum of ${SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT} full content slots (got ${headers.length}).`
    )
  }
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index]
    const path = header[1].trim()
    if (!header[0].startsWith(SEMANTIC_DIFF_PAYLOAD_MARKERS.FILE_LINE_PREFIX) || !path) {
      throw new Error('Source payload requires a non-empty path on each FILE: line.')
    }
    if (NON_SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) || ENV_FILE_PATTERN.test(path)) {
      throw new Error(`Non-source endpoint is not allowed in Critic context: ${path}`)
    }
    const block = corpus.slice(header.index + header[0].length, headers[index + 1]?.index)
    validateSourceBlock(path, block)
  }
  return headers.length
}
