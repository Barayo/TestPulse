// Surfaces *why* a page scored the way it did, not just the score
// (improve-perf-suite-reporting D3/D4).

// Ranks performance-category audits by their actual impact on the
// score — weight * (1 - score), the same ranking Lighthouse's own
// report uses — rather than a hardcoded "check CLS, check LCP, ..."
// list, so it keeps working if Lighthouse's own audit set changes.
export function rankAudits(lhr) {
  const refs = lhr.categories.performance.auditRefs
  return refs
    .map((ref) => {
      const audit = lhr.audits[ref.id]
      const impact = ref.weight * (1 - audit.score)
      return { id: ref.id, title: audit.title, impact }
    })
    .filter((a) => a.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
}

// Some scored audits carry no `details.items` of their own — the
// per-element detail actually lives in a separate, unweighted
// diagnostic audit. Confirmed against a real captured result:
// cumulative-layout-shift's own audit object has none (just a
// numeric summary); layout-shifts has the per-element breakdown.
const DETAIL_AUDIT_OVERRIDES = {
  'cumulative-layout-shift': 'layout-shifts',
  'largest-contentful-paint': 'largest-contentful-paint-element',
}

export function detailAuditId(id) {
  return DETAIL_AUDIT_OVERRIDES[id] ?? id
}

// Probes a short list of common `details.items[]` shapes rather than
// hardcoding per-audit-ID extraction — avoids needing an update every
// time a different audit becomes top-ranked, or when Lighthouse changes
// a detail schema.
const MAX_LABEL_LENGTH = 60

// Lighthouse nodeLabels are often multi-line (a node's full visible
// text) — collapsed and truncated to keep each printed line to one
// line, not a multi-line dump.
function oneLine(text) {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > MAX_LABEL_LENGTH ? `${collapsed.slice(0, MAX_LABEL_LENGTH)}…` : collapsed
}

export function describeAuditItem(item) {
  if (item.node?.selector) {
    return item.node.nodeLabel
      ? `${item.node.selector} ("${oneLine(item.node.nodeLabel)}")`
      : item.node.selector
  }
  if (item.url) {
    return item.url
  }
  if (item.source && item.description) {
    return `${item.source}: ${item.description}`
  }
  return '(no further detail)'
}
