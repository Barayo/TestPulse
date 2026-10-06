import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'

// Only id/filename are used, so any attachment-shaped schema (run-result
// Attachment, CaseAttachment, ...) satisfies this without a cast
// (add-case-reference-attachments).
type LightboxAttachment = { id: string; filename: string }

export function Lightbox({
  attachments,
  index,
  onClose,
  onNavigate,
  captionExtra,
  basePath = '/api/v1/attachments',
}: {
  attachments: LightboxAttachment[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
  captionExtra?: string
  basePath?: string
}) {
  const { t } = useTranslation()
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < attachments.length - 1) onNavigate(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, attachments.length, onClose, onNavigate])

  const current = attachments[index]
  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-6">
      <button
        type="button"
        aria-label={t('Lightbox.close')}
        onClick={onClose}
        className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>

      {index > 0 && (
        <button
          type="button"
          aria-label={t('Lightbox.previous')}
          onClick={() => onNavigate(index - 1)}
          className="absolute left-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronLeftIcon className="size-5" aria-hidden="true" />
        </button>
      )}
      {index < attachments.length - 1 && (
        <button
          type="button"
          aria-label={t('Lightbox.next')}
          onClick={() => onNavigate(index + 1)}
          className="absolute right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronRightIcon className="size-5" aria-hidden="true" />
        </button>
      )}

      <img
        src={`${basePath}/${current.id}`}
        alt={current.filename}
        className="max-h-[70vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />

      <p className="text-center text-xs text-white/70">
        {t('Lightbox.counter', { current: index + 1, total: attachments.length })} · {current.filename}
        {captionExtra ? ` · ${captionExtra}` : ''}
      </p>

      {attachments.length > 1 && (
        <div className="flex gap-1.5">
          {attachments.map((att, i) => (
            <button
              key={att.id}
              type="button"
              aria-label={t('Lightbox.showAttachment', { filename: att.filename })}
              aria-current={i === index}
              onClick={() => onNavigate(i)}
              className={`size-9 shrink-0 overflow-hidden rounded border ${
                i === index ? 'border-primary' : 'border-white/20'
              }`}
            >
              <img src={`${basePath}/${att.id}`} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
