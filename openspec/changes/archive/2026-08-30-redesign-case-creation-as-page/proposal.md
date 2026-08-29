## Why

As a test author, when I create a case with a Gherkin scenario, a long
free-text description, or the full classification field set alongside the
new Format picker (`add-case-authoring-formats`), I want a layout with real
room for that content, so creation doesn't feel cramped into a fixed
420px side panel. The "New test case" drawer (`CaseDrawer.tsx`) was
originally scoped for a short title + step list; it now carries a full
classification block plus a potentially large content editor and reads as
overloaded. Filed as GH issue #146 during `add-case-authoring-formats`'
browser validation.

## What Changes

- **BREAKING (UI only, no API change)**: case creation moves from a
  slide-over drawer to a dedicated route,
  `/projects/{projectKey}/cases/new`, reusing `CaseDetailPage`'s shell
  (breadcrumb, header, `grid-cols-[1fr_320px]` content+sidebar layout) —
  the same shape already used for viewing and in-place editing a case
  (`add-case-authoring-formats`), so creating, viewing, and editing a case
  now all look like the same page in different states.
- The target folder carries over via a `?folderId=` query param (the
  folder is already addressable in the URL at `/library/:folderId`, so
  this is consistent, bookmarkable, and survives a refresh) — not
  `location.state`, since state-seeding is a one-shot pattern better
  suited to prefilling a form (`NewRunPage`'s use of it), not to
  identifying *where* the created entity belongs.
- On successful creation, the page navigates to the new case's own detail
  page (`/projects/{projectKey}/cases/{caseKey}`) — matching
  `NewRunPage`'s "create and land on the result" pattern — rather than the
  drawer's old "close and refresh the list in place" behavior.
- The format picker, content editor (steps/text/gherkin), and
  classification-field editing UI are extracted into a shared component
  used by both the new create page and `CaseDetailPage`'s existing
  in-place edit mode — today those two duplicate nearly identical markup
  (a direct side effect of shipping `add-case-authoring-formats`'s edit
  mode and this drawer in quick succession); consolidating avoids two
  copies drifting apart.
- `CaseDrawer.tsx`, `StepEditor.tsx`'s standalone (non-`CaseStepsList`)
  usage, and the "New test case" drawer button in `FolderExplorerPage.tsx`
  are removed, replaced by a link to the new route.
- `apps/web/e2e/ui-navigation.spec.ts`'s one dialog-scoped locator
  (`page.getByRole('dialog', { name: /new test case/i })`) is updated to
  scope by page/main-content instead.

## Capabilities

### New Capabilities

(none — this changes how case creation is presented, not what it does)

### Modified Capabilities

- `test-authoring`: the "Test case creation" requirement's UI-facing
  scenarios (currently describing "the drawer") are updated to describe a
  dedicated page instead.

## Impact

- **Frontend routes**: `apps/web/src/App.tsx` — new route in
  `ACCOUNT_ONLY_ROUTES` (case creation requires `caseCreate`, same
  authenticated-only access as `NewRunPage`).
- **Frontend components**: new `CreateCasePage.tsx`; new shared case-editor
  component (name TBD in design.md) extracted from `CaseDrawer.tsx` +
  `CaseDetailPage.tsx`'s edit mode; `CaseDrawer.tsx` removed;
  `FolderExplorerPage.tsx`'s "+ New test case" button becomes a `Link`.
- **E2E**: `apps/web/e2e/ui-navigation.spec.ts`'s dialog-scoped locator;
  every other spec using `getByRole('button', { name: /new test case/i })`
  + `getByLabel(...)` should survive unchanged per the research already
  done (none scope to a dialog container).
- **No backend/API changes** — same `POST /api/v1/projects/{projectKey}/cases`
  endpoint, same request/response shape.
- **Docs**: `docs/test-management.md`'s description of case creation
  ("Click **+ New test case** ... to open a side drawer") needs updating.
