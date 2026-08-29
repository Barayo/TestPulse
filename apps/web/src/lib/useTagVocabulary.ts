import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useDataRevision } from '@/lib/DataRevision'

// The full shared project-tag vocabulary (add-project-tags), for the tag
// picker's autocomplete — refetched whenever data changes elsewhere (e.g.
// another project assigns a genuinely new tag) via the same DataRevision
// bump other hooks in this app already key off.
export function useTagVocabulary(): string[] {
  const dataRevision = useDataRevision()
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void api
      .GET('/api/v1/tags')
      .then(({ data }) => {
        if (!cancelled) setNames(data ?? [])
      })
      .catch(() => {
        if (!cancelled) setNames([])
      })
    return () => {
      cancelled = true
    }
  }, [dataRevision])

  return names
}
