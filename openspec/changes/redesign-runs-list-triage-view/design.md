## Context

`RunsPage.tsx` renders `RunSection`/`RunRow`/`RunRowContent` (`RunList.tsx`),
shared with `SuiteDetailPage.tsx`'s "Run history" card and
`RunListbox.tsx`'s compare-runs picker. `GET /projects/{projectKey}/runs`
already returns runs `ORDER BY tr.created_at DESC` (`store/runs.go:394`,
confirmed) — the whole project's runs, most recent first, before
`RunsPage.tsx` splits them by `status`. `GET /projects/{projectKey}/suites`
already exists and returns each suite's `key`/`name`/`passRate`. Three
rounds of Pepe/Fable-5 mockups converged on: Open runs as urgency-ordered
hero/tapering cards; Closed runs grouped into suite clusters inside the
existing dense ledger. Approved mockup:
https://claude.ai/code/artifact/69f396fc-c67f-4f0a-951e-d1df1ee8e6e6

## Goals / Non-Goals

**Goals:**
- Make the run needing the most attention visually unmissable on load.
- Let runs that share a name (a real, common case for ad hoc/CI-imported
  runs) be told apart by their suite grouping, not by reading timestamps.
- Ship this as a pure frontend change — reuse `GET .../suites`, no new
  endpoints, no schema changes.

**Non-Goals:**
- Changing `SuiteDetailPage.tsx`'s "Run history" card or `RunListbox.tsx`'s
  compare picker — neither needs this treatment (every run in a suite's
  own history card is already that suite's; the picker is a `max-h-64`
  combobox where taller rows would halve visible options). Both keep using
  `RunSection`/`RunRow` exactly as today, untouched.
- A user-facing view toggle between this layout and a flatter alternative —
  evaluated separately, after this ships, not bundled in.
- Any backend sort/filter support — all ordering and grouping here is
  client-side over data the API already returns.

## Decisions

**D1 — Open runs: client-side sort by ascending pass rate, nulls first.**
`RunsPage.tsx`'s existing `runs.filter(r => r.status === 'open')` gains a
`.sort()`: ascending `passRate`, with `passRate === null` ("not run yet")
sorted to the very front — undiagnosed is at least as urgent as a
confirmed-low score, and there's no honest ring to size for it anyway (see
D4). Ties keep their relative (recency) order — `Array.prototype.sort` is
stable, so no tiebreaker code is needed. This is a genuine behavior change
from today's implicit recency order, called out explicitly in the empty
section copy ("Ordered by what needs attention first — lowest pass rate
leads, not most recent," per the approved mockup) so it's stated, not
silently inconsistent with Closed's own order.

**D2 — Closed runs: cluster by `suiteKey`, cluster order = first-seen in
the existing recency-sorted list.**
Group the (already recency-ordered) closed runs by `run.suiteKey` (`null`
→ an "Ad hoc" bucket). A JS `Map` built by iterating the recency-ordered
array and inserting each new key on first encounter naturally produces
"most-recently-active suite first" as the cluster order, matching the
mockup exactly, with zero extra sorting logic — insertion order **is**
the rule. Runs within a cluster keep whatever relative order they arrived
in (recency), unchanged.

**D3 — Suite names/icons resolved by fetching `GET .../suites`, with the
same fallback `RunPage.tsx` already uses for a deleted suite.**
`RunsPage.tsx`'s `load()` gains a third parallel request (alongside the
existing project + runs calls) for the project's suites, then builds a
`suiteKey -> Suite` map. Cluster header: `LayersIcon` + `suite?.name ??
suiteKey` whenever `suiteKey` is non-null — **including** when the suite
no longer resolves (deleted since the run was created; `suiteKey` is
immutable and survives suite deletion per its own OpenAPI description).
This exactly mirrors `RunPage.tsx:637-644`'s own handling of the same
case: it doesn't hide the icon/link for an unresolvable `suiteKey`, it
just falls back to the raw key as display text. Only a truly ad hoc run
(`suiteKey === null`) gets no icon, landing in the icon-less "Ad hoc"
cluster. The cluster header is a `Link` to
`/projects/{projectKey}/suites/{suiteKey}`, same as `RunPage.tsx`'s link,
whenever `suiteKey` is non-null (a 404 on a deleted suite's page is
existing, acceptable app behavior, not something this change fixes).

**D4 — `HealthRing` gains an optional `size` prop; `passRate === null`
renders its existing dashed/empty treatment at that size.**
`HealthRing` (`HealthBar.tsx:143-161`) is currently fixed at `size-11`
(44px). Add `size?: number` (px), defaulting to 44 so `ProjectPage.tsx`'s
existing call site is untouched. The hero card uses a large fixed size
(128px); each secondary open-run card's ring size is linearly interpolated
between a secondary-max (64px) for the 2nd-most-urgent run and the
existing default (44px) for the least-urgent (healthiest) one — a formula
over however many secondary cards exist, not a hardcoded 4-step table, so
it holds whether there are 2 or 8 open runs. A `passRate === null` open
run keeps `HealthRing`'s existing `rate === null` conic-gradient-absent
treatment (`HealthBar.tsx:151-152`), just at whatever size its rank
assigns it.

**D5 — New, dedicated components for `RunsPage.tsx`; `RunList.tsx` is not
touched.**
Rather than add opt-in props to `RunRow`/`RunSection`/`RunRowContent` to
absorb a completely different visual language (hero/tapering cards,
suite-clustered ledger), add new components — `OpenRunsTriage` and
`ClosedRunsLedger` — used only by `RunsPage.tsx`. `RunList.tsx`'s existing
exports keep serving `SuiteDetailPage.tsx` and `RunListbox.tsx` exactly as
today, with no new props, no behavior change, no risk of regressing either
call site. The closed ledger keeps the "⋯" `RowActionMenu` ("Compare…")
per row, unchanged from today — open cards get no menu, matching current
behavior (`RunRow`'s `showMenu` is already `false` for open runs).

**D6 — `SECTION_CAP`/"Show N more" preserved via flatten-cap-regroup.**
Today's cap (`RunList.tsx:15`, 10) applies to the closed list as a flat
array before clustering. Keep that: compute the full recency-ordered
closed array, slice to the visible cap (or all of it once expanded), *then*
run D2's clustering over the visible slice. A cluster that has more members
than are currently visible simply shows fewer rows under its header until
"Show N more" is clicked — no per-cluster cap, one global one, matching
today's semantics exactly.

## Risks / Trade-offs

- **One extra parallel request** (`GET .../suites`) on every `RunsPage.tsx`
  load → negligible; the page already makes 2 parallel requests, this
  makes it 3, and suites are a small, cheap list already fetched
  elsewhere in the app (`SuitesPage.tsx`) with no reported cost concern.
- **Open-run reordering is a real, visible behavior change** → mitigated
  by the explicit caption stating the new rule, and by scoping the
  reorder to the Open section only — Closed's order is untouched.
- **Ring-size interpolation formula needs a floor/ceiling sanity check for
  1 open run (no secondary cards) and for a large N** (many open runs
  compressing toward the 44px floor) → both are cheap to unit-test
  directly (a pure function mapping rank/count to a pixel size), not a
  design risk, just a task-level thing to verify.
