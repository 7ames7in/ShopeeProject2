import { describe, it, expect } from 'vitest'

describe('Example Test Suite', () => {
  it('should add numbers correctly', () => {
    const sum = (a: number, b: number) => a + b
    expect(sum(2, 3)).toBe(5)
  })

  it('should handle string concatenation', () => {
    const concat = (a: string, b: string) => `${a} ${b}`
    expect(concat('Hello', 'World')).toBe('Hello World')
  })

  it('should validate boolean conditions', () => {
    const isValid = (value: unknown): value is string => typeof value === 'string'
    expect(isValid('test')).toBe(true)
    expect(isValid(123)).toBe(false)
  })
})
