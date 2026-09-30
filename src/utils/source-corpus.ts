/** Validate complete FILE/CONTENT carriers and count represented source endpoints. */
import { extname } from 'node:path'
import { REVIEW_INPUT_LIMITS, SEMANTIC_DIFF_PAYLOAD_MARKERS, SEMANTIC_DIFF_SOURCE_FILES } from '@/constants'

/** Data/document endpoints are never project source context, even when they contain snippets. */
const NON_SOURCE_EXTENSIONS = new Set(['.md', '.mdx', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml', '.lock'])
const ENV_FILE_PATTERN = /(?:^|[/\\])\.env(?:\.|$)/i
const FILE_HEADER_PATTERN = /^FILE: (.+)$/gm

export function validateSourceCorpus(corpus: string): number {
  if (corpus.length > REVIEW_INPUT_LIMITS.MAX_SEMANTIC_DIFF_CHARS) {
    throw new Error(`Source payload exceeds ${REVIEW_INPUT_LIMITS.MAX_SEMANTIC_DIFF_CHARS} characters.`)
  }
  const headers = [...corpus.matchAll(FILE_HEADER_PATTERN)]
  if (headers.length === 0)
    throw new Error(
      'Source payload must contain complete FILE: / CONTENT: blocks; patches and summaries are unsupported.'
    )
  if (headers.length > SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT) {
    throw new Error(
      `Source payload exceeds maximum of ${SEMANTIC_DIFF_SOURCE_FILES.MAX_COUNT} full content slots (got ${headers.length}).`
    )
  }
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index]
    const path = header[1].trim()
    if (NON_SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) || ENV_FILE_PATTERN.test(path)) {
      throw new Error(`Non-source endpoint is not allowed in Critic context: ${path}`)
    }
    const block = corpus.slice(header.index + header[0].length, headers[index + 1]?.index)
    if (!block.split('\n').some(line => line.trim() === SEMANTIC_DIFF_PAYLOAD_MARKERS.CONTENT_LINE)) {
      throw new Error(`Missing CONTENT: marker for source endpoint: ${path}`)
    }
  }
  return headers.length
}
