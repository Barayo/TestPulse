import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LayersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HealthRing, StatusPill, healthLabel, statusBorderClass, statusDotClass } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import {
  sortOpenRunsByUrgency,
  heroRingSize,
  secondaryRingSize,
  clusterClosedRunsBySuite,
  clusterAveragePassRate,
} from '@/lib/runsListTriage'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type Suite = components['schemas']['Suite']

// Shared with the pre-redesign RunList.tsx cap — same rationale (CI
// dogfooding can balloon Closed unbounded; Open is capped defensively for
// the same reason, per that file's own comment).
const SECTION_CAP = 10

function healthCaption(rate: number | null): string {
  return rate === null ? 'No runs yet' : healthLabel(rate)
}

function OpenRunCard({
  run,
  ringSize,
  hero,
}: {
  run: Run
  ringSize: number
  hero: boolean
}) {
  const passRate = run.passRate ?? null
  return (
    <Link
      to={`/runs/${run.key}`}
      className={`flex items-center gap-4 rounded-xl border-l-4 bg-card p-4 ring-1 ring-foreground/10 transition hover:-translate-y-px hover:shadow-md ${statusBorderClass(passRate)} ${hero ? 'sm:col-span-1' : ''}`}
    >
      <HealthRing rate={passRate} size={ringSize} />
      <div className="min-w-0 flex-1">
        {hero && <StatusPill rate={passRate} />}
        <p className={`truncate font-semibold ${hero ? 'mt-1 text-2xl' : 'text-sm'}`}>{run.name}</p>
        {!hero && <p className="text-xs text-muted-foreground">{healthCaption(passRate)}</p>}
        <p className="text-xs text-muted-foreground">{timeAgo(run.createdAt)}</p>
      </div>
    </Link>
  )
}

export function OpenRunsTriage({ runs }: { runs: Run[] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = sortOpenRunsByUrgency(runs)
  const visible = expanded ? sorted : sorted.slice(0, SECTION_CAP)
  const remaining = sorted.length - visible.length
  const [hero, ...secondary] = visible

  if (!hero) return null

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <OpenRunCard run={hero} ringSize={heroRingSize()} hero />
        {secondary.length > 0 && (
          <div className="space-y-3">
            {secondary.map((run, i) => (
              <OpenRunCard key={run.id} run={run} ringSize={secondaryRingSize(i, secondary.length)} hero={false} />
            ))}
          </div>
        )}
      </div>
      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
            Show {remaining} more open run{remaining === 1 ? '' : 's'}
          </Button>
        </div>
      )}
    </div>
  )
}

function ClosedRunRow({ run, projectKey }: { run: Run; projectKey?: string }) {
  const navigate = useNavigate()
  const menuRef = useRef<RowActionMenuHandle>(null)
  const showMenu = Boolean(projectKey)
  const menuItems: RowActionMenuItem[] = showMenu
    ? [
        {
          label: 'Compare…',
          onSelect: () => navigate(`/projects/${projectKey}/runs/compare`, { state: { seedRunKey: run.key } }),
        },
      ]
    : []

  return (
    <li
      className="group flex items-center gap-1"
      onContextMenu={(e) => {
        if (!showMenu) return
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <Link
        to={`/runs/${run.key}`}
        aria-label={run.name}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 pl-5 text-sm hover:bg-accent"
      >
        <span className="min-w-0 flex-1 truncate">{run.name}</span>
        <span className="flex w-16 shrink-0 items-center gap-1.5 text-xs">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${statusDotClass(run.passRate ?? null)}`} />
          {run.passRate === null || run.passRate === undefined ? '—' : `${run.passRate}%`}
        </span>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{timeAgo(run.createdAt)}</span>
      </Link>
      {showMenu && (
        <RowActionMenu ref={menuRef} label={`Actions for ${run.name}`} items={menuItems} />
      )}
    </li>
  )
}

export function ClosedRunsLedger({
  runs,
  suites,
  projectKey,
}: {
  runs: Run[]
  suites: Suite[]
  projectKey?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? runs : runs.slice(0, SECTION_CAP)
  const remaining = runs.length - visible.length
  const suiteByKey = new Map(suites.map((s) => [s.key, s]))
  const clusters = clusterClosedRunsBySuite(visible)

  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <ul className="space-y-3">
        {clusters.map((cluster) => {
          const label = cluster.suiteKey === null ? 'Ad hoc' : (suiteByKey.get(cluster.suiteKey)?.name ?? cluster.suiteKey)
          const avg = clusterAveragePassRate(cluster)
          return (
            <li key={cluster.suiteKey ?? '__ad_hoc__'}>
              <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium">
                {cluster.suiteKey !== null && (
                  <Link
                    to={`/projects/${projectKey}/suites/${cluster.suiteKey}`}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <LayersIcon className="size-3" aria-hidden="true" />
                    {label}
                  </Link>
                )}
                {cluster.suiteKey === null && <span>{label}</span>}
                <span className="text-muted-foreground">
                  · {cluster.runs.length} run{cluster.runs.length === 1 ? '' : 's'}
                  {avg !== null && ` · avg ${avg}% pass rate`}
                </span>
              </div>
              <ul className="space-y-0.5">
                {cluster.runs.map((run) => (
                  <ClosedRunRow key={run.id} run={run} projectKey={projectKey} />
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
            Show {remaining} more closed run{remaining === 1 ? '' : 's'}
          </Button>
        </div>
      )}
    </div>
  )
}
