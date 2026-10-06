import { ChevronDownIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { RowActionMenu } from '@/components/RowActionMenu'
import { type BulkAction } from '@/components/RunBulkActionBar'

type Props = {
  count: number
  total: number
  onSelectAll: () => void
  actions: BulkAction[]
  onClear: () => void
}

// A new component rather than a reuse of RunBulkActionBar (design.md D5) —
// that bar is styled to sit inline at the top of a list; this one floats
// over the viewport (ConfirmBanner.tsx's elevated-toast idiom) and adds a
// "Select all" link RunBulkActionBar has no need for.
export function LibraryBulkActionBar({ count, total, onSelectAll, actions, onClear }: Props) {
  const { t } = useTranslation()
  if (count === 0) return null
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3.5 shadow-lg ring-1 ring-foreground/10 sm:inset-x-6">
      <span className="flex items-center gap-3 text-sm">
        <span className="font-medium">{t('LibraryBulkActionBar.selectedCount', { count })}</span>
        {count < total && (
          <Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>
            {t('LibraryBulkActionBar.selectAll', { total })}
          </Button>
        )}
      </span>
      <div className="flex items-center gap-2">
        {actions.map((action) =>
          action.kind === 'menu' ? (
            <RowActionMenu
              key={action.label}
              label={action.label}
              items={action.items}
              trigger={
                <>
                  {action.label}
                  <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                </>
              }
            />
          ) : (
            <Button key={action.label} type="button" size="sm" variant="outline" onClick={action.onSelect}>
              {action.label}
            </Button>
          ),
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          {t('LibraryBulkActionBar.clear')}
        </Button>
      </div>
    </div>
  )
}
