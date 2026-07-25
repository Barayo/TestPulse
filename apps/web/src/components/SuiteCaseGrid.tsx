import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PRIORITIES, type Priority } from '@/components/ClassificationEditor'

export type SuiteCaseGridCase = {
  id: string
  title: string
  tags: string[]
  priority: Priority | ''
  platform: string
  testType: string
}

type Filters = {
  tag: string
  priority: string
  platform: string
  testType: string
}

const EMPTY_FILTERS: Filters = { tag: '', priority: '', platform: '', testType: '' }

function distinctValues(cases: SuiteCaseGridCase[], pick: (c: SuiteCaseGridCase) => string) {
  const values = new Set<string>()
  for (const c of cases) {
    const v = pick(c)
    if (v) values.add(v)
  }
  return Array.from(values).sort()
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function matches(c: SuiteCaseGridCase, filters: Filters) {
  return (
    (!filters.tag || c.tags.includes(filters.tag)) &&
    (!filters.priority || c.priority === filters.priority) &&
    (!filters.platform || c.platform === filters.platform) &&
    (!filters.testType || c.testType === filters.testType)
  )
}

// Design decision (rework-suite-membership-ux design.md): one shared
// component drives both suite creation and membership editing. Instead of
// an internal 'create' | 'edit' mode branch, the parent fully controls the
// commit affordance (label/disabled/handler) — the grid only ever renders
// filters + rows + a selection count + whatever commit button it's told to.
export function SuiteCaseGrid({
  cases,
  selected,
  onToggle,
  commitLabel,
  commitDisabled,
  onCommit,
}: {
  cases: SuiteCaseGridCase[]
  selected: Set<string>
  onToggle: (caseId: string) => void
  commitLabel: string
  commitDisabled: boolean
  onCommit: () => void
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const tagOptions = useMemo(() => {
    const values = new Set<string>()
    for (const c of cases) for (const t of c.tags) values.add(t)
    return Array.from(values).sort()
  }, [cases])
  const platformOptions = useMemo(() => distinctValues(cases, (c) => c.platform), [cases])
  const testTypeOptions = useMemo(() => distinctValues(cases, (c) => c.testType), [cases])

  const visible = useMemo(() => cases.filter((c) => matches(c, filters)), [cases, filters])
  const anyFilterActive = filters.tag || filters.priority || filters.platform || filters.testType

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <select
          aria-label="Tag"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.tag}
          onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
        >
          <option value="">All tags</option>
          {tagOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.priority}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label="Platform"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.platform}
          onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
        >
          <option value="">All platforms</option>
          {platformOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <select
          aria-label="Test type"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={filters.testType}
          onChange={(e) => setFilters((f) => ({ ...f, testType: e.target.value }))}
        >
          <option value="">All test types</option>
          {testTypeOptions.map((v) => (
            <option key={v} value={v}>
              {capitalize(v)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-sm font-medium text-primary underline underline-offset-2 disabled:text-muted-foreground disabled:no-underline"
          disabled={!anyFilterActive}
          onClick={() => setFilters(EMPTY_FILTERS)}
        >
          Clear filters
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{visible.length}</span> of {cases.length} cases
      </p>

      <div className="max-h-96 overflow-y-auto rounded-md border">
        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">No cases match these filters</p>
            <p>Try a different combination, or clear the filters to see all cases.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-accent">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(c.id)}
                    onChange={() => onToggle(c.id)}
                    aria-label={c.title}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">{c.title}</span>
                    <span className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5">
                          {t}
                        </span>
                      ))}
                      {c.priority && <span className="rounded-full bg-muted px-2 py-0.5">{c.priority}</span>}
                      {c.platform && <span className="rounded-full bg-muted px-2 py-0.5">{c.platform}</span>}
                      {c.testType && <span className="rounded-full bg-muted px-2 py-0.5">{c.testType}</span>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border bg-accent px-4 py-2.5">
        <span className="text-sm font-medium">
          {selected.size === 0 ? 'No cases selected' : `${selected.size} selected`}
        </span>
        <Button type="button" disabled={commitDisabled} onClick={onCommit}>
          {commitLabel}
        </Button>
      </div>
    </div>
  )
}
