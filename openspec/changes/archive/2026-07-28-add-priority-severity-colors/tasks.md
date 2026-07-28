## 1. Color the priority pill by severity

- [x] 1.1 Wrote failing tests (`Pills.test.tsx`): low/medium/high map to the
  app's existing `status-neutral`/`status-progress`/`status-risk` band
  classes; critical maps to `bg-destructive/10 text-destructive`; platform
  and test-type pills stay flat (`bg-muted`), unaffected.
- [x] 1.2 Implemented: a `PRIORITY_TINT` lookup in `ClassificationPills`
  (`apps/web/src/components/Pills.tsx`), reusing existing tokens only — no
  new colors.

## 2. Verification

- [x] 2.1 Full unit suite green (628 tests → still 628, this change only
  edits existing pill classes), coverage gate maintained, `tsc -b`/`oxlint`
  clean.
- [x] 2.2 Manual visual check against the rebuilt `docker compose` stack
  (Sample Project's Library, both light and dark): low/medium/high/critical
  render as 4 legible, distinct tints; critical and high (destructive vs.
  status-risk) are a deliberately related but distinguishable pair, and both
  still carry their own text label so color is never the only signal.

## 3. Ship

- [x] 3.1 Sample Project showcase: exempt — the Sample Project already seeds
  cases across all 4 priority levels (verified during the visual check
  above); no `seed.go` change needed. Docs: exempt — pure presentation
  change to an already-documented property, no new capability or workflow.
- [x] 3.2 Synced delta spec into `openspec/specs/ui-navigation/spec.md`.
- [x] 3.3 Archive the change.
- [x] 3.4 Commit + push; wait for CI green.
