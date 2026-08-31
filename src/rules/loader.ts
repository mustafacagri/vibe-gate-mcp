/**
 * Load rules.json and inject into Critic prompt.
 * Validates against schema; returns defaults on parse/validation failure.
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { PATHS, RULE_ID_REGEX, RULE_CATEGORIES } from '@/constants'
import { RULES_PROMPTS } from '@/prompts'

export interface Rule {
  id: string
  description: string
  category: string
}

export interface RulesConfig {
  hardRules: Rule[]
  softRules: Rule[]
}

const ruleSchema = z.object({
  id: z.string().regex(RULE_ID_REGEX),
  description: z.string(),
  category: z.enum(RULE_CATEGORIES)
})

const rulesConfigSchema = z.object({
  hardRules: z.array(ruleSchema),
  softRules: z.array(ruleSchema)
})

const DEFAULT_RULES: RulesConfig = {
  hardRules: [],
  softRules: []
}

const MAX_RULES_FILE_BYTES = 1 * 1024 * 1024

export async function loadRules(workspaceRoot: string): Promise<RulesConfig> {
  const path = join(workspaceRoot, PATHS.RULES_JSON)
  try {
    const st = await stat(path)
    if (st.size > MAX_RULES_FILE_BYTES) {
      return DEFAULT_RULES
    }
    const raw = await readFile(path, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    const result = rulesConfigSchema.safeParse(parsed)
    if (!result.success) {
      return DEFAULT_RULES
    }
    return result.data
  } catch {
    return DEFAULT_RULES
  }
}

function formatRuleList(rules: Rule[]): string {
  return rules.map(r => `[${r.id}] ${r.description}`).join('; ')
}

export function formatRulesForPrompt(rules: RulesConfig): string {
  const hard = rules.hardRules.length > 0 ? `${RULES_PROMPTS.HARD_PREFIX} ${formatRuleList(rules.hardRules)}.` : ''
  const soft = rules.softRules.length > 0 ? `${RULES_PROMPTS.SOFT_PREFIX} ${formatRuleList(rules.softRules)}.` : ''
  return [hard, soft].filter(Boolean).join(' ')
}
