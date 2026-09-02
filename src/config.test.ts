import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, getEffectiveModel } from './config.js'
import { ENV_KEYS, PROVIDERS, DEFAULT_MODELS, PERSONAS, OPENCODE_PLANS, type ProviderId } from './constants.js'

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
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
    it('loads default config when no environment variables are set', () => {
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

    it('loads custom environment variables when provided', () => {
      process.env[ENV_KEYS.CRITIC_PROVIDER] = PROVIDERS.ANTHROPIC
      process.env[ENV_KEYS.CRITIC_MODEL] = 'claude-3-5-sonnet'
      process.env[ENV_KEYS.CRITIC_PERSONA] = PERSONAS.SECURITY_FIRST
      process.env[ENV_KEYS.OPENAI_API_KEY] = 'test-openai-key'
      process.env[ENV_KEYS.ANTHROPIC_API_KEY] = 'test-anthropic-key'
      process.env[ENV_KEYS.GOOGLE_GENERATIVE_AI_API_KEY] = 'test-google-key'
      process.env[ENV_KEYS.MINIMAX_API_KEY] = 'test-minimax-key'
      process.env[ENV_KEYS.OPENCODE_API_KEY] = 'test-opencode-key'
      process.env[ENV_KEYS.OPENCODE_PLAN] = OPENCODE_PLANS.ZEN

      const config = loadConfig()
      expect(config).toEqual({
        criticProvider: PROVIDERS.ANTHROPIC,
        criticModel: 'claude-3-5-sonnet',
        criticPersona: PERSONAS.SECURITY_FIRST,
        openaiApiKey: 'test-openai-key',
        anthropicApiKey: 'test-anthropic-key',
        googleApiKey: 'test-google-key',
        minimaxApiKey: 'test-minimax-key',
        opencodeApiKey: 'test-opencode-key',
        opencodePlan: OPENCODE_PLANS.ZEN
      })
    })

    it.each([
      [ENV_KEYS.CRITIC_PROVIDER, 'invalid-provider'],
      [ENV_KEYS.CRITIC_PERSONA, 'invalid-persona'],
      [ENV_KEYS.OPENCODE_PLAN, 'invalid-plan']
    ])('throws ZodError when %s is set to an invalid value (%s)', (envKey, invalidValue) => {
      process.env[envKey] = invalidValue
      expect(() => loadConfig()).toThrow()
    })
  })

  describe('getEffectiveModel', () => {
    it('returns criticModel if specified in config', () => {
      const config = {
        criticProvider: PROVIDERS.OPENAI,
        criticModel: 'custom-model',
        criticPersona: PERSONAS.CLEAN_CODE_MONK,
        opencodePlan: OPENCODE_PLANS.GO
      }
      expect(getEffectiveModel(config)).toBe('custom-model')
    })

    it.each([[PROVIDERS.OPENAI], [PROVIDERS.ANTHROPIC], [PROVIDERS.GOOGLE], [PROVIDERS.MINIMAX], [PROVIDERS.OPENCODE]])(
      'returns default model for provider %s when criticModel is not set',
      provider => {
        const config = {
          criticProvider: provider,
          criticModel: undefined,
          criticPersona: PERSONAS.CLEAN_CODE_MONK,
          opencodePlan: OPENCODE_PLANS.GO
        }
        expect(getEffectiveModel(config)).toBe(DEFAULT_MODELS[provider as ProviderId])
      }
    )
  })
})
