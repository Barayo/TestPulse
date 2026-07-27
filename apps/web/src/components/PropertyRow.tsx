import type { ReactNode } from 'react'

export function PropertyRow({ label, value, wrap }: { label: string; value: ReactNode; wrap?: boolean }) {
  const isEmpty = value === '' || value === null || value === undefined
  return (
    <div className={wrap ? 'flex items-start justify-between gap-3 py-1.5' : 'flex items-baseline justify-between gap-3 py-1.5'}>
      <span className="tp-label shrink-0">{label}</span>
      <span className={wrap ? 'flex flex-wrap items-center justify-end gap-1.5 text-sm' : 'truncate text-sm'}>
        {isEmpty ? '—' : value}
      </span>
    </div>
  )
}
