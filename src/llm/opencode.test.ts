import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OPENCODE_PLANS, OPENCODE_ZEN_MODELS } from '@/constants'
import { createOpenCodeProvider } from '@/llm/opencode'

describe('createOpenCodeProvider', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('RESPONSES endpoint (GPT models)', () => {
    it('calls fetch with correct signal timeout and parses response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Hello from OpenCode Responses' }]
            }
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 20
          }
        })
      })

      const provider = createOpenCodeProvider('test-key', OPENCODE_ZEN_MODELS.GPT_5_4, OPENCODE_PLANS.ZEN)
      const response = await provider.complete([{ role: 'user', content: 'Hi' }])

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('https://opencode.ai/zen/v1/responses')
      expect(options.method).toBe('POST')
      expect(options.headers).toEqual({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json'
      })
      expect(options.signal).toBeInstanceOf(AbortSignal)

      expect(response).toEqual({
        content: 'Hello from OpenCode Responses',
        usage: {
          promptTokens: 10,
          completionTokens: 20
        }
      })
    })

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const provider = createOpenCodeProvider('test-key', OPENCODE_ZEN_MODELS.GPT_5_4, OPENCODE_PLANS.ZEN)
      await expect(provider.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
        'OpenCode Zen responses API failed (500): Internal Server Error'
      )
    })
  })

  describe('GEMINI endpoint (Gemini models)', () => {
    it('calls fetch with correct signal timeout and parses response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello from OpenCode Gemini' }]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25
          }
        })
      })

      const provider = createOpenCodeProvider('test-key', OPENCODE_ZEN_MODELS.GEMINI_3_1_PRO, OPENCODE_PLANS.ZEN)
      const response = await provider.complete([{ role: 'user', content: 'Hi Gemini' }])

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('https://opencode.ai/zen/v1/models/gemini-3.1-pro:generateContent')
      expect(options.method).toBe('POST')
      expect(options.headers).toEqual({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json'
      })
      expect(options.signal).toBeInstanceOf(AbortSignal)

      expect(response).toEqual({
        content: 'Hello from OpenCode Gemini',
        usage: {
          promptTokens: 15,
          completionTokens: 25
        }
      })
    })

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      })

      const provider = createOpenCodeProvider('test-key', OPENCODE_ZEN_MODELS.GEMINI_3_1_PRO, OPENCODE_PLANS.ZEN)
      await expect(provider.complete([{ role: 'user', content: 'Hi Gemini' }])).rejects.toThrow(
        'OpenCode Zen Gemini API failed (403): Forbidden'
      )
    })
  })
})
