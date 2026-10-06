import { useTranslation } from 'react-i18next'
import { ChevronRightIcon } from 'lucide-react'
import { dotClass } from '@/components/StatusBadge'
import type { components } from '@testpulse/shared/api'

type StepResult = components['schemas']['StepResult']

// A single result's immutable step-verdict snapshot, shown per entry in
// the results history (add-step-level-results) — distinct from
// ExecutionStepsList's live/carry-forward marks. Reuses the same
// <details>/<summary> disclosure idiom CaseSidebarSection already uses
// rather than a new expand/collapse widget. Renders nothing when the
// result has no marked steps (recorded before this capability existed, or
// without touching any step) — no "0/N steps marked" noise.
export function StepSnapshotSummary({ stepResults, totalSteps }: { stepResults: StepResult[]; totalSteps: number }) {
  const { t } = useTranslation()
  if (stepResults.length === 0) return null

  const byIndex = new Map(stepResults.map((s) => [s.stepIndex, s.verdict]))
  const failedCount = stepResults.filter((s) => s.verdict === 'failed').length
  const blockedCount = stepResults.filter((s) => s.verdict === 'blocked').length

  const parts = [t('StepSnapshotSummary.stepsMarked', { marked: stepResults.length, total: totalSteps })]
  if (failedCount > 0) parts.push(t('StepSnapshotSummary.failedCount', { count: failedCount }))
  if (blockedCount > 0) parts.push(t('StepSnapshotSummary.blockedCount', { count: blockedCount }))

  return (
    <details className="group mt-0.5">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-3 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
        {parts.join(' · ')}
      </summary>
      <div className="mt-1.5 ml-4 space-y-1 rounded-lg bg-muted/70 px-2.5 py-2">
        {Array.from({ length: totalSteps }, (_, i) => i).map((i) => {
          const verdict = byIndex.get(i)
          return (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{t('StepSnapshotSummary.stepLabel', { index: i + 1 })}</span>
              {verdict ? (
                <span className="inline-flex items-center gap-1 font-semibold capitalize">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass[verdict]}`} aria-hidden="true" />
                  {verdict}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}
