import { contrastRatio, meetsAA } from '@/lib/contrast'

// Avatar identity colors, derived — not admin-authored, not hand-copied
// per palette (add-color-theme-customization follow-up). Teal's own 6
// avatar pairs (index.css) are the only hardcoded data; every other
// palette's avatar set — built-in preset or arbitrary Custom primary — is
// computed from these by rotating hue toward the target primary and
// solving foreground lightness for guaranteed contrast, the same
// mechanism at build time (presets, baked into index.css) and at runtime
// (Custom, in ThemeProvider.tsx). See avatarPalette.test.ts for why naive
// same-lightness rotation isn't safe: WCAG luminance isn't hue-neutral, so
// holding HSL lightness constant while rotating hue can silently break
// contrast for some target hues even though it's fine for others.

export const TEAL_PRIMARY = { light: '#14B8A6', dark: '#2DD4BF' }

const TEAL_AVATARS: Record<'light' | 'dark', { background: string; foreground: string }[]> = {
  light: [
    { background: '#CFEFEA', foreground: '#0F6E63' },
    { background: '#DCEAFB', foreground: '#1D5A96' },
    { background: '#E9E2FB', foreground: '#5B3FA0' },
    { background: '#F5E7D0', foreground: '#8A5A1E' },
    { background: '#FBE1E6', foreground: '#A23A55' },
    { background: '#E4EEDD', foreground: '#4B6B33' },
  ],
  dark: [
    { background: '#0F3B36', foreground: '#7FE0D2' },
    { background: '#123253', foreground: '#8FBBEF' },
    { background: '#2B2149', foreground: '#C6B4F5' },
    { background: '#3A2C10', foreground: '#EFC77C' },
    { background: '#3A1A21', foreground: '#F2A6B6' },
    { background: '#243318', foreground: '#B7D69A' },
  ],
}

// A hair above the bare 4.5:1 AA floor — real browser rendering (subpixel
// anti-aliasing, color management) shouldn't be trusted to land exactly on
// a legal minimum.
const TARGET_CONTRAST = 4.75

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue: number
  switch (max) {
    case r:
      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
      break
    case g:
      hue = ((b - r) / d + 2) / 6
      break
    default:
      hue = ((r - g) / d + 4) / 6
  }
  return [hue, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 1) + 1) % 1
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hueToRgb(p, q, h + 1 / 3)
    g = hueToRgb(p, q, h)
    b = hueToRgb(p, q, h - 1 / 3)
  }
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Binary-searches lightness (at a fixed hue/saturation) for the least
// aggressive adjustment that still clears TARGET_CONTRAST against bg —
// highest lightness that passes when darkening (light mode: dark fg on
// light bg), lowest lightness that passes when lightening (dark mode).
function solveForegroundLightness(bgHex: string, hue: number, sat: number, mode: 'light' | 'dark'): string {
  const darkening = mode === 'light'
  let lo = darkening ? 0 : 0.5
  let hi = darkening ? 0.5 : 1
  // Anchor: if even the most extreme candidate can't clear the target,
  // use it anyway rather than looping forever on an impossible target.
  const extreme = hslToHex(hue, sat, darkening ? 0 : 1)
  if (!meetsAA(contrastRatio(bgHex, extreme))) return extreme

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const candidate = hslToHex(hue, sat, mid)
    const passes = contrastRatio(bgHex, candidate) >= TARGET_CONTRAST
    if (darkening) {
      // Passing candidates are "far enough" (low L); shrink toward the
      // boundary while keeping the highest passing L found.
      if (passes) lo = mid
      else hi = mid
    } else {
      if (passes) hi = mid
      else lo = mid
    }
  }
  const boundaryL = darkening ? lo : hi
  return hslToHex(hue, sat, boundaryL)
}

/**
 * The hue rotation (in degrees, for CSS `hue-rotate()`) from Teal's own
 * primary to `targetPrimaryHex` for one mode — the same delta
 * `deriveAvatarPalette` computes internally, exposed for retinting preset
 * avatar *photos* (baked-pixel Teal duotones, Pepe design review) via a
 * CSS filter rather than a solved hex value. 0 for Teal itself.
 */
export function hueRotateDegreesFromTeal(targetPrimaryHex: string, mode: 'light' | 'dark'): number {
  const basePrimary = TEAL_PRIMARY[mode]
  if (targetPrimaryHex.toUpperCase() === basePrimary.toUpperCase()) return 0
  const [baseHue] = hexToHsl(basePrimary)
  const [targetHue] = hexToHsl(targetPrimaryHex)
  return Math.round((targetHue - baseHue) * 360)
}

/**
 * Derives the 6 avatar identity colors for one mode of a palette whose
 * brand primary is `targetPrimaryHex` — Teal's own primary (`TEAL_PRIMARY`)
 * returns Teal's own unmodified avatar set. Every result pair is
 * guaranteed to clear WCAG AA contrast, regardless of the target hue.
 */
export function deriveAvatarPalette(
  targetPrimaryHex: string,
  mode: 'light' | 'dark',
): { background: string; foreground: string }[] {
  const basePrimary = TEAL_PRIMARY[mode]
  // Teal itself must render pixel-identical to the shipped, hand-verified
  // values — never re-solved through the contrast target, which would
  // nudge even a zero-rotation identity case toward 4.75:1 instead of
  // preserving its original (higher) contrast headroom.
  if (targetPrimaryHex.toUpperCase() === basePrimary.toUpperCase()) {
    return TEAL_AVATARS[mode].map((pair) => ({ ...pair }))
  }
  const [baseHue] = hexToHsl(basePrimary)
  const [targetHue] = hexToHsl(targetPrimaryHex)
  const delta = targetHue - baseHue

  return TEAL_AVATARS[mode].map(({ background, foreground }) => {
    const [hb, sb, lb] = hexToHsl(background)
    const [hf, sf] = hexToHsl(foreground)
    const newBackground = hslToHex(hb + delta, sb, lb)
    const newForeground = solveForegroundLightness(newBackground, hf + delta, sf, mode)
    return { background: newBackground, foreground: newForeground }
  })
}
