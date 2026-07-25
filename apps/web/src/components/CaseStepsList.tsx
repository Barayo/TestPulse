import type { ReactNode } from 'react'
import { ListChecksIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type Step = components['schemas']['Step']

// Read-only steps rendering, shared by CaseDetailPage (the current
// version, editable elsewhere on that page) and RunItemDetailPage (a
// pinned, historical version — never editable). Deliberately takes no
// case-mutation callbacks; the optional emptyStateAction lets a caller
// offer its own CTA (or none, for a read-only context like a run item).
export function CaseStepsList({
  steps,
  emptyStateAction,
}: {
  steps: Step[] | undefined
  emptyStateAction?: ReactNode
}) {
  if (!steps?.length) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <ListChecksIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 text-sm font-medium">No steps yet</p>
        <p className="mb-4 text-sm text-muted-foreground">Add steps to describe how to run this test.</p>
        {emptyStateAction}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ol className="list-none">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 border-b px-(--card-spacing) py-4 last:border-b-0">
              <span
                data-testid={`step-number-${i}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="space-y-2 pt-0.5">
                <p className="text-base font-medium leading-relaxed">{s.action}</p>
                {s.expected && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                    <p className="text-base leading-relaxed text-foreground">
                      <span className="tp-label mr-1.5 text-primary">Expected:</span>
                      {s.expected}
                    </p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
