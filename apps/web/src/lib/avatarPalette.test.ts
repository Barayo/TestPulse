import { describe, expect, it } from 'vitest'
import { deriveAvatarPalette, hueRotateDegreesFromTeal, TEAL_PRIMARY } from './avatarPalette'
import { contrastRatio, meetsAA } from './contrast'

describe('deriveAvatarPalette', () => {
  it('returns the 6 canonical Teal avatar pairs unchanged when the target primary is Teal itself', () => {
    const light = deriveAvatarPalette(TEAL_PRIMARY.light, 'light')
    expect(light).toHaveLength(6)
    expect(light[0]).toEqual({ background: '#CFEFEA', foreground: '#0F6E63' })
    expect(light[5]).toEqual({ background: '#E4EEDD', foreground: '#4B6B33' })
  })

  it('rotates hue toward the target primary — a purple-ish primary shifts the first avatar away from teal', () => {
    const light = deriveAvatarPalette('#4514B8', 'light') // Indigo's primary
    expect(light[0].background).not.toBe('#CFEFEA')
  })

  // Regression guard: naive same-lightness hue rotation measurably breaks
  // contrast for some hues (found via manual analysis — Indigo's avatar 5
  // dropped to 2.65:1) because WCAG luminance isn't hue-neutral even when
  // HSL lightness is held constant. Every derived pair must clear AA
  // regardless of which hue it lands on.
  it('guarantees every derived pair clears WCAG AA contrast, for every preset primary hue', () => {
    const primaries = {
      indigo: { light: '#4514B8', dark: '#5F2DD4' },
      ocean: { light: '#1453B8', dark: '#2D6DD4' },
      forest: { light: '#14B850', dark: '#2DD46A' },
    }
    for (const [, { light: pl, dark: pd }] of Object.entries(primaries)) {
      for (const pair of deriveAvatarPalette(pl, 'light')) {
        expect(meetsAA(contrastRatio(pair.background, pair.foreground))).toBe(true)
      }
      for (const pair of deriveAvatarPalette(pd, 'dark')) {
        expect(meetsAA(contrastRatio(pair.background, pair.foreground))).toBe(true)
      }
    }
  })

  it('guarantees contrast for an arbitrary admin-chosen custom hue too, not just the three known presets', () => {
    // A pathological case similar to the one that broke naive rotation.
    for (const hex of ['#E91E63', '#FFEB3B', '#000080', '#8B4513']) {
      for (const pair of deriveAvatarPalette(hex, 'light')) {
        expect(meetsAA(contrastRatio(pair.background, pair.foreground))).toBe(true)
      }
      for (const pair of deriveAvatarPalette(hex, 'dark')) {
        expect(meetsAA(contrastRatio(pair.background, pair.foreground))).toBe(true)
      }
    }
  })

  it('is deterministic — the same target primary always derives the same 6 pairs', () => {
    const a = deriveAvatarPalette('#1453B8', 'light')
    const b = deriveAvatarPalette('#1453B8', 'light')
    expect(a).toEqual(b)
  })

  // Regression guard: a destructuring slip (`const [hf, , sf] = hexToHsl(...)`,
  // which skips saturation and grabs lightness into `sf` instead) made every
  // derived light-mode foreground dull and washed-out instead of vivid —
  // caught by comparing generated output against a from-scratch Python
  // reimplementation. Foregrounds should stay reasonably saturated, not
  // collapse toward gray.
  it('keeps derived foregrounds vividly saturated, not washed out toward gray', () => {
    const light = deriveAvatarPalette('#4514B8', 'light')
    for (const { foreground } of light) {
      const r = parseInt(foreground.slice(1, 3), 16)
      const g = parseInt(foreground.slice(3, 5), 16)
      const b = parseInt(foreground.slice(5, 7), 16)
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      expect(spread).toBeGreaterThan(40) // a washed-out gray has near-zero channel spread
    }
  })

  it('produces 6 mutually distinguishable hues, not a convergent cluster', () => {
    const pairs = deriveAvatarPalette('#4514B8', 'dark')
    const hues = pairs.map((p) => p.background)
    expect(new Set(hues).size).toBe(6)
  })
})

// Pepe design review follow-up: retinting preset avatar photos (a fixed
// Teal duotone baked into the JPGs) via a CSS hue-rotate() filter, using
// the same Teal→target hue delta the color-token derivation already
// computes internally, exposed here so ThemeProvider.tsx can apply it to
// --avatar-photo-filter.
describe('hueRotateDegreesFromTeal', () => {
  it('returns 0 for Teal itself', () => {
    expect(hueRotateDegreesFromTeal(TEAL_PRIMARY.light, 'light')).toBe(0)
    expect(hueRotateDegreesFromTeal(TEAL_PRIMARY.dark, 'dark')).toBe(0)
  })

  it('matches the precomputed static preset deltas (Indigo/Ocean/Forest)', () => {
    expect(hueRotateDegreesFromTeal('#4514B8', 'light')).toBe(85) // Indigo
    expect(hueRotateDegreesFromTeal('#1453B8', 'light')).toBe(44) // Ocean
    expect(hueRotateDegreesFromTeal('#14B850', 'light')).toBe(-31) // Forest
  })

  it('is deterministic for an arbitrary custom primary', () => {
    const a = hueRotateDegreesFromTeal('#E91E63', 'light')
    const b = hueRotateDegreesFromTeal('#E91E63', 'light')
    expect(a).toBe(b)
  })
})
