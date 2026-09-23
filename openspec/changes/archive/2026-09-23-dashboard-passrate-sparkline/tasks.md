## 1. Hook: fetch the last 10 runs' pass rates in one request

- [x] 1.1 Write a failing test in `apps/web/src/lib/useRunPassRateHistory.test.ts` asserting the hook calls `GET /api/v1/projects/{projectKey}/runs` with `query: { limit: 10 }` for a member, `GET /api/v1/public/projects/{projectKey}/runs` for an anonymous visitor, and returns `points: { passRate, createdAt }[]` reversed to oldest-first (the API returns newest-first per `ListPage`'s `ORDER BY created_at DESC, id DESC`), plus `loaded: boolean`. Cover: a project with 10+ runs (exactly 10 points), a project with fewer than 10 runs (fewer points, no padding), a project with zero runs (empty array), and a run with `passRate: null` (included as a point, not filtered out).
- [x] 1.2 Run the test, confirm it fails (hook doesn't exist yet).
- [x] 1.3 Implement `apps/web/src/lib/useRunPassRateHistory.ts`, mirroring `useProjectReportsTeaser.ts`'s exact structure (signature `(projectKey: string | undefined, isMember: boolean, accessLoading: boolean)`, `useDataRevision`, abort-on-cleanup, catch-sets-loaded pattern) — a single `api.GET(..., { query: { limit: 10 } })` call, no pagination loop, no per-run summary fetch, no client-side sort (only `.reverse()`).
- [x] 1.4 Run the test, confirm it passes (6/6 green). `npx tsc -b` clean (one fixup needed: `r.passRate ?? null`, since the generated type is `number | null | undefined`, not just `number | null`).

## 2. ReportsPanel: render the sparkline

- [x] 2.1 Write failing tests in `apps/web/src/pages/ProjectPage.test.tsx` covering: a project with 10 runs of varying pass rates renders a `10`-child `aria-label="Pass rate trend"` sparkline; a project with 3 runs renders 3 children, not padded; a project with zero runs renders no sparkline element at all.
- [x] 2.2 Run the tests, confirm they fail (2 of 3 fail for the right reason — sparkline doesn't exist yet; the zero-runs case trivially passes either way).
- [x] 2.3 In `apps/web/src/components/ProjectLandingPanels.tsx`'s `ReportsPanel`: added a `passRateHistory: { passRate: number | null; createdAt: string }[]` prop. Renders an `aria-label="Pass rate trend"` bar row next to the existing `{passRate}% · pass · {total} items` line — one `<span>` per point, `height: ${point.passRate ?? 0}%` plus a Tailwind `min-h-0.5` so a 0% run's bar stays visible as a hairline (CSS `min-height` wins over a smaller explicit `height`), `background: var(--chart-1)` (matching `STATUS_COLOR.pass` — confirmed `RunStatusBreakdown.tsx` does NOT use `--destructive` anywhere, single-color not two-tone). Renders nothing when `passRateHistory` is empty.
- [x] 2.4 Updated `ReportsPanel`'s call site in `apps/web/src/pages/ProjectPage.tsx`: added the `useRunPassRateHistory` hook call alongside the existing `useProjectLanding`/`useProjectReportsTeaser` calls (same sibling pattern), passed `passRateHistory={passRateHistory.points}`.
- [x] 2.5 Run the tests, confirm they pass (64/64 `ProjectPage.test.tsx` green). `npx tsc -b` clean.

## 3. Documentation

- [x] 3.1 Extended `docs/test-management.md`'s Reports panel description (line 48, already updated by the sibling `dashboard-flaky-cases-list` change to describe the flaky-cases rows) to also mention the pass-rate sparkline.

## 4. Full verification

- [x] 4.1 Ran `make lint`: exit 0, clean (only the pre-existing `set-state-in-effect` pattern class already present on every sibling data-fetching hook).
- [x] 4.2 Ran `make coverage-web`: exit 0, 90.33%/83.47%/88.46%/92.96% (statements/branches/functions/lines), all above the 80% gate.
- [x] 4.3 Deployed locally (rebuilt web + API, `docker compose up --build -d app`; no DB wipe needed, seed data unchanged). Verified live in a real browser on the Sample Project's dashboard: the sparkline renders 10 bars with real variation next to the 77% pass-rate bar, and the seeded "Scratch run — safe to delete" (0% pass rate) renders as a visible hairline bar, not an invisible gap — confirmed via a zoomed screenshot.
