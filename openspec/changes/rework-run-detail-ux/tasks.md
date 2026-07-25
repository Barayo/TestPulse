## 1. Header: suite link and metadata

- [ ] 1.1 Write failing tests for the suite-link row: links to the suite when
  `run.suiteKey` is set, shows an explicit ad hoc state when it's null.
- [ ] 1.2 Implement. Link target: `/projects/{projectKey}/suites/{suiteKey}` if
  `rework-suites-landing-ux` has shipped by then, otherwise
  `/projects/{projectKey}/suites` as a safe fallback — check which is live and
  use the real route if available.
- [ ] 1.3 Write failing tests for the "Created {date}" line.
- [ ] 1.4 Implement.

## 2. Status filter

- [ ] 2.1 Write failing tests: filter chips render one per status present (with
  counts), "All" resets, selecting a chip narrows the visible items and updates
  the "Showing N of M" line.
- [ ] 2.2 Implement, reusing `RunStatusBreakdown`'s `STATUS_ORDER`/`STATUS_COLOR`/
  `STATUS_LABEL` vocabulary for visual consistency with the legend above it.

## 3. Grouping toggle

- [ ] 3.1 Write failing tests: toggling "Group by status" reorders the (possibly
  filtered) list into status-labeled sections in bad-outcomes-first order, hides
  nothing beyond what the filter already excludes.
- [ ] 3.2 Implement.

## 4. Verification

- [ ] 4.1 Full unit suite green, coverage gate maintained.
- [ ] 4.2 Add e2e scenarios for the suite link (both states) and the status
  filter; full e2e suite green.
- [ ] 4.3 Manual verification against `docker compose` with real seeded data
  (a run created from a suite, an ad hoc run, light + dark theme), matching
  `mockup.html`'s interactions.

## 5. Docs and Sample Project

- [ ] 5.1 Update `docs/test-management.md`'s run detail page description.
- [ ] 5.2 Verify the Sample Project already has at least one suite-created run
  and one ad hoc run (check `seed.go`); add if missing.

## 6. Cross-change coordination

- [ ] 6.1 If `rework-suites-landing-ux` ships after this change, come back and
  update the suite link to its real route once available.

## 7. Ship

- [ ] 7.1 Sync delta specs into `openspec/specs/test-execution/spec.md`
  (`/opsx:sync-specs rework-run-detail-ux`).
- [ ] 7.2 Archive the change, keeping `mockup.html` as the durable design reference.
- [ ] 7.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
