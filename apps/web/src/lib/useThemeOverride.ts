import { useCallback, useState } from 'react'
import type { Theme } from '@/lib/theme'

// localStorage, not a cookie (mirrors useViewModeOverride.ts's D1
// reasoning): a pure client-rendered SPA has no server-side reason to
// know a display preference. Absence of the key means "no override, use
// the live OS preference" — the same T | null shape view mode already
// uses.
const STORAGE_KEY = 'testpulse.themeOverride'

function readStored(): Theme | null {
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

export function useThemeOverride(): [Theme | null, (theme: Theme | null) => void] {
  const [override, setOverrideState] = useState<Theme | null>(readStored)

  const setOverride = useCallback((theme: Theme | null) => {
    if (theme) {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    setOverrideState(theme)
  }, [])

  return [override, setOverride]
}
