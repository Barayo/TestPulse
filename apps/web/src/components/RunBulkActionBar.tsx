import { Button } from '@/components/ui/button'

export type BulkAction = { label: string; onSelect: () => void }

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
        {actions.map((action) => (
          <Button key={action.label} type="button" size="sm" variant="outline" onClick={action.onSelect}>
            {action.label}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  )
}
