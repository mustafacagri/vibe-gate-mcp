import { beforeEach, describe, expect, it, vi } from 'vitest'

const googleMocks = vi.hoisted(() => ({
  GoogleGenAI: vi.fn(),
  generateContent: vi.fn()
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: googleMocks.GoogleGenAI
}))

import { createGoogleProvider } from '@/llm/google'

describe('createGoogleProvider', () => {
  beforeEach(() => {
    googleMocks.generateContent.mockReset()
    googleMocks.GoogleGenAI.mockReset()
    googleMocks.GoogleGenAI.mockImplementation(function () {
      return { models: { generateContent: googleMocks.generateContent } }
    })
  })

  it('uses the current Google Gen AI client and preserves system instructions and usage', async () => {
    googleMocks.generateContent.mockResolvedValue({
      text: 'review complete',
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 7
      }
    })

    const provider = createGoogleProvider('test-key', 'gemini-2.5-flash')
    const result = await provider.complete([
      { role: 'system', content: 'You are a strict critic.' },
      { role: 'user', content: 'Review this change.' },
      { role: 'assistant', content: 'I found one concern.' }
    ])

    expect(googleMocks.GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' })
    expect(googleMocks.generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: 'Review this change.' }] },
        { role: 'model', parts: [{ text: 'I found one concern.' }] }
      ],
      config: {
        maxOutputTokens: 16384,
        systemInstruction: 'You are a strict critic.'
      }
    })
    expect(result).toEqual({
      content: 'review complete',
      usage: { promptTokens: 12, completionTokens: 7 }
    })
  })
})
