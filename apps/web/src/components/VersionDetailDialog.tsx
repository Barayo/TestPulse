import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { components } from '@testpulse/shared/api'

type CaseVersion = components['schemas']['CaseVersion']
type CaseExecution = components['schemas']['CaseExecution']
type CaseContent = components['schemas']['CaseContent']
type Step = components['schemas']['Step']

// Reuses CaseResultsPanel's verdict semantics — no new status vocabulary.
const VERDICT_COLOR: Record<string, string> = {
  pass: 'var(--chart-1)',
  skipped: 'var(--chart-2)',
  failed: 'var(--chart-3)',
  blocked: 'var(--chart-3)',
  pending: 'var(--muted-foreground)',
  retest: 'var(--muted-foreground)',
}

type ScalarField = { label: string; get: (c: CaseContent) => string }

const SCALAR_FIELDS: ScalarField[] = [
  { label: 'Title', get: (c) => c.title },
  { label: 'Description', get: (c) => c.description ?? '' },
  { label: 'Expected result', get: (c) => c.expectedResult ?? '' },
  { label: 'Priority', get: (c) => c.priority ?? '' },
  { label: 'Tags', get: (c) => (c.tags ?? []).join(', ') },
  { label: 'Platform', get: (c) => c.platform ?? '' },
  { label: 'Test type', get: (c) => c.testType ?? '' },
  { label: 'Automated', get: (c) => (c.automated ? 'Yes' : 'No') },
]

type FieldDiff = { label: string; before: string; after: string }
type StepDiff = { index: number; kind: 'added' | 'removed' | 'changed'; before?: Step; after?: Step }

function diffContent(before: CaseContent, after: CaseContent): { fields: FieldDiff[]; steps: StepDiff[] } {
  const fields = SCALAR_FIELDS.filter((f) => f.get(before) !== f.get(after)).map((f) => ({
    label: f.label,
    before: f.get(before),
    after: f.get(after),
  }))

  const beforeSteps = before.steps ?? []
  const afterSteps = after.steps ?? []
  const steps: StepDiff[] = []
  const maxLen = Math.max(beforeSteps.length, afterSteps.length)
  for (let i = 0; i < maxLen; i++) {
    const b = beforeSteps[i]
    const a = afterSteps[i]
    if (b && !a) steps.push({ index: i, kind: 'removed', before: b })
    else if (!b && a) steps.push({ index: i, kind: 'added', after: a })
    else if (b && a && (b.action !== a.action || b.expected !== a.expected)) {
      steps.push({ index: i, kind: 'changed', before: b, after: a })
    }
  }
  return { fields, steps }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  caseKey: string
  version: number
  versions: CaseVersion[]
}

export function VersionDetailDialog({ open, onOpenChange, caseKey, version, versions }: Props) {
  const [executions, setExecutions] = useState<CaseExecution[]>([])

  useEffect(() => {
    if (!open) return
    void api.GET('/api/v1/cases/{caseKey}/executions', { params: { path: { caseKey } } }).then(({ data }) => {
      setExecutions(data ?? [])
    })
  }, [open, caseKey])

  const current = versions.find((v) => v.version === version)
  const previous = versions.find((v) => v.version === version - 1)
  const diff = current && previous ? diffContent(previous.content, current.content) : null
  const versionExecutions = executions.filter((e) => e.caseVersion === version)
  const isFlaky =
    versionExecutions.some((e) => e.status === 'pass') &&
    versionExecutions.some((e) => e.status === 'failed' || e.status === 'blocked')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Version {version}</DialogTitle>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="tp-label text-muted-foreground">What changed</p>
            {!current ? null : !previous ? (
              <p className="text-sm text-muted-foreground">
                This is the first version — there is no previous version to compare against.
              </p>
            ) : diff && diff.fields.length === 0 && diff.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes relative to the previous version.</p>
            ) : (
              <div className="space-y-2">
                {diff?.fields.map((f) => (
                  <div key={f.label} className="text-sm">
                    <span className="tp-label mr-1.5 text-muted-foreground">{f.label}:</span>
                    <span className="text-muted-foreground line-through">{f.before || '—'}</span>
                    <span className="mx-1.5">→</span>
                    <span>{f.after || '—'}</span>
                  </div>
                ))}
                {diff?.steps.map((s) => (
                  <div key={s.index} className="text-sm">
                    <span className="tp-label mr-1.5 text-muted-foreground">Step {s.index + 1}:</span>
                    {s.kind === 'added' && <span>{s.after!.action}</span>}
                    {s.kind === 'removed' && (
                      <span className="text-muted-foreground line-through">{s.before!.action}</span>
                    )}
                    {s.kind === 'changed' && (
                      <div className="space-y-0.5 pl-1">
                        {s.before!.action !== s.after!.action && (
                          <div>
                            <span className="text-muted-foreground line-through">{s.before!.action}</span>
                            <span className="mx-1.5">→</span>
                            <span>{s.after!.action}</span>
                          </div>
                        )}
                        {s.before!.expected !== s.after!.expected && (
                          <div>
                            <span className="text-muted-foreground line-through">{s.before!.expected || '—'}</span>
                            <span className="mx-1.5">→</span>
                            <span>{s.after!.expected || '—'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="tp-label text-muted-foreground">Executions</p>
              {isFlaky && <Badge variant="destructive">Flaky</Badge>}
            </div>
            {versionExecutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">This version has not been run yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {versionExecutions.map((e) => (
                  <li key={e.runItemId}>
                    <Link
                      to={`/runs/${e.runKey}/items/${caseKey}`}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-accent hover:underline"
                    >
                      <span>{e.runName}</span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-sm"
                          style={{ background: VERDICT_COLOR[e.status] }}
                          aria-hidden="true"
                        />
                        {e.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
