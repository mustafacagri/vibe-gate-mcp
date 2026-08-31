import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, getEffectiveModel, configSchema } from './config.js'
import { ENV_KEYS, PROVIDERS, PERSONAS, OPENCODE_PLANS, DEFAULT_MODELS } from './constants.js'
import { ZodError } from 'zod'

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    // Clean environment variables used by loadConfig
    delete process.env[ENV_KEYS.CRITIC_PROVIDER]
    delete process.env[ENV_KEYS.CRITIC_MODEL]
    delete process.env[ENV_KEYS.CRITIC_PERSONA]
    delete process.env[ENV_KEYS.OPENAI_API_KEY]
    delete process.env[ENV_KEYS.ANTHROPIC_API_KEY]
    delete process.env[ENV_KEYS.GOOGLE_GENERATIVE_AI_API_KEY]
    delete process.env[ENV_KEYS.MINIMAX_API_KEY]
    delete process.env[ENV_KEYS.OPENCODE_API_KEY]
    delete process.env[ENV_KEYS.OPENCODE_PLAN]
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('loadConfig', () => {
    it('returns default config when environment variables are unset', () => {
      const config = loadConfig()

      expect(config).toEqual({
        criticProvider: PROVIDERS.OPENAI,
        criticModel: undefined,
        criticPersona: PERSONAS.CLEAN_CODE_MONK,
        openaiApiKey: undefined,
        anthropicApiKey: undefined,
        googleApiKey: undefined,
        minimaxApiKey: undefined,
        opencodeApiKey: undefined,
        opencodePlan: OPENCODE_PLANS.GO
      })
    })

    it('loads custom environment variables correctly', () => {
      process.env[ENV_KEYS.CRITIC_PROVIDER] = PROVIDERS.ANTHROPIC
      process.env[ENV_KEYS.CRITIC_MODEL] = 'claude-3-5-sonnet-20241022'
      process.env[ENV_KEYS.CRITIC_PERSONA] = PERSONAS.SECURITY_FIRST
      process.env[ENV_KEYS.OPENAI_API_KEY] = 'sk-openai-key'
      process.env[ENV_KEYS.ANTHROPIC_API_KEY] = 'sk-anthropic-key'
      process.env[ENV_KEYS.GOOGLE_GENERATIVE_AI_API_KEY] = 'google-key'
      process.env[ENV_KEYS.MINIMAX_API_KEY] = 'minimax-key'
      process.env[ENV_KEYS.OPENCODE_API_KEY] = 'opencode-key'
      process.env[ENV_KEYS.OPENCODE_PLAN] = OPENCODE_PLANS.ZEN

      const config = loadConfig()

      expect(config).toEqual({
        criticProvider: PROVIDERS.ANTHROPIC,
        criticModel: 'claude-3-5-sonnet-20241022',
        criticPersona: PERSONAS.SECURITY_FIRST,
        openaiApiKey: 'sk-openai-key',
        anthropicApiKey: 'sk-anthropic-key',
        googleApiKey: 'google-key',
        minimaxApiKey: 'minimax-key',
        opencodeApiKey: 'opencode-key',
        opencodePlan: OPENCODE_PLANS.ZEN
      })
    })

    it('throws error when CRITIC_PROVIDER is invalid', () => {
      process.env[ENV_KEYS.CRITIC_PROVIDER] = 'invalid-provider'

      expect(() => loadConfig()).toThrow(ZodError)
    })

    it('throws error when CRITIC_PERSONA is invalid', () => {
      process.env[ENV_KEYS.CRITIC_PERSONA] = 'invalid-persona'

      expect(() => loadConfig()).toThrow(ZodError)
    })

    it('throws error when OPENCODE_PLAN is invalid', () => {
      process.env[ENV_KEYS.OPENCODE_PLAN] = 'invalid-plan'

      expect(() => loadConfig()).toThrow(ZodError)
    })

    it('throws error when CRITIC_MODEL is an empty string', () => {
      process.env[ENV_KEYS.CRITIC_MODEL] = ''

      expect(() => loadConfig()).toThrow(ZodError)
    })
  })

  describe('configSchema', () => {
    it('applies defaults for missing fields when parsing empty object', () => {
      const parsed = configSchema.parse({})

      expect(parsed).toEqual({
        criticProvider: PROVIDERS.OPENAI,
        criticModel: undefined,
        criticPersona: PERSONAS.CLEAN_CODE_MONK,
        openaiApiKey: undefined,
        anthropicApiKey: undefined,
        googleApiKey: undefined,
        minimaxApiKey: undefined,
        opencodeApiKey: undefined,
        opencodePlan: OPENCODE_PLANS.GO
      })
    })
  })

  describe('getEffectiveModel', () => {
    it('returns criticModel if explicitly provided', () => {
      const config = loadConfig()
      config.criticModel = 'custom-model-v1'

      expect(getEffectiveModel(config)).toBe('custom-model-v1')
    })

    it('returns default model for each provider when criticModel is undefined', () => {
      const providers = [
        PROVIDERS.OPENAI,
        PROVIDERS.ANTHROPIC,
        PROVIDERS.GOOGLE,
        PROVIDERS.MINIMAX,
        PROVIDERS.OPENCODE
      ] as const

      for (const provider of providers) {
        const config = {
          ...loadConfig(),
          criticProvider: provider,
          criticModel: undefined
        }
        expect(getEffectiveModel(config)).toBe(DEFAULT_MODELS[provider])
      }
    })
  })
})
