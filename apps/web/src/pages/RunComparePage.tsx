import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { ChevronRightIcon, TrendingDownIcon, TrendingUpIcon, CheckCircle2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/useAuth'
import { StatusBadge } from '@/components/StatusBadge'
import { RunStatusBreakdown } from '@/components/RunStatusBreakdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type RunComparison = components['schemas']['RunComparison']
type RunComparisonItem = components['schemas']['RunComparisonItem']
type SuiteTrendPoint = components['schemas']['SuiteTrendPoint']

function RunHeaderCard({ label, run }: { label: string; run: SuiteTrendPoint }) {
  return (
    <Card className="flex-1">
      <CardHeader>
        <span className="tp-label text-muted-foreground">{label}</span>
        <CardTitle className="tp-heading">{run.runName}</CardTitle>
        <p className="text-sm text-muted-foreground">Created {new Date(run.createdAt).toLocaleDateString()}</p>
        <RunStatusBreakdown total={run.total} counts={run.counts} />
      </CardHeader>
    </Card>
  )
}

function TransitionRow({ item }: { item: RunComparisonItem }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
      <span>{item.caseTitle}</span>
      <span className="flex items-center gap-1.5 text-xs">
        {item.statusOlder && (
          <span className="opacity-55">
            <StatusBadge status={item.statusOlder} />
          </span>
        )}
        {item.statusOlder && item.statusNewer && <span className="mx-1">→</span>}
        {item.statusNewer && <StatusBadge status={item.statusNewer} />}
      </span>
    </li>
  )
}

function TransitionSection({
  label,
  icon,
  tone,
  items,
  emptyMessage,
}: {
  label: string
  icon: React.ReactNode
  tone: 'destructive' | 'primary'
  items: RunComparisonItem[]
  emptyMessage: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className={`flex items-center gap-2 ${tone === 'destructive' ? 'text-destructive' : 'text-primary'}`}>
          {icon}
          <span className="tp-heading text-base">
            {label} · {items.length}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul
            className={`space-y-1.5 ${
              tone === 'destructive' ? 'rounded-lg border border-destructive/20 bg-destructive/5 p-1.5' : 'rounded-lg border border-primary/20 bg-primary/5 p-1.5'
            }`}
          >
            {items.map((item) => (
              <TransitionRow key={item.caseKey} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AddedRemovedColumn({ label, items, removed }: { label: string; items: RunComparisonItem[]; removed?: boolean }) {
  return (
    <div>
      <p className="tp-label mb-2 text-muted-foreground">
        {label} · {items.length}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.caseKey} className={removed ? 'text-muted-foreground line-through' : ''}>
              {item.caseTitle}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RunComparePage() {
  const { runKeyA, runKeyB } = useParams<{ runKeyA: string; runKeyB: string }>()
  const { user, loading: authLoading } = useAuth()
  const [comparison, setComparison] = useState<RunComparison>()
  const [notFound, setNotFound] = useState(false)
  const [unchangedExpanded, setUnchangedExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!runKeyA || !runKeyB || authLoading) return
    setNotFound(false)
    const params = { path: { runKey: runKeyA, otherRunKey: runKeyB } }
    let data
    if (user) {
      const res = await api.GET('/api/v1/runs/{runKey}/compare/{otherRunKey}', { params })
      data = res.data
      if (!data) {
        const pub = await api.GET('/api/v1/public/runs/{runKey}/compare/{otherRunKey}', { params })
        data = pub.data
      }
    } else {
      const pub = await api.GET('/api/v1/public/runs/{runKey}/compare/{otherRunKey}', { params })
      data = pub.data
    }
    if (!data) {
      setNotFound(true)
      return
    }
    setComparison(data)
  }, [runKeyA, runKeyB, user, authLoading])

  useEffect(() => {
    void load()
  }, [load])

  if (notFound) {
    return <p className="text-sm text-muted-foreground">Comparison not found.</p>
  }
  if (!comparison) return null

  const { olderRun, newerRun, regressed, improved, unchanged, added, removed } = comparison
  const overlapping = unchanged.length + regressed.length + improved.length
  const totalDistinct = overlapping + added.length + removed.length
  const nearZeroOverlap = totalDistinct > 0 && overlapping > 0 && overlapping <= totalDistinct * 0.2
  const fullyUnchanged = regressed.length === 0 && improved.length === 0 && unchanged.length > 0 && !nearZeroOverlap

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        <RunHeaderCard label="OLDER RUN" run={olderRun} />
        <div className="flex items-center justify-center">
          <span className="flex size-8 shrink-0 rotate-90 items-center justify-center rounded-full bg-muted md:rotate-0" aria-hidden="true">
            →
          </span>
        </div>
        <RunHeaderCard label="NEWER RUN" run={newerRun} />
      </div>

      {nearZeroOverlap && (
        <p className="text-sm text-muted-foreground">
          Only {overlapping} of {totalDistinct} cases ran in both runs — Added and Removed below account for the rest.
        </p>
      )}

      {fullyUnchanged ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <CheckCircle2Icon className="mx-auto mb-2 size-6 text-primary" aria-hidden="true" />
          <p className="mb-1 text-sm font-medium">No regressions or improvements</p>
          <p className="text-sm text-muted-foreground">
            Every case that ran in both {olderRun.runName} and {newerRun.runName} kept the same verdict.
          </p>
        </div>
      ) : (
        <>
          <TransitionSection
            label="Regressed"
            icon={<TrendingDownIcon className="size-4" aria-hidden="true" />}
            tone="destructive"
            items={regressed}
            emptyMessage="No cases regressed between these runs."
          />
          <TransitionSection
            label="Improved"
            icon={<TrendingUpIcon className="size-4" aria-hidden="true" />}
            tone="primary"
            items={improved}
            emptyMessage="No cases improved between these runs."
          />
        </>
      )}

      <Card>
        <CardHeader>
          <button
            type="button"
            aria-label={unchangedExpanded ? 'Collapse Unchanged' : 'Expand Unchanged'}
            aria-expanded={unchangedExpanded}
            className="flex items-center gap-2 text-muted-foreground"
            onClick={() => setUnchangedExpanded((v) => !v)}
          >
            <ChevronRightIcon className={`size-3.5 transition-transform ${unchangedExpanded ? 'rotate-90' : ''}`} aria-hidden="true" />
            <span className="tp-heading text-base">Unchanged · {unchanged.length}</span>
          </button>
        </CardHeader>
        {unchangedExpanded && (
          <CardContent>
            {unchanged.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unchanged cases.</p>
            ) : (
              <ul className="space-y-1">
                {unchanged.map((item) => (
                  <li key={item.caseKey} className="flex items-center justify-between gap-3 px-1 py-1.5 text-sm">
                    <span>{item.caseTitle}</span>
                    {item.statusNewer && <StatusBadge status={item.statusNewer} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AddedRemovedColumn label="Removed" items={removed} removed />
        <AddedRemovedColumn label="Added" items={added} />
      </div>
    </div>
  )
}
