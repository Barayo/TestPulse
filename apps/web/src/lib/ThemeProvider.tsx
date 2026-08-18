import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { Theme } from '@/lib/theme'
import { useResolvedTheme } from '@/lib/useResolvedTheme'
import type { CustomPalette, CustomPaletteMode } from '@/lib/useAuth'
import { deriveAvatarPalette, hueRotateDegreesFromTeal } from '@/lib/avatarPalette'

type ThemeContextValue = [Theme, (theme: Theme | null) => void, Theme | null]

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// The 10 admin-editable custom-palette fields, mapped to their CSS custom
// property name, plus the properties derived by copying (design.md:
// popover=card, card-foreground/popover-foreground/accent-foreground=
// foreground, ring/chart-1=primary, sidebar*=mirrors) — mirrors exactly how
// the static preset blocks in index.css relate to each other.
function applyCustomPaletteVars(root: HTMLElement, mode: CustomPaletteMode, modeLabel: 'light' | 'dark') {
  const set = (name: string, value: string) => root.style.setProperty(name, value)
  set('--background', mode.background)
  set('--foreground', mode.foreground)
  set('--card', mode.card)
  set('--card-foreground', mode.foreground)
  set('--popover', mode.card)
  set('--popover-foreground', mode.foreground)
  set('--primary', mode.primary)
  set('--primary-foreground', mode.primaryForeground)
  set('--muted', mode.muted)
  set('--muted-foreground', mode.mutedForeground)
  set('--accent', mode.accent)
  set('--accent-foreground', mode.foreground)
  set('--border', mode.border)
  set('--input', mode.input)
  set('--ring', mode.primary)
  set('--chart-1', mode.primary)
  set('--sidebar', mode.card)
  set('--sidebar-foreground', mode.foreground)
  set('--sidebar-primary', mode.primary)
  set('--sidebar-primary-foreground', mode.primaryForeground)
  set('--sidebar-accent', mode.accent)
  set('--sidebar-accent-foreground', mode.foreground)
  set('--sidebar-border', mode.border)
  set('--sidebar-ring', mode.primary)

  // Avatar identity colors are never admin-authored — derived from this
  // mode's primary color (add-color-theme-customization follow-up), same
  // formula the preset CSS blocks were generated from once at build time.
  // Guaranteed AA contrast regardless of which primary hue the admin
  // picked; see avatarPalette.ts.
  deriveAvatarPalette(mode.primary, modeLabel).forEach(({ background, foreground }, i) => {
    set(`--avatar-${i + 1}-bg`, background)
    set(`--avatar-${i + 1}-fg`, foreground)
  })

  // Retints preset avatar *photos* (fixed Teal duotone baked into the
  // JPGs) the same way the static preset CSS blocks do — a hue-rotate
  // filter, computed live from this custom primary's hue delta from Teal's
  // own (Pepe design review). Never applied to an uploaded custom photo —
  // Avatar.tsx scopes this token to the preset-image branch only.
  set('--avatar-photo-filter', `hue-rotate(${hueRotateDegreesFromTeal(mode.primary, modeLabel)}deg)`)
}

const CUSTOM_PALETTE_PROPERTIES = [
  '--background', '--foreground', '--card', '--card-foreground', '--popover', '--popover-foreground',
  '--primary', '--primary-foreground', '--muted', '--muted-foreground', '--accent', '--accent-foreground',
  '--border', '--input', '--ring', '--chart-1',
  '--sidebar', '--sidebar-foreground', '--sidebar-primary', '--sidebar-primary-foreground',
  '--sidebar-accent', '--sidebar-accent-foreground', '--sidebar-border', '--sidebar-ring',
  '--avatar-1-bg', '--avatar-1-fg', '--avatar-2-bg', '--avatar-2-fg', '--avatar-3-bg', '--avatar-3-fg',
  '--avatar-4-bg', '--avatar-4-fg', '--avatar-5-bg', '--avatar-5-fg', '--avatar-6-bg', '--avatar-6-fg',
  '--avatar-photo-filter',
]

function clearCustomPaletteVars(root: HTMLElement) {
  for (const name of CUSTOM_PALETTE_PROPERTIES) root.style.removeProperty(name)
}

// Wraps the whole app (add-dark-mode-toggle) so the toggle in UserMenu
// and the class applied to <html> share one resolved theme, not two
// independent instances that drift apart within a session. colorTheme/
// customPalette (add-color-theme-customization) come in as props rather
// than via useAuth() directly — ThemeProvider is tested and usable
// standalone (see ThemeProvider.test.tsx), and it sits above AuthProvider
// in the component tree (App.tsx), so it can't consume that context itself.
export function ThemeProvider({
  children,
  colorTheme = 'teal',
  customPalette = null,
}: {
  children: ReactNode
  colorTheme?: string
  customPalette?: CustomPalette | null
}) {
  const value = useResolvedTheme()
  const [theme] = value

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    if (colorTheme === 'custom' && customPalette) {
      root.removeAttribute('data-palette')
      applyCustomPaletteVars(root, theme === 'dark' ? customPalette.dark : customPalette.light, theme)
    } else {
      clearCustomPaletteVars(root)
      if (colorTheme && colorTheme !== 'teal') {
        root.setAttribute('data-palette', colorTheme)
      } else {
        root.removeAttribute('data-palette')
      }
    }
  }, [colorTheme, customPalette, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// Usable without a provider (e.g. isolated component tests) — falls back
// to its own resolution instance rather than requiring every test to wrap
// in ThemeProvider.
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  const fallback = useResolvedTheme()
  return ctx ?? fallback
}
