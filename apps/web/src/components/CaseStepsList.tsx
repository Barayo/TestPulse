import type { ReactNode } from 'react'
import { ListChecksIcon, Trash2Icon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { components } from '@testpulse/shared/api'

type Step = components['schemas']['Step']

// Read-only steps rendering, shared by CaseDetailPage (the current
// version, editable elsewhere on that page) and RunItemDetailPage (a
// pinned, historical version — never editable). Deliberately takes no
// case-mutation callbacks; the optional emptyStateAction lets a caller
// offer its own CTA (or none, for a read-only context like a run item).
//
// Passing `onChange` switches this into an in-place editable variant —
// same Card/circle/expected-callout shell, but Textareas in place of
// static text (add-case-authoring-formats: editing should feel like the
// read view became editable, not like a different form appeared).
export function CaseStepsList({
  steps,
  emptyStateAction,
  onChange,
}: {
  steps: Step[] | undefined
  emptyStateAction?: ReactNode
  onChange?: (steps: Step[]) => void
}) {
  const editable = Boolean(onChange)
  const list = steps ?? []

  if (list.length === 0 && !editable) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <ListChecksIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 text-sm font-medium">No steps yet</p>
        <p className="mb-4 text-sm text-muted-foreground">Add steps to describe how to run this test.</p>
        {emptyStateAction}
      </div>
    )
  }

  function update(i: number, field: keyof Step, value: string) {
    onChange?.(list.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }
  function remove(i: number) {
    onChange?.(list.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange?.([...list, { action: '', expected: '' }])
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ol className="list-none">
          {list.map((s, i) => (
            <li key={i} className="flex gap-3 border-b px-(--card-spacing) py-4 last:border-b-0">
              <span
                data-testid={`step-number-${i}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="flex-1 space-y-2 pt-0.5">
                {editable ? (
                  <Textarea
                    aria-label={`Action for step ${i + 1}`}
                    value={s.action}
                    onChange={(e) => update(i, 'action', e.target.value)}
                    placeholder="Action…"
                    className="text-base font-medium leading-relaxed"
                  />
                ) : (
                  <p className="text-base font-medium leading-relaxed">{s.action}</p>
                )}
                {editable ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                    <span className="tp-label mb-1 block text-primary">Expected:</span>
                    <Textarea
                      aria-label={`Expected result for step ${i + 1}`}
                      value={s.expected ?? ''}
                      onChange={(e) => update(i, 'expected', e.target.value)}
                      placeholder="Expected result…"
                      className="bg-transparent text-base leading-relaxed"
                    />
                  </div>
                ) : (
                  s.expected && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                      <p className="text-base leading-relaxed text-foreground">
                        <span className="tp-label mr-1.5 text-primary">Expected:</span>
                        {s.expected}
                      </p>
                    </div>
                  )
                )}
              </div>
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove step ${i + 1}`}
                  className="shrink-0 self-start pt-1.5 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                >
                  <Trash2Icon className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ol>
        {editable && (
          <div className="px-(--card-spacing) py-3">
            <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={add}>
              + Add step
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
