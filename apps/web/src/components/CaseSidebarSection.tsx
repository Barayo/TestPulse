import type { ReactNode } from 'react'
import { useMediaQuery } from '@/lib/useMediaQuery'

export function CaseSidebarSection({ title, children }: { title: string; children: ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  if (isDesktop) {
    return (
      <div className="space-y-2 border-b pb-4 last:border-b-0">
        <p className="panel-title text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
        {children}
      </div>
    )
  }

  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{title}</summary>
      <div className="space-y-2 border-t px-3 py-2">{children}</div>
    </details>
  )
}
