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
    delete process.env[ENV_KEYS.CODEX_CLI_PATH]
    delete process.env[ENV_KEYS.CLAUDE_CODE_CLI_PATH]
    delete process.env[ENV_KEYS.CURSOR_AGENT_CLI_PATH]
    delete process.env[ENV_KEYS.OPENCODE_CLI_PATH]
    delete process.env[ENV_KEYS.CRITIC_CLI_TIMEOUT_MS]
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
        opencodePlan: OPENCODE_PLANS.GO,
        codexCliPath: undefined,
        claudeCodeCliPath: undefined,
        cursorAgentCliPath: undefined,
        opencodeCliPath: undefined,
        criticCliTimeoutMs: 120_000
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
      process.env[ENV_KEYS.CODEX_CLI_PATH] = '/usr/local/bin/codex'
      process.env[ENV_KEYS.CLAUDE_CODE_CLI_PATH] = '/usr/local/bin/claude'
      process.env[ENV_KEYS.CURSOR_AGENT_CLI_PATH] = '/usr/local/bin/cursor-agent'
      process.env[ENV_KEYS.OPENCODE_CLI_PATH] = '/usr/local/bin/opencode'
      process.env[ENV_KEYS.CRITIC_CLI_TIMEOUT_MS] = '90000'

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
        opencodePlan: OPENCODE_PLANS.ZEN,
        codexCliPath: '/usr/local/bin/codex',
        claudeCodeCliPath: '/usr/local/bin/claude',
        cursorAgentCliPath: '/usr/local/bin/cursor-agent',
        opencodeCliPath: '/usr/local/bin/opencode',
        criticCliTimeoutMs: 90_000
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

    it('requires an explicit provider/model ID for the isolated OpenCode CLI', () => {
      process.env[ENV_KEYS.CRITIC_PROVIDER] = PROVIDERS.OPENCODE_CLI
      expect(() => loadConfig()).toThrow(/provider\/model form/)
      process.env[ENV_KEYS.CRITIC_MODEL] = '/model'
      expect(() => loadConfig()).toThrow(/provider\/model form/)
      process.env[ENV_KEYS.CRITIC_MODEL] = 'provider/'
      expect(() => loadConfig()).toThrow(/provider\/model form/)
      process.env[ENV_KEYS.CRITIC_MODEL] = 'opencode-go/minimax-m3'
      expect(loadConfig().criticModel).toBe('opencode-go/minimax-m3')
    })
  })

  describe('getEffectiveModel', () => {
    it('returns criticModel if specified in config', () => {
      const config = {
        criticProvider: PROVIDERS.OPENAI,
        criticModel: 'custom-model',
        criticPersona: PERSONAS.CLEAN_CODE_MONK,
        opencodePlan: OPENCODE_PLANS.GO,
        criticCliTimeoutMs: 120_000
      }
      expect(getEffectiveModel(config)).toBe('custom-model')
    })

    it.each([
      [PROVIDERS.OPENAI],
      [PROVIDERS.ANTHROPIC],
      [PROVIDERS.GOOGLE],
      [PROVIDERS.MINIMAX],
      [PROVIDERS.OPENCODE],
      [PROVIDERS.CODEX_CLI],
      [PROVIDERS.CLAUDE_CODE],
      [PROVIDERS.CURSOR_AGENT],
      [PROVIDERS.OPENCODE_CLI]
    ])('returns default model for provider %s when criticModel is not set', provider => {
      const config = {
        criticProvider: provider,
        criticModel: undefined,
        criticPersona: PERSONAS.CLEAN_CODE_MONK,
        opencodePlan: OPENCODE_PLANS.GO,
        criticCliTimeoutMs: 120_000
      }
      expect(getEffectiveModel(config)).toBe(DEFAULT_MODELS[provider as ProviderId])
    })
  })
})
