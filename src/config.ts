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
  type ProviderId,
  type OpenCodePlanId
} from '@/constants'

const providerSchema = z.enum([
  PROVIDERS.OPENAI,
  PROVIDERS.ANTHROPIC,
  PROVIDERS.GOOGLE,
  PROVIDERS.MINIMAX,
  PROVIDERS.OPENCODE
])

const opencodePlanSchema = z.enum([OPENCODE_PLANS.ZEN, OPENCODE_PLANS.GO])

const personaSchema = z.enum([PERSONAS.SECURITY_FIRST, PERSONAS.PERFORMANCE_FREAK, PERSONAS.CLEAN_CODE_MONK])

export const configSchema = z.object({
  criticProvider: providerSchema.default(PROVIDERS.OPENAI),
  criticModel: z.string().min(1).optional(),
  criticPersona: personaSchema.default(PERSONAS.CLEAN_CODE_MONK),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  googleApiKey: z.string().optional(),
  minimaxApiKey: z.string().optional(),
  opencodeApiKey: z.string().optional(),
  opencodePlan: opencodePlanSchema.default(OPENCODE_PLANS.GO)
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
    opencodePlan: (getEnv(ENV_KEYS.OPENCODE_PLAN) as OpenCodePlanId | undefined) ?? OPENCODE_PLANS.GO
  }
  return configSchema.parse(raw)
}

export function getEffectiveModel(config: Config): string {
  if (config.criticModel) return config.criticModel
  return DEFAULT_MODELS[config.criticProvider as ProviderId]
}
