import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { debugLog } from './debug.js'
import { DEBUG_LOG_PREFIX, ENV_KEYS } from '@/constants'

describe('debugLog', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env[ENV_KEYS.DEBUG]
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('when process.env.DEBUG is set', () => {
    it.each([['true'], ['1'], ['debug'], ['VERBOSE'], ['false']])(
      'logs to console.error with DEBUG_LOG_PREFIX when ENV_KEYS.DEBUG is %s',
      envValue => {
        process.env[ENV_KEYS.DEBUG] = envValue
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        debugLog('Test debug message')

        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledWith(`${DEBUG_LOG_PREFIX} Test debug message`)
      }
    )

    it.each([
      ['empty message', ''],
      ['multiline message', 'line 1\nline 2'],
      ['special characters message', 'Special chars: !@#$%^&*()_+-=[]{}|;:\'",.<>/?']
    ])('correctly formats %s', (_, message) => {
      process.env[ENV_KEYS.DEBUG] = 'true'
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      debugLog(message)

      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(`${DEBUG_LOG_PREFIX} ${message}`)
    })

    it('logs multiple messages in sequence', () => {
      process.env[ENV_KEYS.DEBUG] = 'true'
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      debugLog('First message')
      debugLog('Second message')

      expect(errorSpy).toHaveBeenCalledTimes(2)
      expect(errorSpy).toHaveBeenNthCalledWith(1, `${DEBUG_LOG_PREFIX} First message`)
      expect(errorSpy).toHaveBeenNthCalledWith(2, `${DEBUG_LOG_PREFIX} Second message`)
    })
  })

  describe('when process.env.DEBUG is falsy or unset', () => {
    it.each([
      ['undefined', undefined],
      ['empty string', '']
    ])('does not log to console.error when ENV_KEYS.DEBUG is %s', (_, envValue) => {
      if (envValue === undefined) {
        delete process.env[ENV_KEYS.DEBUG]
      } else {
        process.env[ENV_KEYS.DEBUG] = envValue
      }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      debugLog('This should not be logged')

      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
