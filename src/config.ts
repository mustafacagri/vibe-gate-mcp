/**
 * Config loader: env validation, model/provider selection.
 * Uses constants from @/constants.
 */

import { z } from 'zod'
import {
  ENV_KEYS,
  PROVIDERS,
  DEFAULT_MODELS,
  PERSONAS,
  OPENCODE_PLANS,
  CLI_PROVIDER_DEFAULT_TIMEOUT_MS,
  CLI_PROVIDER_MAX_TIMEOUT_MS,
  type ProviderId,
  type OpenCodePlanId
} from '@/constants'

const providerSchema = z.enum([
  PROVIDERS.OPENAI,
  PROVIDERS.ANTHROPIC,
  PROVIDERS.GOOGLE,
  PROVIDERS.MINIMAX,
  PROVIDERS.OPENCODE,
  PROVIDERS.CODEX_CLI,
  PROVIDERS.CLAUDE_CODE,
  PROVIDERS.CURSOR_AGENT,
  PROVIDERS.OPENCODE_CLI
])

const opencodePlanSchema = z.enum([OPENCODE_PLANS.ZEN, OPENCODE_PLANS.GO])

const personaSchema = z.enum([PERSONAS.SECURITY_FIRST, PERSONAS.PERFORMANCE_FREAK, PERSONAS.CLEAN_CODE_MONK])

export const configSchema = z
  .object({
    criticProvider: providerSchema.default(PROVIDERS.OPENAI),
    criticModel: z.string().min(1).optional(),
    criticPersona: personaSchema.default(PERSONAS.CLEAN_CODE_MONK),
    openaiApiKey: z.string().optional(),
    anthropicApiKey: z.string().optional(),
    googleApiKey: z.string().optional(),
    minimaxApiKey: z.string().optional(),
    opencodeApiKey: z.string().optional(),
    opencodePlan: opencodePlanSchema.default(OPENCODE_PLANS.GO),
    codexCliPath: z.string().min(1).optional(),
    claudeCodeCliPath: z.string().min(1).optional(),
    cursorAgentCliPath: z.string().min(1).optional(),
    opencodeCliPath: z.string().min(1).optional(),
    criticCliTimeoutMs: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(CLI_PROVIDER_MAX_TIMEOUT_MS)
      .default(CLI_PROVIDER_DEFAULT_TIMEOUT_MS)
  })
  .superRefine((config, context) => {
    const model = config.criticModel
    const separator = model?.indexOf('/') ?? -1
    if (
      config.criticProvider === PROVIDERS.OPENCODE_CLI &&
      (!model || separator < 1 || separator === model.length - 1)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['criticModel'],
        message: 'OpenCode CLI requires CRITIC_MODEL in provider/model form (for example, from `opencode models`).'
      })
    }
  })

export type Config = z.infer<typeof configSchema>

function getEnv(key: string): string | undefined {
  return process.env[key]
}

export function loadConfig(): Config {
  const raw = {
    criticProvider: getEnv(ENV_KEYS.CRITIC_PROVIDER) ?? PROVIDERS.OPENAI,
    criticModel: getEnv(ENV_KEYS.CRITIC_MODEL),
    criticPersona: getEnv(ENV_KEYS.CRITIC_PERSONA) ?? PERSONAS.CLEAN_CODE_MONK,
    openaiApiKey: getEnv(ENV_KEYS.OPENAI_API_KEY),
    anthropicApiKey: getEnv(ENV_KEYS.ANTHROPIC_API_KEY),
    googleApiKey: getEnv(ENV_KEYS.GOOGLE_GENERATIVE_AI_API_KEY),
    minimaxApiKey: getEnv(ENV_KEYS.MINIMAX_API_KEY),
    opencodeApiKey: getEnv(ENV_KEYS.OPENCODE_API_KEY),
    opencodePlan: (getEnv(ENV_KEYS.OPENCODE_PLAN) as OpenCodePlanId | undefined) ?? OPENCODE_PLANS.GO,
    codexCliPath: getEnv(ENV_KEYS.CODEX_CLI_PATH),
    claudeCodeCliPath: getEnv(ENV_KEYS.CLAUDE_CODE_CLI_PATH),
    cursorAgentCliPath: getEnv(ENV_KEYS.CURSOR_AGENT_CLI_PATH),
    opencodeCliPath: getEnv(ENV_KEYS.OPENCODE_CLI_PATH),
    criticCliTimeoutMs: getEnv(ENV_KEYS.CRITIC_CLI_TIMEOUT_MS)
  }
  return configSchema.parse(raw)
}

export function getEffectiveModel(config: Config): string {
  if (config.criticModel) return config.criticModel
  return DEFAULT_MODELS[config.criticProvider as ProviderId]
}
