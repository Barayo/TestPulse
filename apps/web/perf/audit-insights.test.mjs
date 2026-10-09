import { describe, expect, it } from 'vitest'
import { rankAudits, describeAuditItem, detailAuditId } from './audit-insights.mjs'

function lhr(auditRefs, audits) {
  return {
    categories: { performance: { auditRefs } },
    audits,
  }
}

describe('rankAudits', () => {
  it('returns the top 3 audits by weight * (1 - score), descending', () => {
    const result = lhr(
      [
        { id: 'cumulative-layout-shift', weight: 25 },
        { id: 'largest-contentful-paint', weight: 25 },
        { id: 'total-blocking-time', weight: 30 },
        { id: 'first-contentful-paint', weight: 10 },
        { id: 'speed-index', weight: 10 },
      ],
      {
        'cumulative-layout-shift': { title: 'Avoid large layout shifts', score: 0.1 }, // impact 22.5
        'largest-contentful-paint': { title: 'Largest Contentful Paint', score: 0.6 }, // impact 10
        'total-blocking-time': { title: 'Total Blocking Time', score: 1 }, // impact 0
        'first-contentful-paint': { title: 'First Contentful Paint', score: 0.5 }, // impact 5
        'speed-index': { title: 'Speed Index', score: 0.9 }, // impact 1
      },
    )

    const ranked = rankAudits(result)

    expect(ranked).toEqual([
      { id: 'cumulative-layout-shift', title: 'Avoid large layout shifts', impact: 22.5 },
      { id: 'largest-contentful-paint', title: 'Largest Contentful Paint', impact: 10 },
      { id: 'first-contentful-paint', title: 'First Contentful Paint', impact: 5 },
    ])
  })

  it('returns an empty array when every audit scores perfectly', () => {
    const result = lhr(
      [
        { id: 'a', weight: 25 },
        { id: 'b', weight: 10 },
      ],
      {
        a: { title: 'A', score: 1 },
        b: { title: 'B', score: 1 },
      },
    )

    expect(rankAudits(result)).toEqual([])
  })
})

describe('describeAuditItem', () => {
  it('describes a node-shaped item, collapsing a multi-line nodeLabel to one line', () => {
    const item = {
      node: {
        nodeLabel: 'Library\nsee all 6 ›\nAuthentication\n1 subsection\n13 cases\nCheckout',
        selector: 'div.flex > main > div.space-y-4',
      },
    }
    expect(describeAuditItem(item)).toBe(
      'div.flex > main > div.space-y-4 ("Library see all 6 › Authentication 1 subsection 13 cases Che…")',
    )
  })

  it('describes a url-shaped item (e.g. unused-javascript)', () => {
    const item = { url: 'http://localhost:8080/assets/index-abc123.js' }
    expect(describeAuditItem(item)).toBe('http://localhost:8080/assets/index-abc123.js')
  })

  it('falls back to a fixed string when no known field matches', () => {
    const item = { someUnrelatedField: 42 }
    expect(describeAuditItem(item)).toBe('(no further detail)')
  })
})

describe('detailAuditId', () => {
  it('maps cumulative-layout-shift to the layout-shifts audit, which actually carries per-element detail', () => {
    // cumulative-layout-shift's own audit object has no details.items —
    // confirmed against a real captured result (apps/web/perf/.results).
    expect(detailAuditId('cumulative-layout-shift')).toBe('layout-shifts')
  })

  it('maps largest-contentful-paint to the largest-contentful-paint-element audit', () => {
    expect(detailAuditId('largest-contentful-paint')).toBe('largest-contentful-paint-element')
  })

  it('returns the given id unchanged for an audit with no known override', () => {
    expect(detailAuditId('speed-index')).toBe('speed-index')
  })
})
