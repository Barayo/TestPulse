// Shared pill vocabulary (rework-library-ux design.md: one set of primitives
// for both SuiteCaseGrid/CasePicker's filterable case rows and the Library's
// authoring rows, rather than a second, forked pill system). Priority,
// platform, and test-type pills keep the exact flat style already shipped
// on CasePicker; Auto/Manual and Stale are the two variants this change adds.

// Priority is a severity scale, not an arbitrary enum — tint it with the
// app's existing status bands (healthy/progress/risk have no "low" rung, so
// low borrows the neutral band) rather than the flat gray every other
// classification pill uses. Critical reuses the exact bg-destructive/10
// tint FolderExplorerPage's critical-count pill already established, not a
// new hue.
const PRIORITY_TINT: Record<string, string> = {
  low: 'bg-status-neutral-bg text-status-neutral-fg',
  medium: 'bg-status-progress-bg text-status-progress-fg',
  high: 'bg-status-risk-bg text-status-risk-fg',
  critical: 'bg-destructive/10 text-destructive',
}

export function ClassificationPills({
  priority,
  platform,
  testType,
}: {
  priority?: string
  platform?: string
  testType?: string
}) {
  return (
    <>
      {priority && (
        <span className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_TINT[priority] ?? 'bg-muted'}`}>
          {priority}
        </span>
      )}
      {platform && <span className="rounded-full bg-muted px-2 py-0.5">{platform}</span>}
      {testType && <span className="rounded-full bg-muted px-2 py-0.5">{testType}</span>}
    </>
  )
}

export function AutomationPill({ automated }: { automated: boolean }) {
  return automated ? (
    <span className="rounded-full bg-accent px-2 py-0.5 text-primary">Auto</span>
  ) : (
    <span className="rounded-full border border-input px-2 py-0.5 text-muted-foreground">Manual</span>
  )
}

// Amber "needs attention, not broken" tokens, reused from Suites' own
// status vocabulary for a different meaning (design.md) — Library has no
// execution context of its own to justify a new semantic tint.
export function StalePill() {
  return <span className="rounded-full bg-status-progress-bg px-2 py-0.5 text-status-progress-fg">Stale</span>
}

export function tagPills(tags: string[]) {
  const shown = tags.slice(0, 2)
  const overflow = tags.length - shown.length
  return (
    <>
      {shown.map((t) => (
        <span key={t} className="rounded-full bg-muted px-2 py-0.5">
          {t}
        </span>
      ))}
      {overflow > 0 && <span className="rounded-full bg-muted px-2 py-0.5">+{overflow}</span>}
    </>
  )
}

export function distinctValues<T>(items: T[], pick: (item: T) => string): string[] {
  const values = new Set<string>()
  for (const item of items) {
    const v = pick(item)
    if (v) values.add(v)
  }
  return Array.from(values).sort()
}
