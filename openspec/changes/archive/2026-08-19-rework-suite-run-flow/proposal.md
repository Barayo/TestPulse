## Why

As a user, when I run a suite from its detail page, I want to actually see confirmation
that the run was created, and when I open a suite afterward, I want to see how
stable it's been over time — not just its current membership. Today the confirmation
banner exists in code but is invisible in practice (it renders inline, above the fold,
and is gone whenever the page happens to be scrolled — verified live via a
MutationObserver: the DOM node is added and stays, but is never seen). The suite
detail page's only content is a case-selection grid, always shown, whether the visitor
is there to review the suite or edit its membership — a suite-level pass-rate trend
component already exists in the codebase (`SuitePassRateTrend.tsx`, fully built and
tested) but has zero call sites anywhere in the app. And the run-comparison feature
that just shipped (`add-run-comparison-view`) has no discoverable entry point beyond
one auto-resolved link — the explicit picker is reachable only by typing its URL.

This bundles four related fixes that came out of a single design review (Pepe/Fable 5,
mock: https://claude.ai/code/artifact/d3912e44-49cd-4ae2-bcef-38b10e196b1a) of the
suite → run-creation flow, approved by the user.

## What Changes

- **Confirmation toast redesign (bug fix)**: `ConfirmBanner` becomes a viewport-anchored
  fixed toast instead of an inline element that can render off-screen; drops its 4-second
  auto-dismiss (manual dismiss or unmount-on-navigate only); solid surface + ring + shadow
  instead of a translucent tint; the message now names the created run
  (`Run "{name}" created.`), and the link label shortens to "View it →". Applied at all
  three existing call sites (`SuiteDetailPage.tsx`, `SuitesPage.tsx`, `RunPage.tsx`), each
  slightly different (`RunPage.tsx`'s own instance drops the link entirely, since the user
  is already on the page it would point to).
- **Suite Detail page view/edit mode split**: the page gains a default "view" mode (a
  Stability card wiring in the previously-unused `SuitePassRateTrend`, and a Run history
  card listing the suite's own runs with a per-run "Compare…" action) and an explicit
  "edit" mode (today's case-selection grid, unchanged, entered via an "Edit cases"/"View
  cases" toggle depending on permission). The case list is removed from view mode
  entirely, not shown read-only.
- **Per-run "Compare…" entry points**: a right-click/"⋯" context menu on each run row
  (`RunsPage.tsx`, and the new suite Run history card) and a "Compare…" button on a run's
  own page, both seeding one side of the existing comparison picker
  (`RunComparePickerPage.tsx`) and navigating there — closing the discoverability gap left
  by `add-run-comparison-view`, whose only entry point today is the auto-resolved
  "Compare to previous run" link. That link is kept as-is (zero-click shortcut for the
  most common case), not folded into the new general entry point.
- **Name-confirmation focus fix**: the quick-run dialog's pre-filled Name field, and the
  "Customize selection" hand-off's seeded name field on the New run page, now select their
  full text on focus — so accepting the suggested name (by typing over it or pressing
  Enter) is a deliberate look-then-decide moment instead of an easily-missed prefill.
- **Bug fix: "Compare to previous run" on an open run** (found live while testing this
  change): the link currently appears whenever the run's suite has *any* prior closed
  run, without checking that the *current* run is itself closed — since comparison
  requires both runs closed, this always leads to a "Comparison not found" dead end on
  an open run. Fixed by adding the same closed-run gate already used for the new
  "Compare…" button (below).
- **Stability card: two views instead of one, plus a real rendering-bug fix** (found
  live once this change's own Stability card shipped and was used against real data):
  a suite with several open runs and one closed run showed a confusing mismatch — Run
  history listed all of them, Stability's trend counted only the one closed run, with
  nothing in the UI explaining why. Separately, the trend's point markers rendered as
  squashed horizontal dashes instead of dots on a wide card — a real geometry bug (SVG
  circles living inside a non-uniformly-stretched viewBox), not just a styling gap.
  Both fixed together: the Stability card gains a "Closed runs" / "Open + closed" tab
  strip (two views of the same mark spec, not simultaneous), each with its own caption
  stating what it counts; point markers move out of the distorted SVG coordinate space
  into an absolutely-positioned HTML overlay, which also unlocks a real visual upgrade
  (area fill, faint grid, gap rings, an emphasized "you are here" endpoint, and a
  distinct hollow/dashed treatment for an open run's still-provisional point).
- **Stability headline never reflects a barely-started open run** (found live
  immediately after the above shipped): the giant pass-rate figure previously showed
  whatever the newest point's rate was, so a suite that just started a fresh,
  unexecuted run showed a misleading "0% pass" headline. Fixed by having the headline
  always walk back to the most recent *closed* run's rate, with a secondary "N in
  progress" indicator when newer open runs exist, and a placeholder when no closed run
  exists at all.
- **Run comparison picker rebuilt as a custom listbox** (found live immediately after
  the per-run "Compare…" entry points shipped): the picker's two dropdowns showed
  same-named runs with nothing to tell them apart. The native `<select>` elements are
  replaced with a custom listbox reusing the app's existing `RunRow` presentation
  (name, pass-rate health, relative date) for each option, and selecting a run on one
  side now removes it from the other's choices.
- **Bug fix: suite `PassRate` disagreed with its own Stability card** (found live
  immediately after D9 shipped): the Suite Detail sidebar's "Pass rate" property (and
  the Suites index cards, which read the same field) reflected the suite's most
  recently *created* run regardless of status, while the Stability card's headline
  (D8) had already been fixed to skip a trailing open run — same suite, same page,
  two disagreeing numbers. `SuiteRepo.latestRunStats` now applies D8's own rule at
  its source: `PassRate` reflects the most recent *closed* run (or the existing
  placeholder when none exists), while `LastRunAt` keeps its separate, correct
  "true last activity" meaning unchanged.
- **Stability's headline number removed, not reworded** (found live, immediately
  after D10 shipped: the user still found the card "confusing. A lot confusing."
  even once the sidebar and headline agreed): the `"{n}% pass · {n} runs"` hero
  number was this app's own template for a genuine cross-run aggregate elsewhere
  (`RunStatusBreakdown.tsx`, `CaseResultsPanel.tsx`), reused here for one run's own
  rate — a category error, not a copy problem. Replaced with a plain "Latest closed
  run" property (reusing the sidebar's own `HealthBar` vocabulary) plus a peer "In
  progress" property, both sitting above the Closed runs/Open + closed toggle so the
  fact no longer appears to change per view. Separately, at the user's own request,
  every chart point now reveals its name/date/rate via a real hover-or-focus
  tooltip (replacing an inert native `title`), and the most recent point carries an
  always-visible percentage label.
- **Stability chart gains y-axis percentage ticks; x-axis gets a date range, not
  per-point dates** (user request: "some legends in the axis"): 0%/50%/100% labels
  beside the existing gridlines. A per-point x-axis date was evaluated and rejected
  — points are laid out evenly by index, not by real elapsed time, so per-point
  dates would visually assert even time-spacing that isn't real; the oldest/newest
  run's date at each bottom corner gives honest orientation instead.

## Capabilities

### New Capabilities

(none — all changes extend existing capabilities)

### Modified Capabilities

- `ui-navigation`: "Suites index and detail page" gains the view/edit mode split and the
  new Stability/Run history content; "Run creation" gets updated confirmation copy and
  name-confirmation focus behavior; "Run comparison" (just synced from
  `add-run-comparison-view`) gains new per-run/per-row compare entry points and a bug
  fix to "Compare to previous run"'s visibility condition.

## Impact

- **Frontend**: `ConfirmBanner.tsx`, `SuiteDetailPage.tsx`, `SuitesPage.tsx`,
  `SuiteActionsMenu.tsx`, `RunPage.tsx`, `RunsPage.tsx`, `RunComparePickerPage.tsx`,
  `NewRunPage.tsx`, `SuiteCaseGrid.tsx` (new `onExit` prop). Likely a new shared
  run-row/run-section component extracted from `RunsPage.tsx` so the suite page's Run
  history card and the project Runs page share one implementation. `SuitePassRateTrend.tsx`
  is wired in AND substantially rewritten: its prop moves from `points:
  SuiteTrendPoint[]` to a normalized `points: TrendPoint[]`, point markers move from
  SVG `<circle>` elements to an absolutely-positioned HTML overlay (fixing a real
  rendering bug), and it gains an area fill, grid, and open/closed-distinct marker
  styling.
- **Backend**: `SuiteRepo.latestRunStats` and `SuiteRepo.List`'s batched stats query
  (`apps/api/internal/store/suites.go`) — `Suite.PassRate` now reflects the most
  recent closed run rather than the most recent run regardless of status (D10). No
  `openapi.yaml` shape change (still `PassRate *int`), no migrations. Every other
  piece of data this change surfaces (`run.name` in the create response,
  `GET /suites/{suiteKey}/trend`, `GET /projects/{projectKey}/runs`) already existed.
- **Docs**: `docs/test-management.md`'s Suites and Run creation sections need updating to
  describe the view/edit split and the new compare entry points.
- **Sample Project**: the existing seeded suites/runs already exercise these flows; no new
  seed data is strictly required, but worth a pass per the standing showcase rule.
