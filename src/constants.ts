/**
 * Central config and constants. No magic strings.
 * Single Source of Truth for env keys, paths, server identity.
 */

import { readFileSync } from 'node:fs'

export const SERVER_NAME = 'vibe-gate' as const

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
export const SERVER_VERSION = packageJson.version

/** Environment variable keys */
export const ENV_KEYS = {
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  GOOGLE_GENERATIVE_AI_API_KEY: 'GOOGLE_GENERATIVE_AI_API_KEY',
  MINIMAX_API_KEY: 'MINIMAX_API_KEY',
  OPENCODE_API_KEY: 'OPENCODE_API_KEY',
  OPENCODE_PLAN: 'OPENCODE_PLAN',
  CRITIC_PROVIDER: 'CRITIC_PROVIDER',
  CRITIC_MODEL: 'CRITIC_MODEL',
  CRITIC_PERSONA: 'CRITIC_PERSONA',
  DEBUG: 'DEBUG',
  VIBE_WORKSPACE_ROOT: 'VIBE_WORKSPACE_ROOT',
  VIBE_HUMAN_CONFIRMATION_TOKEN: 'VIBE_HUMAN_CONFIRMATION_TOKEN'
} as const

/** preferences.log entry format: [ISO8601] caseId=X decision=Y rationale=Z */
export const PREFERENCES_LOG_FORMAT = {
  TEMPLATE: (timestamp: string, caseId: string, decision: string, rationale: string) =>
    `[${timestamp}] caseId=${caseId} decision=${decision} rationale=${rationale}\n`
} as const

/** Supported LLM providers */
export const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  MINIMAX: 'minimax',
  OPENCODE: 'opencode'
} as const

export type ProviderId = (typeof PROVIDERS)[keyof typeof PROVIDERS]

/** MiniMax direct API model IDs (PascalCase) — @see https://platform.minimax.io/docs/guides/text-generation */
export const MINIMAX_MODELS = {
  M3: 'MiniMax-M3',
  M2_7: 'MiniMax-M2.7',
  M2_5: 'MiniMax-M2.5'
} as const

/**
 * OpenCode Zen canonical model IDs (lowercase kebab-case).
 * Source: https://opencode.ai/zen/v1/models
 */
export const OPENCODE_ZEN_MODELS = {
  GPT_5_4: 'gpt-5.4',
  GPT_5_4_PRO: 'gpt-5.4-pro',
  CLAUDE_SONNET_4_6: 'claude-sonnet-4-6',
  QWEN_3_6_PLUS: 'qwen3.6-plus',
  GEMINI_3_1_PRO: 'gemini-3.1-pro',
  GEMINI_3_FLASH: 'gemini-3-flash',
  MINIMAX_M3: 'minimax-m3',
  MINIMAX_M2_7: 'minimax-m2.7',
  MINIMAX_M2_5: 'minimax-m2.5',
  DEEPSEEK_V4_PRO: 'deepseek-v4-pro',
  KIMI_K2_5: 'kimi-k2.5'
} as const

/** Maps display/provider model IDs to OpenCode Zen canonical IDs */
export const OPENCODE_ZEN_MODEL_ALIASES: Readonly<Record<string, string>> = {
  [MINIMAX_MODELS.M3]: OPENCODE_ZEN_MODELS.MINIMAX_M3,
  [MINIMAX_MODELS.M2_7]: OPENCODE_ZEN_MODELS.MINIMAX_M2_7,
  [MINIMAX_MODELS.M2_5]: OPENCODE_ZEN_MODELS.MINIMAX_M2_5
}

/** Default model per provider */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  [PROVIDERS.OPENAI]: 'gpt-5.4',
  [PROVIDERS.ANTHROPIC]: 'claude-4.6-sonnet',
  [PROVIDERS.GOOGLE]: 'gemini-3.1-pro',
  [PROVIDERS.MINIMAX]: MINIMAX_MODELS.M3,
  [PROVIDERS.OPENCODE]: OPENCODE_ZEN_MODELS.MINIMAX_M3
} as const

/** OpenCode subscription plans — @see https://opencode.ai/docs/zen/ and /docs/go/ */
export const OPENCODE_PLANS = {
  ZEN: 'zen',
  GO: 'go'
} as const

export type OpenCodePlanId = (typeof OPENCODE_PLANS)[keyof typeof OPENCODE_PLANS]

/** OpenCode model ID namespaces (opencode/gpt-5.4, opencode-go/minimax-m3) */
export const OPENCODE_MODEL_NAMESPACE = 'opencode' as const
export const OPENCODE_GO_MODEL_NAMESPACE = 'opencode-go' as const
export const OPENCODE_MODEL_NAMESPACE_PREFIX = `${OPENCODE_MODEL_NAMESPACE}/` as const
export const OPENCODE_GO_MODEL_NAMESPACE_PREFIX = `${OPENCODE_GO_MODEL_NAMESPACE}/` as const
export const OPENCODE_MODEL_NAMESPACE_REGEX = new RegExp(
  `^(${OPENCODE_MODEL_NAMESPACE}|${OPENCODE_GO_MODEL_NAMESPACE})/`,
  'i'
)

export const OPENCODE_ENDPOINT_KINDS = {
  ANTHROPIC: 'anthropic',
  RESPONSES: 'responses',
  CHAT: 'chat',
  GEMINI: 'gemini'
} as const

export type OpenCodeEndpointKind = (typeof OPENCODE_ENDPOINT_KINDS)[keyof typeof OPENCODE_ENDPOINT_KINDS]

/** Model family prefixes for Zen endpoint routing */
export const OPENCODE_MODEL_FAMILIES = {
  GPT: 'gpt-',
  CLAUDE: 'claude-',
  QWEN: 'qwen',
  GEMINI: 'gemini-',
  MINIMAX: 'minimax-'
} as const

/** Routing table: model prefix → Zen API family */
export const OPENCODE_ENDPOINT_ROUTING: ReadonlyArray<{
  kind: OpenCodeEndpointKind
  prefixes: readonly string[]
}> = [
  { kind: OPENCODE_ENDPOINT_KINDS.RESPONSES, prefixes: [OPENCODE_MODEL_FAMILIES.GPT] },
  {
    kind: OPENCODE_ENDPOINT_KINDS.ANTHROPIC,
    prefixes: [OPENCODE_MODEL_FAMILIES.CLAUDE, OPENCODE_MODEL_FAMILIES.QWEN]
  },
  { kind: OPENCODE_ENDPOINT_KINDS.GEMINI, prefixes: [OPENCODE_MODEL_FAMILIES.GEMINI] }
] as const

/** Routing table: model prefix → Go API family — @see https://opencode.ai/docs/go/ */
export const OPENCODE_GO_ENDPOINT_ROUTING: ReadonlyArray<{
  kind: OpenCodeEndpointKind
  prefixes: readonly string[]
}> = [
  {
    kind: OPENCODE_ENDPOINT_KINDS.RESPONSES,
    prefixes: [OPENCODE_MODEL_FAMILIES.GPT]
  },
  {
    kind: OPENCODE_ENDPOINT_KINDS.ANTHROPIC,
    prefixes: [OPENCODE_MODEL_FAMILIES.MINIMAX, OPENCODE_MODEL_FAMILIES.QWEN]
  }
] as const

/** Representative Zen model IDs per endpoint family (routing tests) */
export const OPENCODE_ZEN_SAMPLE_MODELS = {
  GPT: OPENCODE_ZEN_MODELS.GPT_5_4,
  GPT_PRO: OPENCODE_ZEN_MODELS.GPT_5_4_PRO,
  CLAUDE: OPENCODE_ZEN_MODELS.CLAUDE_SONNET_4_6,
  QWEN: OPENCODE_ZEN_MODELS.QWEN_3_6_PLUS,
  GEMINI: OPENCODE_ZEN_MODELS.GEMINI_3_1_PRO,
  GEMINI_FLASH: OPENCODE_ZEN_MODELS.GEMINI_3_FLASH,
  MINIMAX: OPENCODE_ZEN_MODELS.MINIMAX_M3,
  DEEPSEEK: OPENCODE_ZEN_MODELS.DEEPSEEK_V4_PRO,
  KIMI: OPENCODE_ZEN_MODELS.KIMI_K2_5
} as const

export const OPENCODE_ZEN = {
  BASE_URL: 'https://opencode.ai/zen/v1',
  ANTHROPIC_BASE_URL: 'https://opencode.ai/zen',
  PATHS: {
    RESPONSES: 'responses',
    MODELS: 'models',
    GEMINI_GENERATE_ACTION: 'generateContent'
  }
} as const

export const OPENCODE_ZEN_URLS = {
  RESPONSES: `${OPENCODE_ZEN.BASE_URL}/${OPENCODE_ZEN.PATHS.RESPONSES}`,
  MODELS_LIST: `${OPENCODE_ZEN.BASE_URL}/${OPENCODE_ZEN.PATHS.MODELS}`
} as const

/** Default timeout for external fetch calls in OpenCode API integrations (30 seconds) */
export const OPENCODE_FETCH_TIMEOUT_MS = 30_000

/** OpenCode Go gateway — @see https://opencode.ai/docs/go/ */
export const OPENCODE_GO = {
  BASE_URL: 'https://opencode.ai/zen/go/v1',
  ANTHROPIC_BASE_URL: 'https://opencode.ai/zen/go',
  PATHS: {
    RESPONSES: 'responses',
    MODELS: 'models'
  }
} as const

export const OPENCODE_GO_URLS = {
  RESPONSES: `${OPENCODE_GO.BASE_URL}/${OPENCODE_GO.PATHS.RESPONSES}`,
  MODELS_LIST: `${OPENCODE_GO.BASE_URL}/${OPENCODE_GO.PATHS.MODELS}`
} as const

/** Persona identifiers */
export const PERSONAS = {
  SECURITY_FIRST: 'security-first',
  PERFORMANCE_FREAK: 'performance-freak',
  CLEAN_CODE_MONK: 'clean-code-monk'
} as const

export type PersonaId = (typeof PERSONAS)[keyof typeof PERSONAS]

/** Project paths (relative to workspace) */
export const PATHS = {
  VIBE_DIR: '.vibe',
  VIBE_STATUS: '.vibe/status.json',
  VIBE_REVIEW_SESSION: '.vibe/review-session.json',
  VIBE_ROADMAP: '.vibe/ROADMAP.md',
  DOCS_ROADMAP: 'docs/ROADMAP.md',
  VIBE_CASES_DIR: '.vibe/cases',
  RULES_JSON: 'rules.json',
  DEBT_MD: 'DEBT.md',
  PREFERENCES_LOG: '.vibe/preferences.log',
  PACKAGE_JSON: 'package.json'
} as const

/** Judge decision values (log_human_decision, DATA-001) */
export const JUDGE_DECISIONS = {
  ACCEPT_IMPLEMENTER: 'ACCEPT_IMPLEMENTER',
  ACCEPT_CRITIC: 'ACCEPT_CRITIC',
  CUSTOM: 'CUSTOM'
} as const

export type JudgeDecisionId = (typeof JUDGE_DECISIONS)[keyof typeof JUDGE_DECISIONS]

/** Critic verdicts (from VIBE-GATE.md) */
export const CRITIC_VERDICTS = {
  ACCEPT: 'ACCEPT',
  REJECT: 'REJECT',
  BLOCK: 'BLOCK',
  DEBT: 'DEBT',
  CONCERNS_ADDRESSED: 'CONCERNS_ADDRESSED',
  LOW_QUALITY: 'LOW_QUALITY',
  INSUFFICIENT_REVIEW: 'INSUFFICIENT_REVIEW',
  FIX_SUBMITTED: 'FIX_SUBMITTED'
} as const

export type Verdict = (typeof CRITIC_VERDICTS)[keyof typeof CRITIC_VERDICTS]

/**
 * Verdict tokens allowed on a structured `VERDICT:` line.
 * Internal statuses (INSUFFICIENT_REVIEW, FIX_SUBMITTED) are never parsed from Critic prose.
 */
export const STRUCTURED_CRITIC_VERDICT_TOKENS = [
  CRITIC_VERDICTS.ACCEPT,
  CRITIC_VERDICTS.REJECT,
  CRITIC_VERDICTS.BLOCK,
  CRITIC_VERDICTS.DEBT,
  CRITIC_VERDICTS.CONCERNS_ADDRESSED,
  CRITIC_VERDICTS.LOW_QUALITY
] as const

/**
 * Match `VERDICT: ACCEPT` (etc.) lines only — last match wins.
 * Do NOT use leftmost free-prose `\bACCEPT|REJECT\b` (false positives on "reject invalid input").
 */
export const STRUCTURED_VERDICT_LINE_REGEX = new RegExp(
  String.raw`(?:^|\n)\s*VERDICT:\s*(${STRUCTURED_CRITIC_VERDICT_TOKENS.join('|')})\s*(?=\n|$)`,
  'gi'
)

/** Env key: when set, log_human_decision requires matching confirmationToken (human-only unlock). */
export const ENV_VIBE_HUMAN_CONFIRMATION_TOKEN = ENV_KEYS.VIBE_HUMAN_CONFIRMATION_TOKEN

/** Concern severity levels */
export const SEVERITY = {
  BLOCKING: 'blocking',
  WARNING: 'warning',
  INFO: 'info',
  CRITICAL: 'critical'
} as const

export type Severity = (typeof SEVERITY)[keyof typeof SEVERITY]

/** Conflict loop */
export const CONFLICT_LOOP = {
  MAX_ROUNDS: 3,
  DEADLOCK: 'DEADLOCK'
} as const

/** Error messages (SSoT) */
export const ERROR_MESSAGES = {
  NO_LLM_PROVIDER: 'No LLM provider available. Set CRITIC_PROVIDER and the corresponding API key.',
  STARTUP_FAILED: 'Vibe-Gate failed to start:'
} as const

/** Debug log prefix (stderr) */
export const DEBUG_LOG_PREFIX = '[vibe-gate]'

/** Package.json diff line prefix (parse-dependency-list) */
export const DIFF_DEP_PREFIXES = {
  ADD: '+',
  REMOVE: '-'
} as const

/** Regex for package.json diff line: +/- "pkg": "ver" (ReDoS-safe: no greedy .*) */
export const DEP_LINE_REGEX = /^[+-]\s*"([^"]+)":\s*"[^"]*"/

/** Regex to extract phase ID from ROADMAP.md [x] lines (ReDoS-safe: \D* before digits) */
export const PHASE_ID_REGEX = /\[x\]\D*(\d+\.\d+(?:\.\d+)?)/g

/** Success messages (SSoT, English per VIBE-GATE.md) */
export const SUCCESS_MESSAGES = {
  DECISION_LOGGED: 'Decision logged to preferences.log'
} as const

/** Unified diff markers (for parse-semantic-diff) */
export const DIFF_MARKERS = {
  OLD_FILE: '--- ',
  NEW_FILE: '+++ ',
  HUNK_HEADER: '@@',
  DEV_NULL: '/dev/null'
} as const

/** Dependency checker thresholds */
export const DEPENDENCY_THRESHOLDS = {
  BLOAT_WARNING_NEW_PACKAGES: 5,
  BLOAT_WARNING_TOTAL_DEPS: 50
} as const

/** Framework detection keys (package.json, config files) */
export const FRAMEWORK_INDICATORS = {
  NUXT: 'nuxt',
  NEXT: 'next',
  VITE: 'vite',
  EXPRESS: 'express',
  NEST: 'nest',
  VUE: 'vue',
  REACT: 'react',
  UNKNOWN: 'unknown'
} as const

/** package.json keys to exclude from dependency diff (not actual deps) */
export const PACKAGE_JSON_NON_DEP_KEYS = ['packageManager', 'name', 'version'] as const

/** Set of package.json keys that are not actual deps (for diff filtering) */
export const PACKAGE_JSON_NON_DEP_SET = new Set<string>(PACKAGE_JSON_NON_DEP_KEYS)

/** package.json keys that contain dependency lists (for diff detection) */
export const PACKAGE_JSON_DEP_KEYS = ['dependencies', 'devDependencies'] as const

/** MCP tool identifiers */
export const MCP_TOOL_NAMES = {
  SUBMIT_PHASE_REVIEW: 'submit_phase_review',
  LOG_HUMAN_DECISION: 'log_human_decision'
} as const

/** submit_phase_review: optional file-based semanticDiff (see resolve-semantic-diff-from-path.ts) */
export const SEMANTIC_DIFF_FILE = {
  /** Max on-disk size before read (bytes). Full file is read into memory at most once. */
  MAX_BYTES: 5 * 1024 * 1024,
  /**
   * Soft advisory only: if a FILE:…CONTENT: block exceeds this line count, responses may include semanticDiffHints.
   * Does not reject or truncate; projects may define stricter limits in their own docs.
   */
  SOFT_WARN_LINES_PER_FILE_BLOCK: 500,
  /**
   * If zero FILE: blocks parse but the string is at least this long, emit a format hint (avoids silent huge mispastes).
   */
  HINT_MIN_CHARS_WHEN_NO_FILE_BLOCKS_PARSED: 80_000
} as const

/** Markers for FILE:…CONTENT: payload blocks (SSoT — builders and parsers must use these). */
export const SEMANTIC_DIFF_PAYLOAD_MARKERS = {
  FILE_LINE_PREFIX: 'FILE: ',
  CONTENT_LINE: 'CONTENT:',
  FILE_BLOCK_SEPARATOR: '\n\n'
} as const

/**
 * Preferred `submit_phase_review.files` limits (workspace-relative source paths).
 * Aligns with consumer docs (~10 files per review batch).
 */
export const SEMANTIC_DIFF_SOURCE_FILES = {
  MAX_COUNT: 10,
  MAX_BYTES_PER_FILE: 1 * 1024 * 1024,
  MAX_TOTAL_BYTES: 5 * 1024 * 1024
} as const

/**
 * Status.json write policy on ACCEPT.
 * Probe phaseIds must not pollute consumer `.vibe/status.json` unless updateStatus:true.
 */
export const PHASE_STATUS_POLICY = {
  SKIP_STATUS_PREFIXES: ['mcp-smoke-', 'vibe-gate-probe-'] as const
} as const

/** Labels used in path-resolution error messages (no magic strings in utils). */
export const WORKSPACE_PATH_KIND = {
  SEMANTIC_DIFF_PAYLOAD: 'semanticDiffPath',
  SOURCE_FILE: 'files entry'
} as const

/** Case file party labels (deadlock output) */
export const CASE_PARTIES = {
  IMPLEMENTER: 'IDE AI',
  CRITIC: 'Vibe-Gate Critic'
} as const

/** Critical snippet patterns (file path / content) */
export const CRITICAL_PATTERNS = {
  AUTH: ['auth', 'login', 'session', 'token', 'jwt', 'oauth'],
  DB: ['prisma', 'schema', 'migrate', 'database', 'model'],
  API: ['api', 'route', 'handler', 'endpoint', 'server']
} as const

/** DEBT.md format (English per VIBE-GATE.md user output policy) */
export const DEBT = {
  SECTION_MARKER: '## Records',
  EMPTY_PLACEHOLDER: '_(No entries yet)_',
  /** Template placeholders: {{DATE}}, {{SUBJECT}}, {{PHASE}}, {{RATIONALE}}. Output: ### YYYY-MM-DD - Subject */
  ENTRY_TEMPLATE: `
### {{DATE}} - {{SUBJECT}}

- **Phase:** {{PHASE}}
- **Rationale:** {{RATIONALE}}
- **Status:** Open
`
} as const

/** Directories to skip when scanning for critical snippets */
export const SCAN_IGNORE_DIRS = ['node_modules', '.git', 'dist', '.vibe', '.yarn'] as const

/** Max number of critical files to include per category (Auth, DB, API) */
export const MAX_CRITICAL_FILES_PER_CATEGORY = 10

/** Max lines of code to include per critical snippet (for Critic context) */
export const SNIPPET_MAX_LINES = 30

/** Max top-level dirs to list when framework unknown (blueprint structures) */
export const BLUEPRINT_MAX_TOP_LEVEL_DIRS = 10

/** ISO8601 date slice end for YYYY-MM-DD (e.g. new Date().toISOString().slice(0, N)) */
export const ISO_DATE_SLICE_END = 10

/** LLM max completion tokens (Anthropic, OpenAI, etc.) */
export const LLM_MAX_TOKENS = 16384

/** Default round when not specified */
export const DEFAULT_ROUND = 1

/** Placeholder for empty/none values in prompts */
export const NONE_PLACEHOLDER = 'none'

/** JSON indent spaces for pretty-print */
export const JSON_INDENT_SPACES = 2

/** Case file messages (deadlock output) */
export const CASE_FILE_MESSAGES = {
  DEADLOCK_SUMMARY: 'Agreement not reached after maximum debate rounds.',
  NEXT_ROUND_TEMPLATE: (round: number) =>
    `Round ${round} complete. Implementer may fix and resubmit for round ${round + 1}.`
} as const

/** Bloat warning (dependency checker) */
export const BLOAT_WARNING_MESSAGE = 'BLOAT WARNING: Consider bundle size and known CVEs for new packages.'

/** Critical snippets prompt prefix */
export const CRITICAL_AREAS_PREFIX = 'Critical areas - '

/** Snippet separator in format-critical-snippets */
export const SNIPPET_SEPARATOR = '\n---\n'

/** Critical snippet category labels (for format-critical-snippets) */
export const CRITICAL_LABELS = {
  AUTH: 'Auth',
  DB: 'DB',
  API: 'API',
  NONE: 'none',
  UNREADABLE: '(unreadable)'
} as const

/** Scan ignore dirs as Set for O(1) lookup (DRY, SSoT) */
export const SCAN_IGNORE_SET = new Set<string>(SCAN_IGNORE_DIRS)

/** Rule categories (rules.json schema) */
export const RULE_CATEGORIES = [
  'security',
  'architecture',
  'data-integrity',
  'style',
  'refactoring',
  'performance'
] as const

/** Rule ID pattern (e.g. SEC-1, ARCH-2) */
export const RULE_ID_REGEX = /^[A-Z]+-\d+$/

/** RegExp special chars to escape (ReDoS-safe: no regex, use includes) */
export const REGEX_SPECIAL_CHARS_STR = String.raw`.*+?^+{}()|[\]\\`

/** Empty parsed semantic diff (fallback) */
export const EMPTY_SEMANTIC_DIFF = {
  filesChanged: [] as string[],
  additions: 0,
  removals: 0,
  parseMode: 'fallback' as const
} as const

/**
 * Plain-text semantic diff fallback: file extensions scanned for path extraction.
 * Used when input is not unified diff (no ---/+++ headers).
 */
export const SEMANTIC_DIFF_FALLBACK_FILE_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'vue',
  'prisma',
  'json',
  'md',
  'html',
  'css',
  'scss',
  'sass',
  'less'
] as const

/** Unified diff regex patterns (parse-semantic-diff) */
export const DIFF_REGEXES = {
  OLD_FILE: /^--- (?:a\/)?(.+)$/m,
  NEW_FILE: /^\+\+\+ (?:b\/)?(.+)$/m,
  ADDITION_LINE: /^\+[^+]/m,
  REMOVAL_LINE: /^-[^-]/m
} as const

/** Framework detection: package.json dep name → framework id */
export const FRAMEWORK_DEPS: Record<string, string> = {
  nuxt: FRAMEWORK_INDICATORS.NUXT,
  next: FRAMEWORK_INDICATORS.NEXT,
  vite: FRAMEWORK_INDICATORS.VITE,
  express: FRAMEWORK_INDICATORS.EXPRESS,
  '@nestjs/core': FRAMEWORK_INDICATORS.NEST,
  vue: FRAMEWORK_INDICATORS.VUE,
  react: FRAMEWORK_INDICATORS.REACT
}

/** Framework structure dirs/config (per framework) */
export const FRAMEWORK_STRUCTURES: Record<string, string[]> = {
  [FRAMEWORK_INDICATORS.NUXT]: ['pages/', 'components/', 'server/api/', 'nuxt.config'],
  [FRAMEWORK_INDICATORS.NEXT]: ['pages/', 'app/', 'components/', 'next.config'],
  [FRAMEWORK_INDICATORS.VITE]: ['src/', 'vite.config'],
  [FRAMEWORK_INDICATORS.EXPRESS]: ['routes/', 'middleware/', 'app.js'],
  [FRAMEWORK_INDICATORS.NEST]: ['src/', 'nest-cli.json'],
  [FRAMEWORK_INDICATORS.VUE]: ['src/', 'components/'],
  [FRAMEWORK_INDICATORS.REACT]: ['src/', 'components/']
}

/** Token estimation */
export const TOKEN_ESTIMATION = {
  CHARS_PER_TOKEN: 4,
  SAFETY_MARGIN: 10_000,
  RESPONSE_RESERVE: 4_096,
  EFFECTIVE_CONTEXT_FACTOR: 0.75
} as const

/** Context management */
export const CONTEXT_LIMITS = {
  MAX_LINES_PER_FILE: 30,
  MAX_CHARS_PER_FILE: 500,
  MAX_PREFERENCES_ENTRIES: 10,
  MAX_PREFERENCES_CHARS: 2000,
  TRUNCATED_LINES_FALLBACK: 20,
  FILE_UNREADABLE: '(unreadable)',
  BUDGET_EXCEEDED_MSG: '(Budget exceeded - file contents truncated. Ask for specific files if needed.)',
  MAX_EXPANDED_FILES: 15,
  IMPORT_EXPANSION_ENABLED: false
} as const

/** Provider context windows (realistic production values) */
export const CONTEXT_WINDOWS: Record<ProviderId, number> = {
  [PROVIDERS.OPENAI]: 400_000,
  [PROVIDERS.ANTHROPIC]: 200_000,
  [PROVIDERS.GOOGLE]: 2_000_000,
  [PROVIDERS.MINIMAX]: 272_000,
  [PROVIDERS.OPENCODE]: 200_000
} as const

/** Max context windows (theoretical / beta) */
export const MAX_CONTEXT_WINDOWS: Record<ProviderId, number> = {
  [PROVIDERS.OPENAI]: 1_000_000,
  [PROVIDERS.ANTHROPIC]: 1_000_000,
  [PROVIDERS.GOOGLE]: 2_000_000,
  [PROVIDERS.MINIMAX]: 1_000_000,
  [PROVIDERS.OPENCODE]: 1_000_000
} as const

/** Critic V2 thresholds */
export const CRITIC_THRESHOLDS = {
  MIN_TOKENS_ACCEPT: 50,
  MIN_TOKENS_DEBT: 30,
  DEBT_LOG_ROUND_REQUIRED: 2,
  HISTORY_SUMMARY_MAX_TOKENS: 32000
} as const

/** Critic response block prefixes (SSoT for parsing) */
export const RESPONSE_BLOCKS = {
  REQUEST: 'REQUEST:',
  CONCERN: 'CONCERN:',
  VERIFIED: 'VERIFIED:',
  NOT_VERIFIED: 'NOT_VERIFIED:'
} as const

/**
 * Concern review status tri-state.
 * - PENDING: Not yet evaluated by Critic
 * - REVIEWED_VALID: Critic confirmed real issue (was VERIFIED in response)
 * - REVIEWED_INVALID: Critic determined not applicable (was NOT_VERIFIED in response)
 */
export const CONCERN_REVIEW_STATUS = {
  PENDING: 'PENDING',
  REVIEWED_VALID: 'REVIEWED_VALID',
  REVIEWED_INVALID: 'REVIEWED_INVALID'
} as const
