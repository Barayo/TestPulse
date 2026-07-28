## Why

As a QA lead, when I scan a list of test cases, I want a case's priority to jump out by color the way status/health signals already do elsewhere in the app, instead of every priority value — low, medium, high, critical — rendering as the same flat gray pill (user report, with screenshot of the Library list). Right now the only way to tell priority apart is reading the word itself.

## What Changes

- `ClassificationPills`' priority pill (`apps/web/src/components/Pills.tsx`) gets a severity-based tint instead of flat `bg-muted`: low uses the neutral status band, medium the progress (amber) band, high the risk (coral) band — all three reusing the app's existing `HealthBar`/`StatusPill` band tokens — and critical reuses the exact `bg-destructive/10 text-destructive` tint `FolderExplorerPage.tsx`'s critical-count indicator already established. No new colors introduced.
- Since every priority pill in the app renders through this one shared component (Library rows, `CasePicker`, `SuiteCaseGrid`, `CaseDetailPage`'s Properties sidebar), this fixes priority coloring everywhere at once.
- Platform and test-type pills are unaffected — they stay flat, since they aren't a severity scale.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: case priority pills, wherever they render (Library rows,
  the case-detail Properties sidebar, the suite/run case pickers), are now
  visually distinguished by a severity color, not just their label text.

## Impact

- `apps/web/src/components/Pills.tsx`, `Pills.test.tsx`.
- No API/schema change — pure presentation.
