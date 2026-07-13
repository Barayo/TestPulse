# Redesign UI

## Why

The v0.1 UI shipped functionally complete (`add-core-domain`) but visually generic — stacked, identically-bordered cards with no distinctive identity, and no navigation structure: no breadcrumbs, no persistent orientation, and suite→case membership shown only as a bare count. This is real UX debt from the "thin authoring forms" MVP scope decision (see `ROADMAP.md`), not something previously deferred to a later release — it needs addressing before more pages are added on top of the same pattern.

## What Changes

A first redesign pass (persistent project sidebar, Corona-inspired palette) was fully
implemented and tested but rejected on visual/IA review — see `design.md`'s Context for
the specific feedback. This proposal replaces it entirely:

- **Visual system**: a teal palette derived directly from the existing TestPulse brand
  mark's gradient (`assets/brand/testpulse-icon.svg`), not an independently-chosen palette
  — resolves the "doesn't feel like the brand" rejection. Applied across the app shell,
  `ProjectsPage`, `ProjectPage`, `RunPage`, and the new folder-explorer/case-detail views
  below. Geist Sans/Mono typography is unchanged from the first pass.
- **Project switching**: a compact header element showing the active project, plus a ⌘K
  command palette (searchable, per-project summary stats) — replaces the always-visible
  sidebar, matching that people work in one project at a time.
- **Project landing**: three independent panels (Carpetas / Suites / Runs recientes), each
  showing its top rows with a "ver todas" link — replaces both the rejected "show
  everything" page and a single-view alternative, since projects lean on folders vs. suites
  differently (configurable landing per project is deferred, see `design.md` D4).
- **Folder browsing**: a two-pane explorer (tree navigation + selected folder's content
  list) replacing a flat indented tree, which breaks down at realistic content density.
  Folders can contain both subfolders and cases directly.
- **Creating folders and cases**: inline row editing for folders (no modal, no parent
  picker — parent is always implicit from where creation was triggered), a right-docked
  drawer for cases exposing the already-existing `Step{action, expected}` fields that had
  no UI before.
- **Viewing/editing an existing case**: the same drawer in a view/edit mode, adding a
  version-history section backed by the existing `GET /cases/{caseId}/versions` endpoint.
  An execution-history section was designed but is explicitly *not* implemented in this
  change — it needs a cross-run query that doesn't exist yet (see `design.md` D7).
- **`/projects` page**: a project list with "+ Nuevo proyecto" isolated in its own header
  row (not inline in the list) so a future role gate can hide it without a layout change.
- **Seed data**: a dev-only `make seed-demo` target populating two realistic example
  projects, used throughout this design's brainstorming to validate against real density
  instead of toy data.

**Explicitly out of scope**: any backend/API change, any new domain capability,
`packages/shared/openapi.yaml`, and all of `apps/api`. Every interaction above was checked
against the existing OpenAPI contract; where something would need a new endpoint (the
execution-history strip), it is deferred rather than half-built. This remains a
UI-and-IA-only change.

## Capabilities

Visual retheming (color/type tokens) is not itself spec-worthy behavior. Navigation and
project/case browsing, however, are new observable, testable behavior and get their own
capability spec so they stay covered by the project's standing TDD/BDD practice (every
scenario becomes an automated test). The domain requirements in `test-authoring` and
`test-execution` are unaffected — this change only adds a navigation and browsing layer on
top of them.

### New Capabilities

- `ui-navigation`: Persistent orientation while browsing TestPulse — a breadcrumb trail, a
  project switcher (compact header + ⌘K palette), a per-project landing showing top-level
  structure, and a folder explorer with case creation/viewing/editing — so a user is never
  left wondering "where am I," "what does this project contain," or "how do I add
  something here."

### Modified Capabilities

<!-- None — no requirement-level behavior changes; test-authoring and test-execution specs are unaffected. -->

## Impact

- **Code**: `apps/web/src/index.css` (design tokens), `apps/web/src/App.tsx` (shell,
  breadcrumbs, ⌘K palette), `apps/web/src/pages/*.tsx` (landing, folder explorer, status
  badges), new components under `apps/web/src/components/` (e.g. `ProjectSwitcher`,
  `FolderExplorer`, `CaseDrawer`, `Breadcrumbs`), a `make seed-demo` target and its seed
  script.
- **Tests**: existing Vitest component tests and Playwright E2E specs must keep passing;
  any tests coupled to copy/structure that changes (in particular, anything from the first,
  rejected sidebar-based pass) are updated in this same change per CLAUDE.md's TDD/BDD
  practice. New component and E2E coverage is added test-first for the switcher, landing,
  folder explorer, and case drawer.
- **No impact** on `apps/api`, the database schema, or the OpenAPI contract.
