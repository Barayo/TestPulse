import type { ReactNode } from 'react'

export function PropertyRow({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty = value === '' || value === null || value === undefined
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="tp-label">{label}</span>
      <span className="truncate text-sm">{isEmpty ? '—' : value}</span>
    </div>
  )
}
