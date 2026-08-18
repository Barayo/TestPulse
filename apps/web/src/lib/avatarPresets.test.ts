import { describe, expect, it } from 'vitest'
import { AVATAR_PRESETS, avatarPresetImage } from './avatarPresets'

// Historical record, not a derived/computed property of the presets — kept
// here rather than as a runtime field on AVATAR_PRESETS, since nothing in
// the app needs gender at render time; it exists purely to check the
// roster-balance regression guard (specs/authentication/spec.md,
// diversify-avatar-preset-gallery: "at least 14 women out of at least 29
// total presets").
const WOMEN_KEYS = new Set([
  'ada-lovelace',
  'grace-hopper',
  'marie-curie',
  'katherine-johnson',
  'mary-anning',
  'emmy-noether',
  'caroline-herschel',
  'sophie-germain',
  'mary-somerville',
  'henrietta-swan-leavitt',
  'nettie-stevens',
  'lise-meitner',
  'agnes-pockels',
  'hypatia',
])

describe('AVATAR_PRESETS', () => {
  it('includes the 8 new diversify-avatar-preset-gallery presets', () => {
    const keys = AVATAR_PRESETS.map((p) => p.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'hypatia',
        'sophie-germain',
        'caroline-herschel',
        'mary-somerville',
        'henrietta-swan-leavitt',
        'nettie-stevens',
        'lise-meitner',
        'agnes-pockels',
      ]),
    )
  })

  it('meets the roster gender-balance floor: at least 14 women of at least 30 total presets', () => {
    expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(30)
    const womenCount = AVATAR_PRESETS.filter((p) => WOMEN_KEYS.has(p.key)).length
    expect(womenCount).toBeGreaterThanOrEqual(14)
  })

  it('avatarPresetImage resolves every listed key to an image', () => {
    for (const preset of AVATAR_PRESETS) {
      expect(avatarPresetImage(preset.key)).toBeTruthy()
    }
  })
})
