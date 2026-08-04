import { useEffect, useState } from 'react'
import type { Theme } from '@/lib/theme'
import { resolveTheme } from '@/lib/theme'
import { useThemeOverride } from '@/lib/useThemeOverride'

const MEDIA_QUERY = '(prefers-color-scheme: dark)'

// Combines the stored override with a live OS-preference listener
// (add-dark-mode-toggle) — a System-mode session updates without a
// reload if the OS theme changes while the tab is open, not just at
// initial load.
export function useResolvedTheme(): [Theme, (theme: Theme | null) => void, Theme | null] {
  const [override, setOverride] = useThemeOverride()
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(MEDIA_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(MEDIA_QUERY)
    const handler = (e: { matches: boolean }) => setPrefersDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return [resolveTheme(override, prefersDark), setOverride, override]
}
