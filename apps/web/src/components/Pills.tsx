// Shared pill vocabulary (rework-library-ux design.md: one set of primitives
// for both SuiteCaseGrid/CasePicker's filterable case rows and the Library's
// authoring rows, rather than a second, forked pill system). Priority,
// platform, and test-type pills keep the exact flat style already shipped
// on CasePicker; Auto/Manual and Stale are the two variants this change adds.

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
      {priority && <span className="rounded-full bg-muted px-2 py-0.5">{priority}</span>}
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
