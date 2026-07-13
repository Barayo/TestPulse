import type { components } from '@testpulse/shared/api'

type Status = components['schemas']['Status']

// Single source of truth for status → dot color (redesign-ui design D8).
// pending/retest stay neutral; pass gets the brand teal (doubling as the
// "pass" semantic); failed/blocked get coral, reserved exclusively for this
// semantic; skipped gets its own warn tone at reduced weight, distinct from
// the neutral pending/retest dot.
const dotClass: Record<Status, string> = {
  pending: 'bg-muted-foreground/40',
  pass: 'bg-primary',
  failed: 'bg-destructive',
  skipped: 'bg-secondary/70',
  blocked: 'bg-destructive',
  retest: 'bg-muted-foreground/40',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span data-dot className={`h-2 w-2 rounded-full ${dotClass[status]}`} aria-hidden="true" />
      <span className="tp-label">{status}</span>
    </span>
  )
}
