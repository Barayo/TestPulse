import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// A cheap cross-component invalidation signal: pages that mutate data (a
// suite, a case's folder, ...) call bump() so the sidebar's independent
// fetch of the same project's data re-runs, without lifting all that state
// up or duplicating fetches inline.
type DataRevisionContextValue = { revision: number; bump: () => void }

const DataRevisionContext = createContext<DataRevisionContextValue | undefined>(undefined)

export function DataRevisionProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0)
  const bump = useCallback(() => setRevision((r) => r + 1), [])
  return (
    <DataRevisionContext.Provider value={{ revision, bump }}>
      {children}
    </DataRevisionContext.Provider>
  )
}

function useDataRevisionContext(): DataRevisionContextValue {
  const ctx = useContext(DataRevisionContext)
  if (!ctx) return { revision: 0, bump: () => {} } // usable without a provider (e.g. isolated page tests)
  return ctx
}

export function useDataRevision(): number {
  return useDataRevisionContext().revision
}

export function useBumpDataRevision(): () => void {
  return useDataRevisionContext().bump
}
