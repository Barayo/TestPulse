import { Loader2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

// add-cursor-pagination: one shared "Load more" control for every
// cursor-paginated list surface, approved by Pepe's design pass. Extends
// the existing centered outline/sm Button idiom RunsListTriage.tsx already
// used for its own local "Show N more" reveals — wired to a real
// nextCursor fetch instead of a client-side slice. Copy is deliberately
// count-less (a cursor can't report how many items remain).
export interface LoadMoreButtonProps {
  hasMore: boolean
  loading: boolean
  onClick: () => void
  label?: string
}

export function LoadMoreButton({ hasMore, loading, onClick, label }: LoadMoreButtonProps) {
  const { t } = useTranslation()
  if (!hasMore) return null
  const resolvedLabel = label ?? t('LoadMoreButton.defaultLabel')
  return (
    <div className="flex justify-center pt-2">
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onClick}>
        {loading ? (
          <>
            <Loader2Icon className="animate-spin" aria-hidden="true" />
            {t('LoadMoreButton.loadingLabel')}
          </>
        ) : (
          resolvedLabel
        )}
      </Button>
    </div>
  )
}
