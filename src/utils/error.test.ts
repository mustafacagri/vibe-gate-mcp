import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './error.js'

describe('getErrorMessage', () => {
  it('returns message property from Error instances', () => {
    const error = new Error('Something went wrong')
    expect(getErrorMessage(error)).toBe('Something went wrong')
  })

  it('returns message property from Error subclass instances', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'CustomError'
      }
    }
    const customErr = new CustomError('Custom failure')
    expect(getErrorMessage(customErr)).toBe('Custom failure')
  })

  it('returns message property from built-in Error subclasses like TypeError', () => {
    const typeError = new TypeError('Invalid argument type')
    expect(getErrorMessage(typeError)).toBe('Invalid argument type')
  })

  it('handles primitive values correctly by converting them to string', () => {
    expect(getErrorMessage('Error string')).toBe('Error string')
    expect(getErrorMessage(404)).toBe('404')
    expect(getErrorMessage(true)).toBe('true')
    expect(getErrorMessage(false)).toBe('false')
    expect(getErrorMessage(null)).toBe('null')
    expect(getErrorMessage(undefined)).toBe('undefined')
    expect(getErrorMessage(100n)).toBe('100')
    expect(getErrorMessage(Symbol('testSymbol'))).toBe('Symbol(testSymbol)')
  })

  it('handles non-Error objects by stringifying them', () => {
    expect(getErrorMessage({ code: 500, message: 'Server error' })).toBe('[object Object]')
    expect(getErrorMessage([1, 2, 3])).toBe('1,2,3')
  })
})
