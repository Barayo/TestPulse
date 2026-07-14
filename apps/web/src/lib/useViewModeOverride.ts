import { useCallback, useState } from 'react'
import type { ViewMode } from '@/lib/viewMode'

// localStorage, not a cookie (design D1, confirmed 2026-07-14): this is a
// pure client-rendered SPA, so no server ever reads this preference — a
// cookie would only add bytes to every API request for nothing.
const STORAGE_KEY = 'testpulse.projectListViewMode'

function readStored(): ViewMode | null {
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === 'expanded' || value === 'compact' ? value : null
}

export function useViewModeOverride(): [ViewMode | null, (mode: ViewMode) => void] {
  const [override, setOverride] = useState<ViewMode | null>(readStored)

  const set = useCallback((mode: ViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, mode)
    setOverride(mode)
  }, [])

  return [override, set]
}
