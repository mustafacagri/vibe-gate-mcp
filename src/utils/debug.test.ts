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

  it('logs to console.error with DEBUG_LOG_PREFIX when process.env.DEBUG is set', () => {
    process.env[ENV_KEYS.DEBUG] = 'true'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    debugLog('Test debug message')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(`${DEBUG_LOG_PREFIX} Test debug message`)
  })

  it('logs to console.error when process.env.DEBUG is set to numeric value', () => {
    process.env[ENV_KEYS.DEBUG] = '1'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    debugLog('Another test message')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(`${DEBUG_LOG_PREFIX} Another test message`)
  })

  it('does not log to console.error when process.env.DEBUG is undefined', () => {
    delete process.env[ENV_KEYS.DEBUG]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    debugLog('This should not be logged')

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not log to console.error when process.env.DEBUG is an empty string', () => {
    process.env[ENV_KEYS.DEBUG] = ''
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    debugLog('This should not be logged')

    expect(errorSpy).not.toHaveBeenCalled()
  })
})
