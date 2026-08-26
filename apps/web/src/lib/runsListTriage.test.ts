import { describe, expect, it } from 'vitest'
import {
  sortOpenRunsByUrgency,
  heroRingSize,
  secondaryRingSize,
  clusterClosedRunsBySuite,
  clusterAveragePassRate,
  type RunCluster,
} from './runsListTriage'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']

function run(overrides: Partial<Run> & { name: string }): Run {
  return {
    id: overrides.name,
    key: `p1-${overrides.name}`,
    projectId: 'p1',
    projectKey: 'p1',
    status: 'open',
    suiteKey: null,
    passRate: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('sortOpenRunsByUrgency', () => {
  it('sorts ascending by pass rate — the worst run first', () => {
    const runs = [run({ name: 'a', passRate: 90 }), run({ name: 'b', passRate: 25 }), run({ name: 'c', passRate: 83 })]
    expect(sortOpenRunsByUrgency(runs).map((r) => r.name)).toEqual(['b', 'c', 'a'])
  })

  it('sorts a null pass rate (not run yet) before every scored run', () => {
    const runs = [run({ name: 'scored', passRate: 40 }), run({ name: 'unrun', passRate: null })]
    expect(sortOpenRunsByUrgency(runs).map((r) => r.name)).toEqual(['unrun', 'scored'])
  })

  it('keeps relative order for ties (stable sort)', () => {
    const runs = [run({ name: 'first', passRate: 50 }), run({ name: 'second', passRate: 50 })]
    expect(sortOpenRunsByUrgency(runs).map((r) => r.name)).toEqual(['first', 'second'])
  })

  it('does not mutate the input array', () => {
    const runs = [run({ name: 'a', passRate: 90 }), run({ name: 'b', passRate: 25 })]
    const original = [...runs]
    sortOpenRunsByUrgency(runs)
    expect(runs).toEqual(original)
  })
})

describe('heroRingSize', () => {
  it('is a fixed 128px', () => {
    expect(heroRingSize()).toBe(128)
  })
})

describe('secondaryRingSize', () => {
  it('gives the 2nd-most-urgent run (rank 0) the largest secondary size, 64px', () => {
    expect(secondaryRingSize(0, 4)).toBe(64)
  })

  it('gives the least-urgent run (last rank) the default HealthRing size, 44px', () => {
    expect(secondaryRingSize(3, 4)).toBe(44)
  })

  it('interpolates linearly for a middle rank', () => {
    // 4 secondaries -> span 3 -> rank 1 sits 1/3 of the way from 64 to 44
    expect(secondaryRingSize(1, 4)).toBeCloseTo(64 - (64 - 44) / 3, 5)
  })

  it('gives a single secondary card the larger end (64px), not the default', () => {
    expect(secondaryRingSize(0, 1)).toBe(64)
  })
})

describe('clusterClosedRunsBySuite', () => {
  it('groups runs by suiteKey, preserving first-seen order as cluster order', () => {
    const runs = [
      run({ name: 'smoke-1', suiteKey: 'SP-S1' }),
      run({ name: 'adhoc-1', suiteKey: null }),
      run({ name: 'smoke-2', suiteKey: 'SP-S1' }),
      run({ name: 'release-1', suiteKey: 'SP-S2' }),
    ]
    const clusters = clusterClosedRunsBySuite(runs)
    expect(clusters.map((c) => c.suiteKey)).toEqual(['SP-S1', null, 'SP-S2'])
    expect(clusters[0].runs.map((r) => r.name)).toEqual(['smoke-1', 'smoke-2'])
    expect(clusters[1].runs.map((r) => r.name)).toEqual(['adhoc-1'])
    expect(clusters[2].runs.map((r) => r.name)).toEqual(['release-1'])
  })

  it('keeps runs within a cluster in their incoming (recency) order', () => {
    const runs = [run({ name: 'newer', suiteKey: 'SP-S1' }), run({ name: 'older', suiteKey: 'SP-S1' })]
    expect(clusterClosedRunsBySuite(runs)[0].runs.map((r) => r.name)).toEqual(['newer', 'older'])
  })

  it('returns an empty array for no runs', () => {
    expect(clusterClosedRunsBySuite([])).toEqual([])
  })
})

describe('clusterAveragePassRate', () => {
  it('floors the average so it never overstates a cluster\'s health', () => {
    const cluster: RunCluster = {
      suiteKey: 'SP-S1',
      runs: [
        run({ name: 'a', passRate: 50 }),
        run({ name: 'b', passRate: 25 }),
        run({ name: 'c', passRate: 75 }),
        run({ name: 'd', passRate: 100 }),
      ],
    }
    // (50+25+75+100)/4 = 62.5 -> floors to 62, not rounds to 63
    expect(clusterAveragePassRate(cluster)).toBe(62)
  })

  it('ignores runs with a null pass rate when averaging', () => {
    const cluster: RunCluster = {
      suiteKey: 'SP-S1',
      runs: [run({ name: 'a', passRate: 80 }), run({ name: 'b', passRate: null })],
    }
    expect(clusterAveragePassRate(cluster)).toBe(80)
  })

  it('returns null when every run in the cluster has no pass rate', () => {
    const cluster: RunCluster = { suiteKey: 'SP-S1', runs: [run({ name: 'a', passRate: null })] }
    expect(clusterAveragePassRate(cluster)).toBeNull()
  })
})
