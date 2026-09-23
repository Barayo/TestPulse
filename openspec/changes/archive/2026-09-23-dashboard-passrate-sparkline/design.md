## Context

Pepe's original dashboard-enrichment proposal assumed this sparkline would need the same `listRuns` + N-per-run `getRunSummary` pattern `useProjectLanding.ts` already uses for its 5-row `RunsPanel` (`useProjectLanding.ts:186-196`), just scoped to 10 runs instead of 5. Verified against the actual code and confirmed **that assumption was wrong, in a good way**: `RunRepo.ListPage` (`apps/api/internal/store/runs.go:534-589`) already computes each run's `passRate` in the same aggregate query that lists runs — the `Run` schema's own doc comment (`packages/shared/openapi.yaml:3315-3318`) says so explicitly: "Computed alongside the list query — cheap, not a per-run round trip." `ListPage` also already orders `created_at DESC, id DESC` — newest first, deterministic.

So this sparkline needs exactly **one** HTTP request (`GET /api/v1/projects/{projectKey}/runs?limit=10`), not up to ten. This is simpler and cheaper than the original proposal, not merely "same order of magnitude" as `RunsPanel`'s cost.

Aside, out of scope for this change but worth recording: `useProjectLanding.ts`'s own `RunsPanel` data currently *does* make the N redundant per-run `getRunSummary` calls this design avoids, for data (`passRate`) already present on the same `listRuns` response it already fetched. That's a pre-existing inefficiency, not something this change touches — flagged in Risks below rather than fixed here, to keep this change small and focused.

## Goals / Non-Goals

**Goals:**
- Show the last 10 runs' pass rates as a compact sparkline in the dashboard's Reports panel.
- One network request, reusing data already computed server-side.

**Non-Goals:**
- A server-side trend endpoint (the "real v2" once run counts get large — this client-side version is legitimate for the actual scale TestPulse projects run at today).
- Fixing `RunsPanel`'s existing redundant per-run summary calls — separate, pre-existing issue, not introduced or worsened by this change.
- Any interaction (hover tooltips, click-through) beyond the existing "Open Reports" action — a glanceable trend signal, not a mini-chart with its own affordances.

## Decisions

**New sibling hook, not an extension of `useProjectLanding`.** `useProjectReportsTeaser` already establishes the precedent: `ProjectPage.tsx` calls `useProjectLanding`, `useProjectReportsTeaser`, and (after this change) a new `useRunPassRateHistory` independently, each owning its own fetch. `useProjectLanding`'s `TOP_N=5` is shared between `RunsPanel`'s display cap and its own runs fetch — conflating that with a differently-sized sparkline data need would couple two unrelated concerns (how many rows `RunsPanel` shows vs. how many points the sparkline plots).

**`useRunPassRateHistory(projectKey, isMember, accessLoading)` calls `GET /api/v1/projects/{projectKey}/runs` (or the public equivalent) with `limit: 10`, no pagination loop.** `ListPage` already returns newest-first, so no client-side sort is needed either — a genuine simplification versus `useProjectLanding`'s own `[...runs].sort(...)` step, which exists there only because that hook drains every page via `fetchAllPages` and can't otherwise trust order across pages the same way a single bounded request can. Returns `{ points: { passRate: number | null; createdAt: string }[], loaded: boolean }`, oldest-first (reversed from the API's newest-first order) so the sparkline renders left-to-right as a timeline, matching how one reads a trend.

**Sparkline renders every point, including `passRate: null` (a run with zero items) as a zero-height bar** — an honest "nothing happened here yet" rather than skipping the run and silently compressing the timeline's real time spacing.

**Single color (`var(--chart-1)`), not per-bar pass/fail split.** The proposal's original text cited `--chart-1`/`--destructive`, but `RunStatusBreakdown.tsx` (the cited precedent) doesn't use `--destructive` anywhere — verified: its `STATUS_COLOR` map uses `--chart-1` through `--chart-5` exclusively, with `failed` mapped to `--chart-3`, not `--destructive`. A pass-rate sparkline isn't a pass/fail split per bar (unlike `RunStatusBreakdown`, which shows a *status distribution within one run*) — each bar here is a single scalar (this run's pass rate) plotted as height, so a single consistent color reusing `--chart-1` (the same hue already meaning "pass" everywhere else in the app) is the correct, honest mapping — not a fabricated two-tone threshold.

## Risks / Trade-offs

- [Risk] `useProjectLanding.ts`'s `RunsPanel` data path makes N redundant per-run `getRunSummary` calls for data already on the `listRuns` response. → Mitigation: none in this change (explicitly out of scope, see Non-Goals) — noted here so it isn't rediscovered as if new; a good candidate for its own small follow-up.
- [Risk] At very large run counts, even a single `limit=10` request has a real cost (the `ListPage` query still joins/aggregates run items). → Mitigation: none needed yet — this is a single bounded-size request regardless of total run count, not a scaling risk the way N-per-run calls would be. Only revisit if this specific query becomes measurably slow at scale, a separate concern from this UI change.

## Migration Plan

None — additive frontend-only change, no data migration, no API contract change (the `passRate` field and `limit` query param both already exist).
