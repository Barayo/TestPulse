import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from './ThemeProvider'

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  let changeHandler: ((e: { matches: boolean }) => void) | null = null
  window.matchMedia = vi.fn().mockReturnValue({
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((event: string, handler: (e: { matches: boolean }) => void) => {
      if (event === 'change') changeHandler = handler
    }),
    removeEventListener: vi.fn(),
  })
  return {
    fireChange(newMatches: boolean) {
      matches = newMatches
      act(() => changeHandler?.({ matches: newMatches }))
    },
  }
}

function Consumer() {
  const [theme, setOverride] = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setOverride('dark')}>Go dark</button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('ThemeProvider', () => {
  it('applies the dark class to the document root when resolved theme is dark', () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class when resolved theme is light', () => {
    mockMatchMedia(false)
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('updates the document class when a consumer sets an override', async () => {
    mockMatchMedia(false)
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Go dark' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('shares the same resolved theme across multiple consumers', () => {
    mockMatchMedia(true)
    render(
      <ThemeProvider>
        <Consumer />
        <Consumer />
      </ThemeProvider>,
    )
    const [first, second] = screen.getAllByTestId('theme')
    expect(first.textContent).toBe('dark')
    expect(second.textContent).toBe('dark')
  })

  // add-color-theme-customization: colorTheme defaults to "teal" (no prop
  // needed), so every existing standalone ThemeProvider usage above keeps
  // working with no data-palette attribute at all.
  describe('instance color theme', () => {
    it('applies no data-palette attribute for the default teal theme', () => {
      mockMatchMedia(false)
      render(
        <ThemeProvider colorTheme="teal">
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
    })

    it('applies a data-palette attribute for a preset theme', () => {
      mockMatchMedia(false)
      render(
        <ThemeProvider colorTheme="indigo">
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.getAttribute('data-palette')).toBe('indigo')
    })

    it('applies inline custom-property overrides for a custom theme, matching the active light/dark mode', () => {
      mockMatchMedia(false) // light
      const customPalette = {
        light: {
          background: '#F8F7FA', foreground: '#160B2E', card: '#FFFFFF', primary: '#4514B8',
          primaryForeground: '#FFFFFF', muted: '#EFEDF5', mutedForeground: '#605B6B',
          accent: '#EFEDF5', border: '#E0DCEC', input: '#E0DCEC',
        },
        dark: {
          background: '#140B2A', foreground: '#EAE6F5', card: '#221240', primary: '#5F2DD4',
          primaryForeground: '#EAE6F5', muted: '#22163A', mutedForeground: '#9D8FBD',
          accent: '#23163F', border: '#2E1D52', input: '#2E1D52',
        },
      }
      render(
        <ThemeProvider colorTheme="custom" customPalette={customPalette}>
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#4514B8')
      expect(document.documentElement.style.getPropertyValue('--background')).toBe('#F8F7FA')
    })

    // add-color-theme-customization follow-up: avatar identity colors are
    // derived from the custom primary, never admin-authored — verifies
    // ThemeProvider actually calls the derivation and applies its result,
    // not that the derivation itself is correct (that's
    // avatarPalette.test.ts's job).
    it("derives and applies avatar CSS vars from the custom palette's primary color", () => {
      mockMatchMedia(false) // light
      const customPalette = {
        light: {
          background: '#F8F7FA', foreground: '#160B2E', card: '#FFFFFF', primary: '#4514B8',
          primaryForeground: '#FFFFFF', muted: '#EFEDF5', mutedForeground: '#605B6B',
          accent: '#EFEDF5', border: '#E0DCEC', input: '#E0DCEC',
        },
        dark: {
          background: '#140B2A', foreground: '#EAE6F5', card: '#221240', primary: '#5F2DD4',
          primaryForeground: '#EAE6F5', muted: '#22163A', mutedForeground: '#9D8FBD',
          accent: '#23163F', border: '#2E1D52', input: '#2E1D52',
        },
      }
      render(
        <ThemeProvider colorTheme="custom" customPalette={customPalette}>
          <Consumer />
        </ThemeProvider>,
      )
      const avatar1Bg = document.documentElement.style.getPropertyValue('--avatar-1-bg')
      expect(avatar1Bg).not.toBe('')
      expect(avatar1Bg).not.toBe('#CFEFEA') // must differ from Teal's own — derived toward the custom primary
    })

    // Pepe design review follow-up: preset avatar photos are a fixed Teal
    // duotone baked into the JPGs, so Custom mode must also retint them via
    // the same instance-wide --avatar-photo-filter token the static preset
    // CSS blocks set, computed from the custom primary's hue delta from
    // Teal's own primary.
    it("derives and applies --avatar-photo-filter from the custom palette's primary color", () => {
      mockMatchMedia(false)
      const customPalette = {
        light: {
          background: '#F8F7FA', foreground: '#160B2E', card: '#FFFFFF', primary: '#4514B8',
          primaryForeground: '#FFFFFF', muted: '#EFEDF5', mutedForeground: '#605B6B',
          accent: '#EFEDF5', border: '#E0DCEC', input: '#E0DCEC',
        },
        dark: {
          background: '#140B2A', foreground: '#EAE6F5', card: '#221240', primary: '#5F2DD4',
          primaryForeground: '#EAE6F5', muted: '#22163A', mutedForeground: '#9D8FBD',
          accent: '#23163F', border: '#2E1D52', input: '#2E1D52',
        },
      }
      render(
        <ThemeProvider colorTheme="custom" customPalette={customPalette}>
          <Consumer />
        </ThemeProvider>,
      )
      const filter = document.documentElement.style.getPropertyValue('--avatar-photo-filter')
      expect(filter).not.toBe('')
      expect(filter).toMatch(/^hue-rotate\(-?\d+(\.\d+)?deg\)$/)
    })

    it('clears inline custom-property overrides when switching away from custom', () => {
      mockMatchMedia(false)
      const customPalette = {
        light: {
          background: '#F8F7FA', foreground: '#160B2E', card: '#FFFFFF', primary: '#4514B8',
          primaryForeground: '#FFFFFF', muted: '#EFEDF5', mutedForeground: '#605B6B',
          accent: '#EFEDF5', border: '#E0DCEC', input: '#E0DCEC',
        },
        dark: {
          background: '#140B2A', foreground: '#EAE6F5', card: '#221240', primary: '#5F2DD4',
          primaryForeground: '#EAE6F5', muted: '#22163A', mutedForeground: '#9D8FBD',
          accent: '#23163F', border: '#2E1D52', input: '#2E1D52',
        },
      }
      const { rerender } = render(
        <ThemeProvider colorTheme="custom" customPalette={customPalette}>
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#4514B8')

      rerender(
        <ThemeProvider colorTheme="teal" customPalette={null}>
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
    })

    // Regression guard: --avatar-photo-filter must be cleared alongside
    // every other custom-palette property when switching away from
    // Custom, or a stale hue-rotate leaks into a preset that never sets
    // its own value for this token (Pepe design review finding).
    it('clears --avatar-photo-filter when switching away from custom', () => {
      mockMatchMedia(false)
      const customPalette = {
        light: {
          background: '#F8F7FA', foreground: '#160B2E', card: '#FFFFFF', primary: '#4514B8',
          primaryForeground: '#FFFFFF', muted: '#EFEDF5', mutedForeground: '#605B6B',
          accent: '#EFEDF5', border: '#E0DCEC', input: '#E0DCEC',
        },
        dark: {
          background: '#140B2A', foreground: '#EAE6F5', card: '#221240', primary: '#5F2DD4',
          primaryForeground: '#EAE6F5', muted: '#22163A', mutedForeground: '#9D8FBD',
          accent: '#23163F', border: '#2E1D52', input: '#2E1D52',
        },
      }
      const { rerender } = render(
        <ThemeProvider colorTheme="custom" customPalette={customPalette}>
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.style.getPropertyValue('--avatar-photo-filter')).not.toBe('')

      rerender(
        <ThemeProvider colorTheme="ocean" customPalette={customPalette}>
          <Consumer />
        </ThemeProvider>,
      )
      expect(document.documentElement.style.getPropertyValue('--avatar-photo-filter')).toBe('')
    })
  })
})
