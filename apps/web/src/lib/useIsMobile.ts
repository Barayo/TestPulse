import { useEffect, useState } from 'react'

// Matches Tailwind's `sm` breakpoint, already used elsewhere in the app —
// below it, the project list always renders compact (design D1).
const MOBILE_QUERY = '(max-width: 640px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
