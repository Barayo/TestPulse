import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { Theme } from '@/lib/theme'
import { useResolvedTheme } from '@/lib/useResolvedTheme'

type ThemeContextValue = [Theme, (theme: Theme | null) => void, Theme | null]

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// Wraps the whole app (add-dark-mode-toggle) so the toggle in UserMenu
// and the class applied to <html> share one resolved theme, not two
// independent instances that drift apart within a session.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useResolvedTheme()
  const [theme] = value

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

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
