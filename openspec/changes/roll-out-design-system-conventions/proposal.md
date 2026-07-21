## Why

`docs/design-system.md` and the `PropertyRow` component it documents were seeded from one
page (`redesign-case-detail-page`) and a full-app UX audit (2026-07-20) found two small,
low-priority gaps: the `Label: value` pattern hasn't been applied anywhere outside case
detail yet (issue #51), and the doc doesn't yet say when to reach for `StatusPill` vs.
`Badge` vs. `PropertyRow` — three components that can all render "a value" and are easy to
reach for interchangeably without a documented rule (issue #52).

## What Changes

- `RunPage.tsx`'s pinned-version caption ("Pinned at v{n}") becomes a `PropertyRow` — a
  clean fit, same spacious single-item detail-pane context `PropertyRow` was designed for.
- `docs/design-system.md` gains a `StatusPill` vs. `Badge` vs. `PropertyRow` decision
  section: `StatusPill` for a *derived* health/status band (computed from data, e.g. pass
  rate), `Badge` for a small *fixed enum the user sets directly* (today, only priority),
  `PropertyRow` for everything else.
- **Two candidate sites investigated and deliberately left unconverted**, with the reasoning
  recorded in `design.md` rather than silently skipped: `ProjectsPage.tsx`'s project-card
  description text (a dense card-grid context, not the spacious sidebar `PropertyRow` is
  designed for — adding a label there would hurt the density the card is designed around),
  and `ProjectPage.tsx`, which turns out not to render project description at all today (the
  issue's premise didn't hold up once checked against the actual code).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-execution`: "Run execution board" gains a scenario locking in the pinned-version
  property's labeled presentation — observable, testable UI detail, even though the
  underlying data/behavior is unchanged.

## Impact

- **Frontend**: `apps/web/src/pages/RunPage.tsx`, `docs/design-system.md`. No API, schema,
  or spec changes.
