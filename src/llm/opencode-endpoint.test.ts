import { describe, it, expect } from 'vitest'
import {
  MINIMAX_MODELS,
  OPENCODE_ENDPOINT_KINDS,
  OPENCODE_GO_MODEL_NAMESPACE_PREFIX,
  OPENCODE_MODEL_NAMESPACE_PREFIX,
  OPENCODE_PLANS,
  OPENCODE_ZEN,
  OPENCODE_ZEN_MODELS,
  OPENCODE_ZEN_SAMPLE_MODELS
} from '@/constants'
import {
  buildOpenCodeGeminiUrl,
  getOpenCodeAnthropicBaseUrl,
  getOpenCodeChatBaseUrl,
  normalizeOpenCodeModelId,
  resolveOpenCodeEndpoint
} from '@/llm/opencode-endpoint'

const { GPT, GPT_PRO, CLAUDE, QWEN, GEMINI, GEMINI_FLASH, MINIMAX, DEEPSEEK, KIMI } = OPENCODE_ZEN_SAMPLE_MODELS

describe('normalizeOpenCodeModelId', () => {
  it('strips opencode/ and opencode-go/ prefixes', () => {
    expect(normalizeOpenCodeModelId(`${OPENCODE_MODEL_NAMESPACE_PREFIX}${CLAUDE}`)).toBe(CLAUDE)
    expect(normalizeOpenCodeModelId(`${OPENCODE_GO_MODEL_NAMESPACE_PREFIX}${MINIMAX}`)).toBe(MINIMAX)
    expect(normalizeOpenCodeModelId(CLAUDE)).toBe(CLAUDE)
  })

  it('resolves MiniMax display name aliases to Zen canonical IDs', () => {
    expect(normalizeOpenCodeModelId(MINIMAX_MODELS.M3)).toBe(OPENCODE_ZEN_MODELS.MINIMAX_M3)
    expect(normalizeOpenCodeModelId(MINIMAX_MODELS.M2_7)).toBe(OPENCODE_ZEN_MODELS.MINIMAX_M2_7)
  })
})

describe('OpenCode base URL helpers', () => {
  it('returns Zen or Go chat base URL', () => {
    expect(getOpenCodeChatBaseUrl(OPENCODE_PLANS.ZEN)).toBe('https://opencode.ai/zen/v1')
    expect(getOpenCodeChatBaseUrl(OPENCODE_PLANS.GO)).toBe('https://opencode.ai/zen/go/v1')
  })

  it('returns Zen or Go anthropic base URL without /v1 suffix', () => {
    expect(getOpenCodeAnthropicBaseUrl(OPENCODE_PLANS.ZEN)).toBe('https://opencode.ai/zen')
    expect(getOpenCodeAnthropicBaseUrl(OPENCODE_PLANS.GO)).toBe('https://opencode.ai/zen/go')
  })
})

describe('resolveOpenCodeEndpoint (Zen)', () => {
  it('routes GPT models to responses API', () => {
    expect(resolveOpenCodeEndpoint(GPT, OPENCODE_PLANS.ZEN)).toBe(OPENCODE_ENDPOINT_KINDS.RESPONSES)
    expect(resolveOpenCodeEndpoint(`${OPENCODE_MODEL_NAMESPACE_PREFIX}${GPT_PRO}`, OPENCODE_PLANS.ZEN)).toBe(
      OPENCODE_ENDPOINT_KINDS.RESPONSES
    )
  })

  it('routes Claude and Qwen models to Anthropic API', () => {
    expect(resolveOpenCodeEndpoint(CLAUDE, OPENCODE_PLANS.ZEN)).toBe(OPENCODE_ENDPOINT_KINDS.ANTHROPIC)
    expect(resolveOpenCodeEndpoint(QWEN, OPENCODE_PLANS.ZEN)).toBe(OPENCODE_ENDPOINT_KINDS.ANTHROPIC)
  })

  it('routes Gemini models to Gemini API', () =>
    expect(resolveOpenCodeEndpoint(GEMINI, OPENCODE_PLANS.ZEN)).toBe(OPENCODE_ENDPOINT_KINDS.GEMINI))

  it('routes MiniMax on Zen to chat completions API', () => {
    expect(resolveOpenCodeEndpoint(MINIMAX, OPENCODE_PLANS.ZEN)).toBe(OPENCODE_ENDPOINT_KINDS.CHAT)
    expect(resolveOpenCodeEndpoint(DEEPSEEK, OPENCODE_PLANS.ZEN)).toBe(OPENCODE_ENDPOINT_KINDS.CHAT)
    expect(resolveOpenCodeEndpoint(KIMI, OPENCODE_PLANS.ZEN)).toBe(OPENCODE_ENDPOINT_KINDS.CHAT)
  })
})

describe('resolveOpenCodeEndpoint (Go)', () => {
  it('routes GPT models to responses API', () => {
    expect(resolveOpenCodeEndpoint(GPT, OPENCODE_PLANS.GO)).toBe(OPENCODE_ENDPOINT_KINDS.RESPONSES)
    expect(resolveOpenCodeEndpoint('gpt-5.6-luna', OPENCODE_PLANS.GO)).toBe(OPENCODE_ENDPOINT_KINDS.RESPONSES)
  })

  it('routes MiniMax and Qwen to Anthropic messages API', () => {
    expect(resolveOpenCodeEndpoint(MINIMAX, OPENCODE_PLANS.GO)).toBe(OPENCODE_ENDPOINT_KINDS.ANTHROPIC)
    expect(resolveOpenCodeEndpoint(MINIMAX_MODELS.M3, OPENCODE_PLANS.GO)).toBe(OPENCODE_ENDPOINT_KINDS.ANTHROPIC)
    expect(resolveOpenCodeEndpoint(QWEN, OPENCODE_PLANS.GO)).toBe(OPENCODE_ENDPOINT_KINDS.ANTHROPIC)
  })

  it('routes other Go models to chat completions API', () => {
    expect(resolveOpenCodeEndpoint(DEEPSEEK, OPENCODE_PLANS.GO)).toBe(OPENCODE_ENDPOINT_KINDS.CHAT)
    expect(resolveOpenCodeEndpoint(KIMI, OPENCODE_PLANS.GO)).toBe(OPENCODE_ENDPOINT_KINDS.CHAT)
  })
})

describe('buildOpenCodeGeminiUrl', () => {
  it('builds model-specific generateContent URL for Zen', () => {
    const { BASE_URL, PATHS } = OPENCODE_ZEN
    expect(buildOpenCodeGeminiUrl(GEMINI, OPENCODE_PLANS.ZEN)).toBe(
      `${BASE_URL}/${PATHS.MODELS}/${GEMINI}:${PATHS.GEMINI_GENERATE_ACTION}`
    )
    expect(buildOpenCodeGeminiUrl(`${OPENCODE_MODEL_NAMESPACE_PREFIX}${GEMINI_FLASH}`, OPENCODE_PLANS.ZEN)).toBe(
      `${BASE_URL}/${PATHS.MODELS}/${GEMINI_FLASH}:${PATHS.GEMINI_GENERATE_ACTION}`
    )
  })

  it('rejects Gemini on Go plan', () =>
    expect(() => buildOpenCodeGeminiUrl(GEMINI, OPENCODE_PLANS.GO)).toThrow(/not available on OpenCode Go/))
})
