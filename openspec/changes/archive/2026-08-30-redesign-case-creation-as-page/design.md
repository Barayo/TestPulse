## Context

`CaseDrawer.tsx` (420px slide-over) and `CaseDetailPage.tsx`'s in-place
edit mode (`add-case-authoring-formats`) now duplicate nearly identical
markup: a format picker (Steps/Free text/Gherkin segmented control), a
conditional content editor (`CaseStepsList` in edit mode / description
`Textarea` / `GherkinEditor`), and the confirm-before-switch dialog driven
by `useCaseFormatSwitch`. `CaseDetailPage`'s shell (breadcrumb → header →
`grid-cols-[1fr_320px]` content+sidebar) is already documented in
`docs/design-system.md` as this app's canonical entity-detail shape,
itself the result of an earlier drawer→page promotion for viewing/editing
a case. This change repeats that same promotion for *creating* one.

## Goals / Non-Goals

**Goals:**
- Case creation gets a dedicated page (`/projects/{projectKey}/cases/new`)
  using the same shell as viewing/editing a case.
- The format picker + content editor markup is extracted into one shared
  component (`CaseFormatEditor`) so `CreateCasePage` and
  `CaseDetailPage`'s edit mode stop duplicating it.
- Creating a case still POSTs to the same existing endpoint; this is a
  frontend-only, UI-shape change.

**Non-Goals:**
- No change to the classification-field (priority/tags/platform/testType/
  automated/custom fields) editing UI itself, or to extracting it into a
  shared component. `CaseDetailPage`'s version lives interleaved with
  read-only `PropertyRow`s (Version, In suites, Jira) that don't exist for
  an uncreated case — forcing a shared component now would mean an
  awkward "which rows apply" prop surface for a small amount of
  deduplication. `CreateCasePage`'s sidebar re-implements just the
  editable subset directly; revisit extraction later if a third consumer
  appears.
- No change to project or suite creation (still dialogs) — this is
  case-creation-specific, following the same precedent `NewRunPage`
  already set for runs without generalizing a rule for every entity.
- No backend/API/OpenAPI changes.

## Decisions

**Route: `/projects/:projectKey/cases/new`, in `ACCOUNT_ONLY_ROUTES`.**
Matches the `runs/new` precedent exactly (`NewRunPage`, same
`RequireAuth`-gated array) — case creation requires `caseCreate`
permission, never available anonymously, so it doesn't belong in
`PROJECT_CONTENT_ROUTES` (the public/anonymous-content array) alongside
`/cases/:caseKey`. Static `/new` segment matches before the `:caseKey`
dynamic segment (identical to `runs/new` vs. `runs/:runKey` today) — no
route-ordering risk.

**Target folder via `?folderId=` query param, not `location.state`.**
A folder is already addressable in the URL (`/library/:folderId`), so
carrying it forward as a query param keeps "where does this belong" a
first-class part of the create page's own URL — bookmarkable, and
survives a refresh (unlike route state, which `NewRunPage`'s own comment
already documents as one-shot/non-durable). `location.state` remains the
right tool for *prefilling form fields* (as `NewRunPage` uses it), just
not for identifying the target entity's parent.

**On success, navigate to the new case's detail page — don't return to
the Library.** Matches `NewRunPage`'s "create and land on the result"
pattern. The drawer's old behavior (close, stay on the Library, refresh
the list) was a drawer-specific affordance — a full page has nowhere to
"close" back to except a real navigation, and landing on the created
case's own page confirms the result concretely (title, assigned key,
version 1) rather than requiring the user to relocate their new case in a
refreshed list.

**Extract `CaseFormatEditor` as one self-contained component**, owning
the format picker, the conditional content body, and the confirm dialog
internally (wrapping `useCaseFormatSwitch` itself rather than exposing
its plumbing to callers). Props: `{ format, steps, description,
gherkinSource, onFormatChange, onStepsChange, onDescriptionChange,
onGherkinSourceChange }` — a controlled component, so both
`CreateCasePage` and `CaseDetailPage` keep owning their own state and
`saveEdit`/`submitCreate` logic; only the picker+editor+confirm-dialog
*markup* is shared. `CaseDrawer.tsx` is deleted entirely (its
classification-field layout doesn't survive as a separate component —
`CreateCasePage` builds its sidebar directly, matching
`CaseDetailPage`'s inline `PropertyRow`-editing style established in
`add-case-authoring-formats`).

**`StepEditor.tsx` is deleted.** It was already superseded in
`add-case-authoring-formats` for `CaseDetailPage`'s edit mode
(`CaseStepsList`'s editable variant); once `CaseDrawer.tsx` is gone,
`StepEditor.tsx` has no remaining callers. `CaseFormatEditor`'s steps
branch uses `CaseStepsList` (editable) exclusively.

## Risks / Trade-offs

- **E2E churn** → dozens of specs call `getByRole('button', { name: /new
  test case/i })` then interact via `getByLabel(...)`; research confirmed
  none scope to a dialog container except one locator in
  `ui-navigation.spec.ts`. Mitigation: fix that one locator; run the full
  e2e suite (not just the affected file) before calling this done, since
  "should survive unchanged" is a prediction, not a guarantee.
- **Behavior change: creation now navigates away from the Library**,
  whereas the drawer kept you there. A user who creates several cases in
  a row in the same section now has to navigate back each time.
  Mitigation: the new page's breadcrumb and a "back to {folder}" link
  make the return trip one click, matching how `CaseDetailPage` itself
  already handles "back" (design-system.md's documented breadcrumb-only
  back pattern) — accepted as a reasonable trade for giving creation real
  room, not treated as a regression to prevent.
- **Losing the "create explicitly scoped to the folder you were
  browsing" affordance** if a user navigates to `/cases/new` without a
  `folderId` (e.g., a manually edited URL). Mitigation: default to the
  project's root folder when `folderId` is absent or invalid, the same
  fallback `CaseDrawer`'s creation flow already relies on server-side
  today (empty `folderId` resolves to root, per
  `apps/api/internal/store/cases.go`'s `Create`).

## Migration Plan

Frontend-only; no data migration. Ship as one change: new page + shared
`CaseFormatEditor` + route + `FolderExplorerPage` link swap +
`CaseDrawer.tsx`/`StepEditor.tsx` deletion, in the same PR — an
intermediate state with both old and new creation UI live would just be
dead code to delete a moment later, not a real incremental rollout worth
staging.
