/**
 * LLM provider factory and fallback logic.
 */

import type { Config } from '@/config'
import type { LLMProvider } from '@/llm/types'
import { createOpenAIProvider } from '@/llm/openai'
import { createAnthropicProvider } from '@/llm/anthropic'
import { createGoogleProvider } from '@/llm/google'
import { createMiniMaxProvider } from '@/llm/minimax'
import { createOpenCodeProvider } from '@/llm/opencode'
import { PROVIDERS } from '@/constants'
import { getEffectiveModel } from '@/config'

export function createLLMProvider(config: Config): LLMProvider | null {
  const model = getEffectiveModel(config)

  const providerMap: Record<string, () => LLMProvider | null> = {
    [PROVIDERS.OPENAI]: () => {
      const key = config.openaiApiKey
      if (!key) return null
      return createOpenAIProvider(key, model)
    },
    [PROVIDERS.ANTHROPIC]: () => {
      const key = config.anthropicApiKey
      if (!key) return null
      return createAnthropicProvider(key, model)
    },
    [PROVIDERS.GOOGLE]: () => {
      const key = config.googleApiKey
      if (!key) return null
      return createGoogleProvider(key, model)
    },
    [PROVIDERS.MINIMAX]: () => {
      const key = config.minimaxApiKey
      if (!key) return null
      return createMiniMaxProvider(key, model)
    },
    [PROVIDERS.OPENCODE]: () => {
      const key = config.opencodeApiKey
      if (!key) return null
      return createOpenCodeProvider(key, model, config.opencodePlan)
    }
  }

  const factory = providerMap[config.criticProvider]
  return factory ? factory() : null
}
