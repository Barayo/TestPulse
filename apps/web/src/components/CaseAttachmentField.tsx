import { useRef, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FileTextIcon, Loader2Icon, PaperclipIcon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { PropertyRow } from '@/components/PropertyRow'
import type { FailedUpload } from '@/components/AttachmentField'
import type { components } from '@testpulse/shared/api'

type CaseAttachment = components['schemas']['CaseAttachment']

function isImage(att: CaseAttachment): boolean {
  return att.contentType.startsWith('image/')
}

// The case-level counterpart to AttachmentField — reference material
// attached to a case's identity, not run-result evidence
// (add-case-reference-attachments). Images render as thumbnails; every
// other accepted type (PDF, .txt, .log) renders as a filename+icon chip
// that opens in a new tab — no thumbnail generation for non-image files
// (design.md Non-Goals: PDF thumbnails were considered and rejected).
export function CaseAttachmentField({
  attachments,
  failed,
  lastError,
  uploading,
  canEdit,
  onSelectFile,
  onRemove,
  onOpenLightbox,
}: {
  attachments: CaseAttachment[]
  failed: FailedUpload[]
  lastError: { filename: string; reason: string } | null
  uploading?: boolean
  canEdit: boolean
  onSelectFile: (file: File) => void
  onRemove: (id: string) => void
  onOpenLightbox: (index: number) => void
}) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // add-case-reference-attachments spec.md: a case with zero attachments
  // renders exactly as before this capability existed — the whole row,
  // label included, only exists when there's something to show or an
  // editor who could add something.
  if (!canEdit && attachments.length === 0 && failed.length === 0) return null

  const imageAttachments = attachments.filter(isImage)
  const imageIndexById = new Map(imageAttachments.map((a, i) => [a.id, i]))
  const hasAny = attachments.length > 0 || failed.length > 0

  function handlePaste(e: ClipboardEvent<HTMLSpanElement>) {
    const fileItem = Array.from(e.clipboardData.items).find(
      (i) => i.kind === 'file' && (i.type.startsWith('image/') || i.type === 'application/pdf' || i.type === 'text/plain'),
    )
    const file = fileItem?.getAsFile()
    if (file) onSelectFile(file)
  }
  function handleDragOver(e: DragEvent<HTMLSpanElement>) {
    e.preventDefault()
  }
  function handleDrop(e: DragEvent<HTMLSpanElement>) {
    e.preventDefault()
    const file = Array.from(e.dataTransfer.files)[0]
    if (file) onSelectFile(file)
  }
  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onSelectFile(file)
  }

  return (
    <div>
      <PropertyRow
        label={t('CaseAttachmentField.attachments')}
        value={
          <span
            role="group"
            aria-label={t('CaseAttachmentField.attachments')}
            tabIndex={canEdit ? 0 : undefined}
            onPaste={canEdit ? handlePaste : undefined}
            onDragOver={canEdit ? handleDragOver : undefined}
            onDrop={canEdit ? handleDrop : undefined}
            className="flex flex-wrap items-center justify-end gap-1.5 rounded-md text-sm focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {!hasAny && canEdit && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                <PaperclipIcon className="size-3.5" aria-hidden="true" />
                {t('CaseAttachmentField.attachReferenceFile')}
              </button>
            )}

            {attachments.map((att) =>
              isImage(att) ? (
                <div key={att.id} className="group/thumb relative">
                  <button
                    type="button"
                    aria-label={t('CaseAttachmentField.openAttachment', { filename: att.filename })}
                    onClick={() => onOpenLightbox(imageIndexById.get(att.id)!)}
                    className="size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img src={`/api/v1/case-attachments/${att.id}`} alt="" className="size-full object-cover" />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={t('CaseAttachmentField.removeAttachment', { filename: att.filename })}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(att.id)
                      }}
                      className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover/thumb:opacity-100"
                    >
                      <XIcon className="size-2.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ) : (
                <div key={att.id} className="group/thumb relative">
                  <a
                    href={`/api/v1/case-attachments/${att.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('CaseAttachmentField.openFile', { filename: att.filename })}
                    className="flex h-9 max-w-32 shrink-0 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-muted px-2 text-xs"
                  >
                    <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{att.filename}</span>
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={t('CaseAttachmentField.removeAttachment', { filename: att.filename })}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(att.id)
                      }}
                      className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover/thumb:opacity-100"
                    >
                      <XIcon className="size-2.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ),
            )}

            {failed.map((f) => (
              <div
                key={f.id}
                aria-label={t('CaseAttachmentField.failedToAttach', { filename: f.filename })}
                title={t('CaseAttachmentField.failedToAttach', { filename: f.filename })}
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-destructive bg-destructive/10"
              >
                <TriangleAlertIcon className="size-4 text-destructive" aria-hidden="true" />
              </div>
            ))}

            {hasAny && canEdit && (
              <button
                type="button"
                aria-label={uploading ? t('CaseAttachmentField.uploading') : t('CaseAttachmentField.attachAnotherFile')}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <PaperclipIcon className="size-3.5" aria-hidden="true" />
                )}
              </button>
            )}

            {canEdit && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt,.log"
                className="hidden"
                onChange={handleFileInputChange}
              />
            )}
          </span>
        }
        wrap
      />
      {lastError && (
        <p className="pb-1 text-right text-[11px] text-destructive">
          {lastError.filename} {lastError.reason}
        </p>
      )}
    </div>
  )
}
