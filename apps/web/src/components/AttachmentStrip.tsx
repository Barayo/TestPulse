import { useTranslation } from 'react-i18next'
import type { components } from '@testpulse/shared/api'

type Attachment = components['schemas']['Attachment']

// Supporting evidence for one verdict, not a browsable gallery — a compact
// strip beats an inline grid (add-run-item-screenshot-attachments, Pepe
// review). Overflow collapses into a single "+N" tile rather than growing
// unboundedly.
const MAX_VISIBLE = 3

export function AttachmentStrip({
  attachments,
  onSelect,
}: {
  attachments: Attachment[]
  onSelect: (index: number) => void
}) {
  const { t } = useTranslation()
  if (attachments.length === 0) return null

  const visible = attachments.slice(0, MAX_VISIBLE)
  const overflow = attachments.length - MAX_VISIBLE

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((att, i) => (
        <button
          key={att.id}
          type="button"
          aria-label={t('AttachmentStrip.openAttachment', { filename: att.filename })}
          onClick={() => onSelect(i)}
          className="size-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
        >
          <img src={`/api/v1/attachments/${att.id}`} alt="" className="size-full object-cover" />
        </button>
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => onSelect(MAX_VISIBLE)}
          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          +{overflow}
        </button>
      )}
    </div>
  )
}
