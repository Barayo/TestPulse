import type { components } from '@testpulse/shared/api'

type Status = components['schemas']['Status']

// Single source of truth for status → dot color (redesign-ui design D8).
// pending/retest stay neutral; pass gets the brand teal (doubling as the
// "pass" semantic); failed/blocked get coral, reserved exclusively for this
// semantic; skipped gets its own warn tone at reduced weight, distinct from
// the neutral pending/retest dot.
// pending/retest's dot needs a dark-mode-only bump: bg-muted-foreground/40
// measures only 2.1-2.4:1 against --card in the dark palette — under WCAG's
// 3:1 non-text minimum. --muted-foreground itself is fine as body text
// elsewhere (5.6:1+), so the fix has to be local to the dot rather than a
// token change that would overshoot other usages (add-dark-mode-toggle).
const PENDING_DOT = 'bg-muted-foreground/40 dark:bg-muted-foreground/60'

export const dotClass: Record<Status, string> = {
  pending: PENDING_DOT,
  pass: 'bg-primary',
  failed: 'bg-destructive',
  skipped: 'bg-secondary/70',
  blocked: 'bg-destructive',
  retest: PENDING_DOT,
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span data-dot className={`h-2 w-2 rounded-full ${dotClass[status]}`} aria-hidden="true" />
      <span className="tp-label">{status}</span>
    </span>
  )
}
