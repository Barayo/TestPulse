import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']

// Ascending pass rate, nulls (not-run-yet) first — undiagnosed is at least
// as urgent as a confirmed-low score, and there's no ring to size for it
// either way (redesign-runs-list-triage-view design.md D1). Array.sort is
// stable, so ties keep their incoming (recency) order for free.
export function sortOpenRunsByUrgency(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => (a.passRate ?? -1) - (b.passRate ?? -1))
}

const HERO_RING_SIZE = 128
const SECONDARY_RING_MAX = 64
const SECONDARY_RING_MIN = 44

export function heroRingSize(): number {
  return HERO_RING_SIZE
}

// Linearly interpolates ring size across however many secondary (non-hero)
// open-run cards exist: 64px for the 2nd-most-urgent run down to 44px
// (HealthRing's own default) for the least-urgent one. A single secondary
// card is both "2nd" and "last" at once — it gets the larger end (64px),
// still more weight than the default (design.md D4).
export function secondaryRingSize(rank: number, secondaryCount: number): number {
  const span = Math.max(secondaryCount - 1, 1)
  return SECONDARY_RING_MAX - ((SECONDARY_RING_MAX - SECONDARY_RING_MIN) * rank) / span
}

export interface RunCluster {
  suiteKey: string | null
  runs: Run[]
}

// Groups (already recency-ordered) closed runs by suiteKey — null becomes
// a single "Ad hoc" bucket. Cluster order is first-seen order in the input,
// which is already newest-first, so this naturally produces
// "most-recently-active suite first" with no extra sorting (design.md D2).
export function clusterClosedRunsBySuite(runs: Run[]): RunCluster[] {
  const order: (string | null)[] = []
  const byKey = new Map<string | null, RunCluster>()
  for (const run of runs) {
    const key = run.suiteKey ?? null
    let cluster = byKey.get(key)
    if (!cluster) {
      cluster = { suiteKey: key, runs: [] }
      byKey.set(key, cluster)
      order.push(key)
    }
    cluster.runs.push(run)
  }
  return order.map((key) => byKey.get(key)!)
}

// Floors rather than rounds so a cluster's displayed average never implies
// a run performed better than it did (e.g. 50/25/75/100 -> 62%, not 63%).
export function clusterAveragePassRate(cluster: RunCluster): number | null {
  const rates = cluster.runs.map((r) => r.passRate).filter((r): r is number => r !== null && r !== undefined)
  if (rates.length === 0) return null
  return Math.floor(rates.reduce((sum, r) => sum + r, 0) / rates.length)
}
