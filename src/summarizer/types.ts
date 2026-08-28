/**
 * Smart Summarizer types.
 */

export type ParseMode = 'unified' | 'fallback' | 'fallback_paths'

export interface ParsedSemanticDiff {
  filesChanged: string[]
  additions: number
  removals: number
  parseMode: ParseMode
}

export interface ParsedDependencyList {
  dependencies: string[]
  devDependencies: string[]
  added: string[]
  removed: string[]
  parseMode: 'package-json' | 'diff' | 'fallback'
}

export interface ProjectBlueprint {
  framework: string
  structures: string[]
  features: string[]
}

export interface CriticalSnippets {
  auth: string[]
  db: string[]
  api: string[]
}
