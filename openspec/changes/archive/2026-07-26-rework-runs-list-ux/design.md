## Context

`RunsPage.tsx` today renders two `Card`s in a single column: "New run" (the
full case-picker form — search, filters, section tree, virtualized list,
suite selector) first, then "Runs" (the actual list) below it, scrolled out
of the initial viewport on any real project. This is a straight holdover from
before `rework-run-creation-ux` grew the form from a name-only dialog into
the full picker — at that size, a form-first layout reads as "this page is
for creating a run," not "this page lists runs," which is exactly the bug
report: "Why recent runs opens a new Test run instead of listing runs."

`SuiteDetailPage.tsx` already has a working deep-link precedent for this
exact page: `handleCustomizeSelection` navigates to `/projects/{projectKey}
/runs` with `{ seedFromSuiteKey, seedName }` router state, consumed by a
one-shot `useEffect` in `RunsPage.tsx` (`seedFromSuiteKey`). This design
reuses that idiom for the run-created banner, not a new mechanism.

A Pepe/Fable-5 mockup (`mockup.html`, this directory), reviewed and approved
by the user, is the interaction source of truth for both the list-primary
layout and the two post-creation feedback paths.

## Goals / Non-Goals

**Goals:**
- Opening the Runs page shows the runs list as the primary content.
- Creating a run gives clear feedback: either you land on the new run
  (dedicated flow) or you see a confirmation with a link to it (quick-run,
  where you're likely to stay and act again).
- Reuse the existing one-shot router-state idiom rather than inventing a
  second "pending feedback" mechanism.

**Non-Goals:**
- No toast/notification library — two call sites don't justify adopting one;
  a small dependency-free banner component covers both.
- No change to the case-picker's own mechanics (search/filter/scope/virtualization)
  — `rework-run-creation-ux` already built and shipped that; this only moves
  where it lives and what happens after submission.
- No change to `handleQuickRun`'s actual run-creation call or to the suite
  detail page's "Last run" property update — both already work; this only
  adds the missing feedback layer on top.

## Decisions

- **Dedicated route, not a dialog or inline accordion.** The picker has more
  content than `SuitesPage.tsx`'s name-only creation dialog — a modal would
  force nested scrolling around a virtualized list. An inline accordion
  technically defaults to collapsed, but the moment it's opened it's exactly
  as dominant as today's layout — it defers the problem rather than solving
  it. `SuiteDetailPage.tsx`'s "Customize selection" already deep-links to
  this exact picker via router state; repointing it at the new route reuses
  that link instead of duplicating the picker a second time.
- **Two different post-creation behaviors, not one.** The dedicated
  `/runs/new` flow has no other purpose once a run is created, so navigating
  straight to `/runs/{runKey}` is the natural next screen (TestRail's own
  "create → go execute" precedent). The suite quick-run action is a
  secondary action taken *while reviewing a suite* — staying put with an
  inline "View run →" banner matches GitHub Actions' dispatch-and-stay
  pattern, and avoids yanking the user away from what they were doing.
- **One new banner component, not two.** Since no toast infrastructure
  exists, adding one now for two call sites would be scope creep; a small
  local component (dismissable, auto-fades, renders a message + optional
  link) covers both the RunPage's "Run created successfully" banner and
  SuiteDetailPage's "Run created — View run →" banner.
- **Router-state one-shot, matching `seedFromSuiteKey`.** `RunPage.tsx` reads
  a `{ justCreated: true }` (or similar) state on mount, shows the banner,
  then clears it via `navigate(location.pathname, { replace: true, state:
  null })` — the exact pattern `RunsPage.tsx` already uses, not a new
  mechanism (e.g. no query param, no global toast store).

## Risks / Trade-offs

- [Splitting the case-picker form into its own page duplicates some page
  shell (breadcrumbs, layout) between `RunsPage.tsx` and the new page] →
  Acceptable; `SuiteDetailPage.tsx` and `SuitesPage.tsx` already have this
  same list-page/detail-page shell duplication, it's the established pattern
  here, not a new one.
- [Two different post-creation behaviors is more to explain/maintain than
  one uniform rule] → Deliberate — see Decisions; a single "always navigate"
  or "always stay" rule would be wrong for one of the two entry points.
