import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LLM_MAX_TOKENS } from '@/constants'
import { createOpenAIProvider } from '@/llm/openai'

describe('createOpenAIProvider', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards an unlisted model to the Responses API and maps its response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'resp_test',
          object: 'response',
          created_at: 1,
          model: 'gpt-6-luna',
          status: 'completed',
          output: [
            {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'Review complete.', annotations: [] }]
            }
          ],
          usage: {
            input_tokens: 17,
            output_tokens: 29,
            total_tokens: 46
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const provider = createOpenAIProvider('test-key', 'gpt-6-luna')
    const result = await provider.complete([
      { role: 'system', content: 'Review carefully.' },
      { role: 'user', content: 'Check this change.' }
    ])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, request] = mockFetch.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toBe('https://api.openai.com/v1/responses')
    expect(JSON.parse(String(request.body))).toEqual({
      model: 'gpt-6-luna',
      max_output_tokens: LLM_MAX_TOKENS,
      input: [
        { role: 'system', content: 'Review carefully.' },
        { role: 'user', content: 'Check this change.' }
      ]
    })
    expect(result).toEqual({
      content: 'Review complete.',
      usage: { promptTokens: 17, completionTokens: 29 }
    })
  })
})
