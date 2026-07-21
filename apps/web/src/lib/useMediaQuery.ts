import { useEffect, useState } from 'react'

// Shared with the sibling change polish-library-page, which needs the same
// 768px breakpoint decision for its tree-pane/content-list split — see both
// changes' design.md. Kept distinct from useIsMobile (640px, a different
// concern: phone-density for ProjectsPage's card grid).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
