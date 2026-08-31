import { describe, expect, it } from 'vitest'
import { PROVIDERS, TOKEN_ESTIMATION, CONTEXT_WINDOWS, MAX_CONTEXT_WINDOWS } from '@/constants'
import {
  estimateTokens,
  estimateMessages,
  getEffectiveContextBudget,
  getMaxContextBudget,
  budgetToTokens
} from './tokenEstimator'

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('calculates exact tokens for multiples of CHARS_PER_TOKEN', () => {
    const charsPerToken = TOKEN_ESTIMATION.CHARS_PER_TOKEN
    expect(estimateTokens('a'.repeat(charsPerToken))).toBe(1)
    expect(estimateTokens('a'.repeat(charsPerToken * 4))).toBe(4)
  })

  it('rounds up using Math.ceil for partial tokens', () => {
    expect(estimateTokens('a')).toBe(1)
    expect(estimateTokens('aaaaa')).toBe(2)
  })
})

describe('estimateMessages', () => {
  it('returns 0 for empty message array', () => {
    expect(estimateMessages([])).toBe(0)
  })

  it('sums token estimates for multiple messages', () => {
    const messages = [
      { role: 'user', content: 'hello' }, // 5 chars -> 2 tokens
      { role: 'assistant', content: 'world!' } // 6 chars -> 2 tokens
    ]
    expect(estimateMessages(messages)).toBe(4)
  })
})

describe('getEffectiveContextBudget', () => {
  it('calculates effective context budget correctly for providers', () => {
    for (const provider of Object.values(PROVIDERS)) {
      const raw = CONTEXT_WINDOWS[provider]
      const expected =
        Math.floor(raw * TOKEN_ESTIMATION.EFFECTIVE_CONTEXT_FACTOR) -
        TOKEN_ESTIMATION.SAFETY_MARGIN -
        TOKEN_ESTIMATION.RESPONSE_RESERVE

      expect(getEffectiveContextBudget(provider)).toBe(expected)
    }
  })
})

describe('getMaxContextBudget', () => {
  it('calculates max context budget correctly for providers', () => {
    for (const provider of Object.values(PROVIDERS)) {
      const raw = MAX_CONTEXT_WINDOWS[provider]
      const expected = raw - TOKEN_ESTIMATION.SAFETY_MARGIN - TOKEN_ESTIMATION.RESPONSE_RESERVE

      expect(getMaxContextBudget(provider)).toBe(expected)
    }
  })
})

describe('budgetToTokens', () => {
  it('returns 0 for 0 budget', () => {
    expect(budgetToTokens(0)).toBe(0)
  })

  it('converts budget characters to tokens using Math.floor', () => {
    const charsPerToken = TOKEN_ESTIMATION.CHARS_PER_TOKEN
    expect(budgetToTokens(charsPerToken * 10)).toBe(10)
    expect(budgetToTokens(charsPerToken * 10 + 3)).toBe(10)
  })
})
