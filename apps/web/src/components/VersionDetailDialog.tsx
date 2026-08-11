import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { diffContent } from '@/lib/versionDiff'
import { ContentDiffView } from '@/components/ContentDiffView'
import type { ProjectReadAccess } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type CaseVersion = components['schemas']['CaseVersion']
type CaseExecution = components['schemas']['CaseExecution']

// Reuses CaseResultsPanel's verdict semantics — no new status vocabulary.
const VERDICT_COLOR: Record<string, string> = {
  pass: 'var(--chart-1)',
  skipped: 'var(--chart-2)',
  failed: 'var(--chart-3)',
  blocked: 'var(--chart-3)',
  pending: 'var(--muted-foreground)',
  retest: 'var(--muted-foreground)',
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  caseKey: string
  version: number
  versions: CaseVersion[]
  // The parent CaseDetailPage's own useProjectReadAccess result, passed
  // down rather than re-derived here — avoids a second, redundant
  // /permissions fetch for the same decision (design.md D11).
  access: ProjectReadAccess
}

export function VersionDetailDialog({ open, onOpenChange, caseKey, version, versions, access }: Props) {
  const [executions, setExecutions] = useState<CaseExecution[]>([])

  useEffect(() => {
    // Waits for the session check and confirmed project read access before
    // firing either branch — see design.md D2/D11
    // (unify-authenticated-and-public-views). A signed-in non-member reads
    // the public endpoint here too, exactly like an anonymous visitor.
    if (!open || access === 'loading') return
    const request =
      access === 'member'
        ? api.GET('/api/v1/cases/{caseKey}/executions', { params: { path: { caseKey } } })
        : api.GET('/api/v1/public/cases/{caseKey}/executions', { params: { path: { caseKey } } })
    void request.then(({ data }) => {
      setExecutions(data ?? [])
    })
  }, [open, caseKey, access])

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
            ) : (
              diff && <ContentDiffView diff={diff} />
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
