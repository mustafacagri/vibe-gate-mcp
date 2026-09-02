import { describe, expect, it } from 'vitest'
import type { ProviderId } from '@/constants'
import { PROVIDERS, TOKEN_ESTIMATION, CONTEXT_WINDOWS, MAX_CONTEXT_WINDOWS } from '@/constants'
import {
  estimateTokens,
  estimateMessages,
  getEffectiveContextBudget,
  getMaxContextBudget,
  budgetToTokens
} from './tokenEstimator.js'

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it.each([
    { input: 'a', expectedTokens: 1 },
    { input: 'abc', expectedTokens: 1 },
    { input: 'abcd', expectedTokens: 1 },
    { input: 'abcde', expectedTokens: 2 },
    { input: 'abcdefgh', expectedTokens: 2 },
    { input: 'abcdefghi', expectedTokens: 3 }
  ])('estimates $expectedTokens tokens for string of length $input.length ("$input")', ({ input, expectedTokens }) => {
    expect(estimateTokens(input)).toBe(expectedTokens)
  })

  it('calculates exact tokens for multiples of CHARS_PER_TOKEN', () => {
    const charsPerToken = TOKEN_ESTIMATION.CHARS_PER_TOKEN
    expect(estimateTokens('a'.repeat(charsPerToken))).toBe(1)
    expect(estimateTokens('a'.repeat(charsPerToken * 4))).toBe(4)
    expect(estimateTokens('a'.repeat(charsPerToken * 250))).toBe(250)
  })

  it('handles strings with whitespace, newlines, and unicode characters', () => {
    expect(estimateTokens('\n\t\r ')).toBe(1)
    const unicodeText = 'Hello 👋 World 🌍!' // length is 17 UTF-16 code units
    expect(estimateTokens(unicodeText)).toBe(Math.ceil(unicodeText.length / TOKEN_ESTIMATION.CHARS_PER_TOKEN))
  })
})

describe('estimateMessages', () => {
  it('returns 0 for empty message array', () => {
    expect(estimateMessages([])).toBe(0)
  })

  it('returns 0 for messages with empty contents', () => {
    const messages = [
      { role: 'system', content: '' },
      { role: 'user', content: '' }
    ]
    expect(estimateMessages(messages)).toBe(0)
  })

  it.each([
    {
      messages: [
        { role: 'system', content: 'You are helpful.' }, // 16 chars -> 4 tokens
        { role: 'user', content: 'hello' }, // 5 chars -> 2 tokens
        { role: 'assistant', content: 'world!' } // 6 chars -> 2 tokens
      ],
      expectedTotalTokens: 8
    },
    {
      messages: [
        { role: 'user', content: 'a'.repeat(8) }, // 8 chars -> 2 tokens
        { role: 'assistant', content: 'b'.repeat(12) } // 12 chars -> 3 tokens
      ],
      expectedTotalTokens: 5
    }
  ])('sums tokens correctly across messages', ({ messages, expectedTotalTokens }) => {
    expect(estimateMessages(messages)).toBe(expectedTotalTokens)
  })
})

describe('getEffectiveContextBudget', () => {
  const providerList = Object.values(PROVIDERS) as ProviderId[]

  it.each(providerList)('calculates effective context budget correctly for provider %s', provider => {
    const raw = CONTEXT_WINDOWS[provider]
    const expected =
      Math.floor(raw * TOKEN_ESTIMATION.EFFECTIVE_CONTEXT_FACTOR) -
      TOKEN_ESTIMATION.SAFETY_MARGIN -
      TOKEN_ESTIMATION.RESPONSE_RESERVE

    const result = getEffectiveContextBudget(provider)
    expect(result).toBe(expected)
    expect(result).toBeGreaterThan(0)
  })

  it.each(providerList)('ensures effective budget is lower than max context budget for provider %s', provider => {
    expect(getEffectiveContextBudget(provider)).toBeLessThan(getMaxContextBudget(provider))
  })
})

describe('getMaxContextBudget', () => {
  const providerList = Object.values(PROVIDERS) as ProviderId[]

  it.each(providerList)('calculates max context budget correctly for provider %s', provider => {
    const raw = MAX_CONTEXT_WINDOWS[provider]
    const expected = raw - TOKEN_ESTIMATION.SAFETY_MARGIN - TOKEN_ESTIMATION.RESPONSE_RESERVE

    const result = getMaxContextBudget(provider)
    expect(result).toBe(expected)
    expect(result).toBeGreaterThan(0)
  })
})

describe('budgetToTokens', () => {
  it('returns 0 for 0 budget', () => {
    expect(budgetToTokens(0)).toBe(0)
  })

  it.each([
    { budgetChars: 1, expectedTokens: 0 },
    { budgetChars: 3, expectedTokens: 0 },
    { budgetChars: 4, expectedTokens: 1 },
    { budgetChars: 5, expectedTokens: 1 },
    { budgetChars: 7, expectedTokens: 1 },
    { budgetChars: 8, expectedTokens: 2 },
    { budgetChars: 400, expectedTokens: 100 }
  ])(
    'converts $budgetChars budget chars to $expectedTokens tokens using Math.floor',
    ({ budgetChars, expectedTokens }) => {
      expect(budgetToTokens(budgetChars)).toBe(expectedTokens)
    }
  )
})
