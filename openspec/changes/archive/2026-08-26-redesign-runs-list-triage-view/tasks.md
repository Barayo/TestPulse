## 1. HealthRing sizing

- [x] 1.1 Test + add `size?: number` prop to `HealthRing` (`HealthBar.tsx`), defaulting to 44 (today's fixed size); confirm `ProjectPage.tsx`'s existing call site renders unchanged

## 2. Data loading

- [x] 2.1 Test + update `RunsPage.tsx`'s `load()` to fetch `GET /projects/{projectKey}/suites` (or the public equivalent for anonymous/public-project access) in parallel with the existing project + runs calls, building a `suiteKey -> Suite` map

## 3. Open runs: triage cards (TDD: failing test first for each)

- [x] 3.1 Test + implement ascending-pass-rate sort with null-first ordering (design.md D1) as a pure, independently-testable function
- [x] 3.2 Test + implement the ring-size interpolation formula (rank/count → px, hero fixed at 128px, secondary range 64px→44px) as a pure function (design.md D4)
- [x] 3.3 Build `OpenRunsTriage` component: hero card (large ring, `StatusPill`, name, timestamp) + secondary card column (smaller rings, plain-word health caption, name, timestamp), using the sort + sizing functions from 3.1/3.2
- [x] 3.4 Test: empty state (no open runs) unchanged from today's copy
- [x] 3.5 Test: single open run renders as hero only, no secondary column

## 4. Closed runs: suite-clustered ledger (TDD: failing test first for each)

- [x] 4.1 Test + implement the cluster-grouping function (design.md D2): groups closed runs by `suiteKey` (null → "Ad hoc"), cluster order = first-seen scanning newest-first, as a pure, independently-testable function
- [x] 4.2 Test + implement per-cluster aggregate (count + average pass rate)
- [x] 4.3 Test + implement the deleted-suite fallback (design.md D3): icon + link still shown, raw `suiteKey` used as display text when no matching suite is found
- [x] 4.4 Build `ClosedRunsLedger` component: dense zebra-striped rows grouped under cluster headers, preserving the existing hover-reveal "⋯" `RowActionMenu` ("Compare…") per row
- [x] 4.5 Test + preserve `SECTION_CAP`/"Show N more" behavior via flatten-cap-regroup (design.md D6): cap applies to the flat closed list before clustering, not per-cluster

## 5. Wiring and regression safety

- [x] 5.1 Wire `OpenRunsTriage`/`ClosedRunsLedger` into `RunsPage.tsx`, replacing its use of `RunSection` for this page only
- [x] 5.2 Confirm `RunList.tsx`'s `RunSection`/`RunRow`/`RunRowContent` are untouched and `SuiteDetailPage.tsx`'s Run history card + `RunListbox.tsx`'s compare picker still pass their existing tests unmodified
- [x] 5.3 Full web suite green, typecheck clean, lint clean

## 6. Docs

- [x] 6.1 Update `docs/test-management.md`'s Runs list description to match the new triage/clustered layout and the explicit "ordered by urgency" behavior

## 7. Validation

- [x] 7.1 `make lint` / web coverage gate (≥80% all metrics) — 92%/84%/90%/94%
- [x] 7.2 `act`-based local `web` CI job validation — job succeeded (a real `tsc -b` type error surfaced here first — `Run.passRate` is `number | null | undefined`, not `number | null` — fixed, and confirmed my earlier ad-hoc `tsc --noEmit` had given a false-clean signal; `npm run typecheck` is the real gate)
- [x] 7.3 Local docker-compose deploy + manual browser validation against the Sample Project's real multi-suite, duplicate-name run data — confirmed hero/tapering cards, real suite clustering (including a "Regression" suite the mockup never anticipated by name), "Compare…" menu, card-to-run navigation, and dark mode all correct
