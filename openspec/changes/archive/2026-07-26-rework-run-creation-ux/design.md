## Context

`SuiteCaseGrid.tsx` (shipped in `rework-suite-case-picker-scale`) already solves
the hard part of this problem — section-tree scoping, search, filter dropdowns,
virtualized rows bounded at scale, selection that survives all of the above — but
it's wired specifically for *suite membership editing*: its consumer
(`SuiteDetailPage.tsx`) diffs the returned selection against the suite's current
members and issues `PUT`/`DELETE` calls. `RunsPage.tsx`'s "New run" form needs the
same picking mechanics but a different consumer contract: build a set of case IDs
to hand to `POST /runs`, with no existing membership to diff against. A
Pepe/Fable-5 mockup (`mockup.html`, this directory), user-approved, is the
visual/interaction source of truth for both new surfaces (the reworked "New run"
form and the suite's "Run suite" quick action) — read it alongside this doc.

## Goals / Non-Goals

**Goals:**
- `RunsPage.tsx`'s "New run" form scopes to a real, searchable, filterable,
  virtualized case selection instead of silently including every project case.
- An optional suite selector seeds that selection from a suite's current members,
  fully editable afterward.
- `SuiteDetailPage.tsx` gains a "Run suite" action: one confirm step (name +
  case count), not zero-click and not a forced detour through the full form.
- The confirm dialog's "Customize selection" path and the suite selector on the
  Runs-page form are the *same* prefill mechanism, not two implementations.
- No regression to the suite-membership editor's existing behavior or tests.

**Non-Goals:**
- No change to run execution/triage (`RunPage.tsx`) — separately tracked in
  `rework-run-detail-ux`.
- No bulk actions or keyboard shortcuts on the picker — separately tracked (#82,
  #83).
- No backend change — `RunInput{SuiteID, CaseIDs}` already supports this end to
  end.

## Decisions

- **Extract the picker internals out of `SuiteCaseGrid` into a new
  `CasePicker` component; `SuiteCaseGrid` becomes a thin wrapper around it.**
  `CasePicker` owns the section tree, search, filters, virtualization, and
  selection state (`Set<caseId>` in, `onChange` out) with zero knowledge of what
  the selection is *for*. `SuiteCaseGrid` keeps its existing public API
  (suite membership diffing, Save/Cancel) and becomes `<CasePicker selected={...}
  onChange={...} folders={...} cases={...} />` plus its membership-diff footer.
  The reworked `RunsPage.tsx` form uses `CasePicker` directly with its own
  footer (name field, suite selector, "Create run"). This is a refactor of an
  already-well-tested component (27 tests on `SuiteCaseGrid.test.tsx` today) —
  those tests move to cover `CasePicker` where they test picker mechanics, and
  stay on `SuiteCaseGrid` where they test the membership-diff footer.
- **Choosing a suite in the "New run" form seeds *selection*, not *scope*.** A
  suite's cases can span multiple, unrelated sections (confirmed in the mockup
  with "Regression" spanning Authentication, Checkout, Settings, Notifications,
  and Reporting API) — scoping the tree to one section would hide most of the
  suite's own cases. Selecting a suite checks its current member case IDs and
  leaves the tree scope at "All sections," exactly as validated in the mockup.
  The prefill is a one-time seed, not a live binding — editing the selection
  afterward does not re-sync if the suite's membership changes later, and
  switching the suite selector back to "No suite" clears the selection rather
  than leaving stale suite-sourced picks in place.
- **The suite quick-run dialog fires the run directly on confirm; it does not
  route through the full `CasePicker`.** It shows the suite's current case count
  and an editable name only. This matches the research finding (no tool in the
  comparison set does blind zero-screen creation, but a fast path always reuses
  an already-defined scope with a visible count before commit) — the suite's
  member list already is that scope.
- **"Customize selection" deep-links to `RunsPage.tsx` via route state** (e.g.
  `navigate('/projects/{projectKey}/runs', { state: { seedFromSuite: suiteKey,
  seedName } })`), not query params (avoids leaking selection intent into a
  bookmarkable/shareable URL for what's meant to be a one-shot handoff). The
  Runs page reads `location.state` on mount, runs the same suite-seeding logic
  the dropdown uses, and shows a dismissible "Arrived from {suite}'s Run suite
  action" banner with a "Back to suite" link.
- **Ad hoc run creation gets no special-cased UI.** The suite selector's default
  value is "No suite," which is simply `CasePicker`'s natural empty-selection
  starting state — matches `Run.suiteKey` already being nullable at the domain
  level (`link-runs-to-suite`). No extra code path, per the mockup's Q4 answer.

## Risks / Trade-offs

- [Extracting `CasePicker` mid-flight touches a recently-shipped, well-tested
  component] → Accepted: the alternative (duplicating ~300 lines of tree/search/
  virtualization logic into `RunsPage.tsx`) is the exact pattern this session has
  repeatedly rejected elsewhere (N+1 duplication, drifting behavior between two
  copies). The extraction is mechanical — `SuiteCaseGrid`'s existing tests pin
  its outward behavior, so a red-green refactor is low-risk.
- [Route-state seeding is lost on a hard refresh of the Runs page] → Accepted:
  the deep-link is a one-shot convenience, not a durable link; a refreshed page
  simply shows the form in its normal (non-prefilled) state, which is not a
  broken or confusing outcome, just the form's default.

## Migration Plan

Pure frontend change, no schema/API impact. Ships as a regular deploy.
