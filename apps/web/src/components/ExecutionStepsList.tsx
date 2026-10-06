import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { components } from '@testpulse/shared/api'

type Step = components['schemas']['Step']
type StepResult = components['schemas']['StepResult']
type Verdict = components['schemas']['Verdict']

// Reuses the exact p/f/b/s letters RunItemDetailPage's own keyboard-
// shortcuts hint already teaches (for the overall verdict), rather than
// inventing new icons/vocabulary — approved design (Pepe mock,
// add-step-level-results).
function verdictLetters(t: TFunction): { verdict: Verdict; letter: string; label: string }[] {
  return [
    { verdict: 'pass', letter: 'P', label: t('ExecutionStepsList.passLabel') },
    { verdict: 'failed', letter: 'F', label: t('ExecutionStepsList.failLabel') },
    { verdict: 'blocked', letter: 'B', label: t('ExecutionStepsList.blockedLabel') },
    { verdict: 'skipped', letter: 'S', label: t('ExecutionStepsList.skippedLabel') },
  ]
}

// Color tokens reused verbatim from elsewhere in the app: pass matches
// CaseStepsList's own step-number badge tint; fail and blocked match the
// destructive tint StatusBadge already gives both identically; skip
// matches CaseStepsList's existing "stale"-badge secondary tint.
const ACTIVE_CLASS: Record<Verdict, string> = {
  pass: 'bg-primary/15 text-primary shadow-sm',
  failed: 'bg-destructive/15 text-destructive shadow-sm',
  blocked: 'bg-destructive/15 text-destructive shadow-sm',
  skipped: 'bg-secondary/40 text-secondary-foreground shadow-sm',
}

// Execution-only steps rendering for RunItemDetailPage — deliberately
// separate from CaseStepsList (which already carries view/editable/bare
// modes and step-group insert/extract logic) rather than a fourth mode
// bolted onto an already-dense shared component. Steps are addressed by
// their flat array index (add-step-level-results design.md) — a step
// that's part of a resolved shared-group block needs no special casing
// here, since the pinned content.steps array is already flat by the time
// execution sees it.
export function ExecutionStepsList({
  steps,
  stepStates,
  onMark,
}: {
  steps: Step[]
  stepStates: StepResult[]
  onMark: (stepIndex: number, verdict: Verdict) => void
}) {
  const { t } = useTranslation()
  if (steps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <p className="text-sm font-medium">{t('ExecutionStepsList.noStepsYetMessage')}</p>
      </div>
    )
  }

  const activeByIndex = new Map(stepStates.map((s) => [s.stepIndex, s.verdict]))

  return (
    <div className="rounded-xl border">
      <ol className="list-none">
        {steps.map((s, i) => {
          const active = activeByIndex.get(i)
          return (
            <li key={i} className="flex items-start gap-3 border-b px-4 py-4 last:border-b-0">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="flex-1 space-y-2 pt-0.5">
                <p className="text-base font-medium leading-relaxed">{s.action}</p>
                {s.expected && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                    <p className="text-base leading-relaxed text-foreground">
                      <span className="tp-label mr-1.5 text-primary">{t('ExecutionStepsList.expectedLabel')}</span>
                      {s.expected}
                    </p>
                  </div>
                )}
              </div>
              <div
                role="group"
                aria-label={t('ExecutionStepsList.markStepResultAriaLabel', { number: i + 1 })}
                className="flex shrink-0 items-center gap-0.5 self-start rounded-full bg-muted/70 p-0.5"
              >
                {verdictLetters(t).map(({ verdict, letter, label }) => (
                  <button
                    key={verdict}
                    type="button"
                    aria-label={t('ExecutionStepsList.markStepAsAriaLabel', { number: i + 1, label })}
                    aria-pressed={active === verdict}
                    onClick={() => onMark(i, verdict)}
                    className={`flex size-6 items-center justify-center rounded-full font-mono text-[11px] font-extrabold transition-colors ${
                      active === verdict
                        ? ACTIVE_CLASS[verdict]
                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                    }`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
