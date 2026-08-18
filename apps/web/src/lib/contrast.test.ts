import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsAA } from './contrast'

describe('contrastRatio', () => {
  it('returns 21 for pure black on pure white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('returns 1 for identical colors', () => {
    expect(contrastRatio('#14B8A6', '#14B8A6')).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#0B2E2C', '#F7FAFA')).toBeCloseTo(contrastRatio('#F7FAFA', '#0B2E2C'), 5)
  })

  it('matches the documented shipped teal foreground/background ratio (~13.88:1)', () => {
    expect(contrastRatio('#0B2E2C', '#F7FAFA')).toBeCloseTo(13.88, 1)
  })
})

describe('meetsAA', () => {
  it('is true at or above 4.5:1', () => {
    expect(meetsAA(4.5)).toBe(true)
    expect(meetsAA(21)).toBe(true)
  })

  it('is false below 4.5:1', () => {
    expect(meetsAA(4.49)).toBe(false)
    expect(meetsAA(2.49)).toBe(false)
  })
})
