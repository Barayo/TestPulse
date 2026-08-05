import { useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import type { components } from '@testpulse/shared/api'

type Attachment = components['schemas']['Attachment']

export function Lightbox({
  attachments,
  index,
  onClose,
  onNavigate,
  captionExtra,
}: {
  attachments: Attachment[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
  captionExtra?: string
}) {
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
        aria-label="Close"
        onClick={onClose}
        className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>

      {index > 0 && (
        <button
          type="button"
          aria-label="Previous"
          onClick={() => onNavigate(index - 1)}
          className="absolute left-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronLeftIcon className="size-5" aria-hidden="true" />
        </button>
      )}
      {index < attachments.length - 1 && (
        <button
          type="button"
          aria-label="Next"
          onClick={() => onNavigate(index + 1)}
          className="absolute right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronRightIcon className="size-5" aria-hidden="true" />
        </button>
      )}

      <img
        src={`/api/v1/attachments/${current.id}`}
        alt={current.filename}
        className="max-h-[70vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />

      <p className="text-center text-xs text-white/70">
        {index + 1} of {attachments.length} · {current.filename}
        {captionExtra ? ` · ${captionExtra}` : ''}
      </p>

      {attachments.length > 1 && (
        <div className="flex gap-1.5">
          {attachments.map((att, i) => (
            <button
              key={att.id}
              type="button"
              aria-label={`Show ${att.filename}`}
              aria-current={i === index}
              onClick={() => onNavigate(i)}
              className={`size-9 shrink-0 overflow-hidden rounded border ${
                i === index ? 'border-primary' : 'border-white/20'
              }`}
            >
              <img src={`/api/v1/attachments/${att.id}`} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
