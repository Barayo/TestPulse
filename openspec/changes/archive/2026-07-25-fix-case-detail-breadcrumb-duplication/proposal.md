## Why

Found while reviewing a real dogfooding case: the case-detail breadcrumb's
last segment is the case's full title, rendered again, verbatim, as the
page's real `<h1>` two lines below. For a long title this reads as broken
(mid-word ellipsis) as well as redundant. It's the only page in the app
that duplicates a real semantic heading in the trail — `Breadcrumbs.tsx`
already embodies the right principle for the single-segment case ("would
just repeat the page's own heading directly below it") but it was never
generalized to the N-segment case.

## What Changes

- Case-detail's breadcrumb trail stops at the parent folder; the case
  title no longer appears as the trailing crumb, since the `<h1>` already
  shows it (and can wrap, unlike a breadcrumb crumb).
- New spec scenario codifying this so it doesn't regress.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-navigation`: "Breadcrumb trail" gains a scenario for case-detail
  pages specifically (previously unspecified for this page type).

## Impact

- `apps/web/src/pages/CaseDetailPage.tsx` — the breadcrumb segment array.
- `apps/web/e2e/ui-navigation.spec.ts` — new scenario under "Breadcrumb
  trail".
- No API/schema changes; no other page type is touched (RunPage has a
  smaller, lower-priority instance of a related pattern, deliberately out
  of scope here).
