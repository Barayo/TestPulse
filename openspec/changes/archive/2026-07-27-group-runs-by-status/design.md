## Context

`RunsPage.tsx` currently renders every run as a bare `<Link>` in a flat `<ul>` — no
status, no health signal, no date, and open/closed runs interleaved in one feed. Two
things converged to force this: `rework-runs-list-ux` (#94) fixed only the page's
*navigation* (list-first instead of form-first) and never carried forward the richer
per-row design its own source mockup already specified (status badge, pass-rate health
bar, created date); and the live dogfood project's Runs list is genuinely noisy — CI
imports many auto-generated runs on every push to `main` (`delete-mode.spec.ts` et al.),
burying the handful of runs someone is actually working. A Pepe/Fable-5 design pass
(`mockup.html`, this directory) is the visual/interaction source of truth for the
Open/Closed grouping specifically.

## Goals / Non-Goals

**Goals:**
- Bring `RunsPage.tsx`'s row visuals up to the already-approved mockup: status badge,
  pass-rate health bar, relative created date.
- Group runs into two sections, Open then Closed, so active work isn't buried under
  archival/automated noise.
- Compute per-run pass rate as a cheap DB aggregate, not a client-side round trip per
  run (the project's established "design aggregates for DB scale" rule).
- Hold up visually at real dogfood scale (dozens of closed runs, many with duplicate
  CI-generated names), not just a 5-run demo.

**Non-Goals:**
- Server-side pagination for the Closed section — the list-runs endpoint still returns
  every run; a client-side cap-with-expand is this pass's answer to scale. True
  pagination is a follow-up once dogfood volume outgrows "a few dozen."
- Deduplicating or grouping repeated CI-generated run names — a separate, larger
  feature. This pass makes the list hold up visually at that noise level; it doesn't
  collapse duplicates.
- Any "recently reopened" run state — the `Run` schema has only `open`/`closed` today;
  inventing a third visual state would mean smuggling new backend surface into what is
  otherwise a layout change.

## Decisions

- **Per-run pass rate is a new aggregate column on `RunRepo.List`, not a new endpoint.**
  Same `LEFT JOIN test_run_items ... GROUP BY` shape already used by
  `SuiteRepo.latestRunStats` and `ProjectRepo`'s summaries query — one query for the
  whole list. `total > 0 ? passCount/total*100 : nil`, same null/zero-items convention
  those two already use, so a run with items but no recorded verdicts yet reads as 0%
  (at-risk), not "never run" — consistent with existing pass-rate semantics elsewhere
  in the app, not a new rule invented here.
- **The row-level open/closed badge is promoted to the section header, not deleted.**
  The already-approved `rework-runs-list-ux` mockup put a status badge on every row;
  once rows are grouped under a section that already says "Open"/"Closed", repeating it
  per row is pure noise. The section header uses the exact same `Badge` component
  `RunPage.tsx` already uses for a single run (`variant="secondary"` for open,
  `variant="outline"` for closed), carrying a count ("Open · 5"), not a new color
  vocabulary.
- **Open sits directly in the card body; Closed sits in a recessed filled panel.**
  Reuses `design-system.md`'s "filled panel over hairline divider" rule (the same
  reasoning behind `CaseDetailPage`'s sidebar panel) to mark Open as primary and Closed
  as archival, structurally — not just by section order.
- **Newest-first within both sections** — the same `createdAt desc` order the flat list
  already implied, now partitioned instead of interleaved. No new sort control.
- **Closed caps at 10 visible rows with a "Show N more" expand — one shared cap
  mechanism, not Closed-specific logic.** Default-collapsing Closed entirely would hide
  most of a mature project's content on first load; full pagination needs a backend
  contract change out of scope here. A client-side cap-with-expand is the pragmatic
  middle ground. The cap mechanism is generic (parameterized by section) rather than a
  Closed-only branch, so if Open ever balloons too, the same code handles it with no
  new logic.
- **Two distinct empty-state treatments.** A single empty section (no open runs, or no
  closed runs, in an otherwise-populated project) gets one muted inline line, matching
  `CaseResultsPanel`'s empty-state convention. Zero runs *total* is the page's primary
  empty state and replaces both sections entirely with the full dashed-border-card
  treatment matching `ProjectsPage`'s "No projects yet" — stacking two empty
  sub-sections instead would read as broken chrome, not an intentional empty state.

## Risks / Trade-offs

- [`RunRepo.List`'s query grows a `GROUP BY` + `LEFT JOIN` over `test_run_items`] →
  Same shape already proven at this scale by `ProjectRepo`'s summaries query and
  `SuiteRepo.latestRunStats`; no new query pattern, no N+1.
- [A 10-row cap could hide a specific closed run someone is looking for] → "Show N
  more" is one click, not a second page load or a route change; acceptable for v1
  given the list has no search/filter at all today.
