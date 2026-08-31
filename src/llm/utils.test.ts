import { describe, expect, it } from 'vitest'
import type { LLMMessage } from '@/llm/types'
import { splitMessages } from '@/llm/utils'

describe('splitMessages', () => {
  it('handles empty message list', () => {
    const messages: LLMMessage[] = []
    const result = splitMessages(messages)
    expect(result).toEqual({
      system: undefined,
      chat: []
    })
  })

  it('extracts single system message and chat messages', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ]

    const result = splitMessages(messages)
    expect(result).toEqual({
      system: 'You are a helpful assistant.',
      chat: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]
    })
  })

  it('joins multiple system messages with double newlines', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'Instruction 1' },
      { role: 'user', content: 'Question' },
      { role: 'system', content: 'Instruction 2' }
    ]

    const result = splitMessages(messages)
    expect(result).toEqual({
      system: 'Instruction 1\n\nInstruction 2',
      chat: [{ role: 'user', content: 'Question' }]
    })
  })

  it('returns undefined for system when no system messages are present', () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: 'User message' },
      { role: 'assistant', content: 'Assistant message' }
    ]

    const result = splitMessages(messages)
    expect(result).toEqual({
      system: undefined,
      chat: [
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' }
      ]
    })
  })
})
