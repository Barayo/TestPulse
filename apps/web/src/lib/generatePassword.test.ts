import { describe, expect, it, vi } from 'vitest'
import { generateSecurePassword } from './generatePassword'

const AMBIGUOUS = new Set(['0', 'O', '1', 'l', 'I'])

describe('generateSecurePassword', () => {
  it('returns a 20-character string', () => {
    expect(generateSecurePassword()).toHaveLength(20)
  })

  it('draws only from the ambiguity-excluded alphabet', () => {
    const password = generateSecurePassword()
    for (const char of password) {
      expect(AMBIGUOUS.has(char)).toBe(false)
      expect(char).toMatch(/^[A-Za-z0-9]$/)
    }
  })

  it('produces different values on successive calls', () => {
    expect(generateSecurePassword()).not.toBe(generateSecurePassword())
  })

  it('uses crypto.getRandomValues, not Math.random', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues')
    generateSecurePassword()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
