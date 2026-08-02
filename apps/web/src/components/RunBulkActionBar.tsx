import { ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RowActionMenu, type RowActionMenuItem } from '@/components/RowActionMenu'

export type BulkAction =
  | { kind: 'button'; label: string; onSelect: () => void }
  | { kind: 'menu'; label: string; items: RowActionMenuItem[] }

type Props = {
  count: number
  actions: BulkAction[]
  onClear: () => void
}

export function RunBulkActionBar({ count, actions, onClear }: Props) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-between rounded-md border bg-accent px-4 py-2.5">
      <span className="text-sm font-medium">{count} selected</span>
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
          Clear
        </Button>
      </div>
    </div>
  )
}
