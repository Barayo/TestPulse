import { useRef, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PaperclipIcon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import type { components } from '@testpulse/shared/api'

type Attachment = components['schemas']['Attachment']

export interface FailedUpload {
  id: string
  filename: string
}

// The independent, comment-agnostic way to attach evidence to a run item
// result (add-run-item-screenshot-attachments follow-up) — its own labeled
// field, its own drop/paste target, deliberately never mentioning Comment
// in its own copy so attaching never reads as requiring one.
export function AttachmentField({
  attachments,
  failed,
  highlightId,
  lastError,
  uploading,
  onSelectFile,
  onRemove,
  onOpenLightbox,
}: {
  attachments: Attachment[]
  failed: FailedUpload[]
  highlightId?: string | null
  lastError: { filename: string; reason: string } | null
  uploading?: boolean
  onSelectFile: (file: File) => void
  onRemove: (id: string) => void
  onOpenLightbox: (index: number) => void
}) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(e.clipboardData.items).find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    const file = imageItem?.getAsFile()
    if (file) onSelectFile(file)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) onSelectFile(file)
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onSelectFile(file)
  }

  const attachedCount = attachments.length
  const failedCount = failed.length
  const hasAny = attachedCount > 0 || failedCount > 0

  return (
    <div className="space-y-1">
      <Label>{t('AttachmentField.attachments')}</Label>
      <div
        role="group"
        aria-label={t('AttachmentField.attachments')}
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
        }}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="cursor-pointer space-y-2 rounded-lg border border-dashed border-input bg-muted/40 p-2.5 focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {hasAny && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((att, i) => (
              <div key={att.id} className="group/thumb relative">
                <button
                  type="button"
                  aria-label={t('AttachmentField.openAttachment', { filename: att.filename })}
                  data-highlighted={highlightId === att.id ? 'true' : undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenLightbox(i)
                  }}
                  className={`size-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted ${
                    highlightId === att.id ? 'ring-2 ring-primary transition-shadow duration-500' : ''
                  }`}
                >
                  <img src={`/api/v1/attachments/${att.id}`} alt="" className="size-full object-cover" />
                </button>
                <button
                  type="button"
                  aria-label={t('AttachmentField.removeAttachment', { filename: att.filename })}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(att.id)
                  }}
                  className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover/thumb:opacity-100"
                >
                  <XIcon className="size-2.5" aria-hidden="true" />
                </button>
              </div>
            ))}
            {failed.map((f) => (
              <div
                key={f.id}
                aria-label={t('AttachmentField.failedToAttach', { filename: f.filename })}
                title={t('AttachmentField.failedToAttach', { filename: f.filename })}
                className="flex size-11 shrink-0 items-center justify-center rounded-md border border-destructive bg-destructive/10"
              >
                <TriangleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PaperclipIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {hasAny ? (
            <span>
              {t('AttachmentField.attachedSummary', { count: attachedCount })}{failedCount > 0 ? t('AttachmentField.failedSummary', { count: failedCount }) : ''} —{' '}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
              >
                {t('AttachmentField.attachAnother')}
              </button>
              {uploading && t('AttachmentField.uploadingSuffix')}
            </span>
          ) : (
            <span>
              {t('AttachmentField.dropHint')}
              {uploading && t('AttachmentField.uploadingSuffix')}
            </span>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={handleFileInputChange}
        />
      </div>

      {lastError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold">{t('AttachmentField.attachFailedTitle')}</p>
            <p className="text-xs text-muted-foreground">
              {lastError.filename} {lastError.reason}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
