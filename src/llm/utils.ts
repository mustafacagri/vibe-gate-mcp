import type { LLMMessage } from '@/llm/types'

/**
 * Splits conversation messages into system prompt and chat history.
 * Joins multiple system messages with double newlines.
 */
export function splitMessages(messages: LLMMessage[]): {
  system: string | undefined
  chat: Array<{ role: 'user' | 'assistant'; content: string }>
} {
  const systemParts: string[] = []
  const chat: Array<{ role: 'user' | 'assistant'; content: string }> = []

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content)
    } else {
      chat.push({ role: m.role, content: m.content })
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    chat
  }
}
