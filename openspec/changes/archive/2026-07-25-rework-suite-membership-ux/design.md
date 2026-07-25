## Context

`CasePicker.tsx` and `SuiteDrawer.tsx` exist only for suite membership (confirmed: no other importers besides their own test files; `UserPicker.tsx` only references `CasePicker.tsx` in a comment describing a similar-but-separate pattern, not an import). Suite membership is already a plain n:m relationship at the API layer (`PUT`/`DELETE /suites/{suiteKey}/cases/{caseKey}`, one call per case) — nothing about the API needs to change, only how the UI drives it. A user-reported mockup validation pass (Fable-5-drafted interactive HTML) precedes implementation here, per the user's explicit request to validate the design before writing code.

**Validated mockup**: `mockup.html` in this change directory (approved as-is, task 0.1) — the reference for the checkbox-grid's visual/interaction shape: filter row (Tag/Priority/Platform/Test Type + Clear filters), scrollable row list with pill-tagged cases, a persistent selection bar below the grid, and distinct empty states for "no cases match" vs. a freshly-created suite. Open it directly in a browser (self-contained HTML, no build step) to see the exact interaction being implemented.

## Goals / Non-Goals

**Goals:**
- One shared component (`SuiteCaseGrid`) driving both suite creation and suite membership editing.
- Filter-safe selection: changing a filter never silently drops an already-checked case.
- Retire `CasePicker.tsx` and `SuiteDrawer.tsx` entirely.

**Non-Goals:**
- "Select all matching this filter" bulk-add — explicitly deferred (proposal.md).
- Virtualizing the case list for very large projects (hundreds+ of cases) — today's largest real project (dogfood, TD) has 62 cases; revisit if/when a project's case count makes an unvirtualized list genuinely slow, not preemptively.
- Suite creation directly from a filtered subset via URL/deep-link (e.g., "create a suite from this filtered case list") — a nice extension, not part of this change.

## Decisions

**One component, two modes (`mode: 'create' | 'edit'`), not two components.** Both screens are "here's the full case list with some checked, adjust and commit" — the only real differences are the commit button's label/enabled-condition and whether there's a name field above the grid. Modeling this as one component with a mode prop (rather than two similar components, or one component covering only the grid with each page building its own name-field/button wrapper) keeps the filter-safe-selection logic and the row rendering in exactly one place — the actual point of this whole redesign is "one mental model," which a forked component would quietly undermine.

**Selection state: `Set<string>` of case IDs, owned by the parent page, passed down as `selected` + `onToggle`.** The grid itself owns filter state (tag/priority/platform/testType — four dropdowns, matching the validated mockup; no free-text search box) internally, since filters are pure presentation over a fixed `cases` prop and don't need to escape the component. Selection is lifted up because "create" needs it to build the initial `POST /suites` case list, and "edit" needs to diff it against the original membership on save — both are parent-level concerns.

**Diffing for edit, not a full replace-membership call.** On "Save changes," compute `added = selected − originalMemberIds` and `removed = originalMemberIds − selected`, then issue the existing `PUT`/`DELETE /suites/{suiteKey}/cases/{caseKey}` once per changed case (in parallel via `Promise.all`, not sequential — these are independent membership rows, no ordering dependency). No new bulk-membership endpoint — the number of changes in one edit session is small (a human checking boxes), so N small requests is fine; this is a different scale problem than the "hundreds of cases" case, which is about rendering, not request count.

**Platform/Test Type filters draw their options from the project's actual case data, not a fixed enum.** Both fields are free text (`add-case-classification-fields` design.md's deliberate choice, not an oversight) — the filter dropdown for each is populated from the distinct non-empty values already present among the project's cases (plus an implicit "All"), computed client-side from the `cases` prop already being fetched. No new API endpoint for "distinct platform values" — the full case list for the project is already loaded to render the grid itself.

**Suite creation still calls `POST /projects/{projectKey}/suites` then per-case `PUT /suites/{suiteKey}/cases/{caseKey}`, not a new "create with cases" endpoint.** Two round trips' worth of latency (create, then N adds) is invisible to the user behind one "Create suite (N)" click and a loading state; inventing a bulk-creation endpoint purely to save request count isn't worth a schema/API change for what's a UI-layer problem.

## Risks / Trade-offs

[Risk] Removing `SuiteDrawer.tsx`'s dedicated "open via `#suite-{key}` URL hash" entry point (used today so a suite can be deep-linked open) needs to carry over to the new edit view — confirm this during implementation, don't let it quietly regress.

[Risk] `UserPicker.tsx`'s comment ("Mirrors CasePicker.tsx — same search-dialog-over-a-list-of-options shape") becomes stale once `CasePicker.tsx` is deleted. Small — update the comment as part of this change's cleanup, not a separate change.

## Migration Plan

No data migration — UI-only change over an existing API shape. Manually verify against the Sample Project and dogfood (TD) project's existing suites (both already have real membership data) as part of verification, per the docs/development.md compose-stack loop.
