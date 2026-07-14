import { useCallback, useState } from 'react'
import { DEFAULT_SORT_DIRECTION, type SortDirection, type SortKey } from '@/lib/sortProjects'

export type SortState = { key: SortKey; direction: SortDirection }

// localStorage, same rationale as useViewModeOverride (design D1,
// enrich-project-list): a pure client-rendered SPA, no server ever reads
// this preference.
const STORAGE_KEY = 'testpulse.projectListSort'
const DEFAULT_STATE: SortState = { key: 'name', direction: DEFAULT_SORT_DIRECTION.name }

function readStored(): SortState {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_STATE
  try {
    const parsed = JSON.parse(raw) as SortState
    if (parsed && typeof parsed.key === 'string' && typeof parsed.direction === 'string') {
      return parsed
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_STATE
}

export function useSortOverride(): [SortState, (state: SortState) => void] {
  const [state, setState] = useState<SortState>(readStored)

  const set = useCallback((next: SortState) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setState(next)
  }, [])

  return [state, set]
}
