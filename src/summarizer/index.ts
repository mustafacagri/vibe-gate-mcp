/**
 * Smart Summarizer: parse IDE payloads for Critic context.
 */

export { parseSemanticDiff } from '@/summarizer/parse-semantic-diff'
export { parseDependencyListFromPackageJson, parseDependencyDiff } from '@/summarizer/parse-dependency-list'
export { extractProjectBlueprint } from '@/summarizer/extract-project-blueprint'
export { extractCriticalSnippets } from '@/summarizer/extract-critical-snippets'
export { formatCriticalSnippetsForPrompt } from '@/summarizer/format-critical-snippets'
export type {
  ParsedSemanticDiff,
  ParsedDependencyList,
  ProjectBlueprint,
  CriticalSnippets,
  ParseMode
} from '@/summarizer/types'
