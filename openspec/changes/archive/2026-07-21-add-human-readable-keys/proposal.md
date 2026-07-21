## Why

Every entity in TestPulse today is addressed only by a raw UUID — in URLs
(`/projects/{uuid}/cases/{uuid}`), in API bodies, and in any place a human
needs to type, remember, or paste an identifier. This becomes a concrete
blocker for `add-execution-import` (#38): its `externalId` field, meant to
let a CI job match a JUnit XML `<testcase>` back to a TestPulse case, would
otherwise require a developer to copy a UUID into pytest source via
`record_property()`. The same unreadability shows up everywhere else a case,
run, or suite gets referenced outside the UI — Slack messages, commit
references, MCP tool calls from an agent, verbal discussion.

## What Changes

- `projects`, `test_cases`, `test_runs`, and `test_suites` each gain a `key`
  column: a short, unique, human-readable identifier generated at creation
  time and never edited afterward.
- **Project key**: auto-derived from the project's name (Jira-style
  suggest-key algorithm), guaranteed unique via a numeric-suffix fallback on
  collision, immutable once assigned.
- **Case/run/suite key**: `{projectKey}-{n}` for cases (the dominant,
  most-referenced entity type), `{projectKey}-R{n}` for runs,
  `{projectKey}-S{n}` for suites — a per-project, per-entity-type sequential
  counter, race-safe under concurrent creation.
- **BREAKING**: frontend routes switch from UUID path segments to key path
  segments for projects, cases, runs, and suites — e.g.
  `/projects/{uuid}` → `/projects/{projectKey}`,
  `/projects/{uuid}/cases/{uuid}` → `/projects/{projectKey}/cases/{caseKey}`.
  Folder routes are unaffected (folders stay UUID-addressed; out of scope).
  Any bookmarked/shared UUID-based URL from before this change stops
  resolving — acceptable pre-1.0 (no real deployment has data or bookmarks
  to preserve, per the project's migration policy).
- API responses for `Project`, `TestCase`, `Run`, `Suite` gain a `key` field
  alongside the existing `id` — `id` remains the stable internal identifier
  for any programmatic/foreign-key use; `key` is the human-facing one used
  in URLs, display, and future external-id matching.
- API path parameters for these four resources accept the key (not the
  UUID) going forward — resolved to the internal UUID once at the API
  boundary; every store/service method below that boundary is unchanged and
  continues operating on UUIDs exactly as it does today.

## Capabilities

### New Capabilities

- `resource-keys`: the cross-cutting identifier scheme — key generation,
  uniqueness, immutability, and the `id`/`key` duality contract that
  `test-authoring`, `test-execution`, and `ui-navigation` all build on.

### Modified Capabilities

- `test-authoring`: "Project management" gains project key generation;
  "Test case creation" gains case key generation; "Test suite grouping"
  gains suite key generation.
- `test-execution`: "Run creation pins case versions" gains run key
  generation.
- `ui-navigation`: routing requirements for the project switcher,
  breadcrumb trail, library navigation, and viewing a case/run/suite switch
  from UUID path segments to key path segments.

## Impact

- `apps/api/internal/db/migrations/00002_core_domain.sql` — amended in
  place (pre-1.0 policy): `key` column + unique index on `projects`,
  `test_cases`, `test_runs`, `test_suites`; a new `project_key_counters`
  table; a trigger (or equivalent) seeding counters and the project's own
  key at project-creation time.
- `apps/api/internal/domain/domain.go` — `Project`, `TestCase`, `Run`,
  `Suite` gain a `Key` field.
- `apps/api/internal/store/*.go` — key generation on create; new
  `GetByKey`-style resolution at the boundary used by handlers.
- `apps/api/internal/server/handlers.go` — path params resolve key → UUID
  before delegating to services (services/RBAC resolvers unchanged).
- `packages/shared/openapi.yaml` — `key` field on the four entities; path
  parameters documented as accepting the key.
- `apps/web/src/App.tsx` and every page/component that builds a link to a
  project, case, run, or suite (`Breadcrumbs.tsx`, `ProjectSwitcher.tsx`,
  `FolderExplorerPage.tsx`, `CaseDetailPage.tsx`, `RunPage.tsx`,
  `SuitesPage.tsx`, `RunsPage.tsx`, etc.) — route params and links switch to
  keys.
- `docs/` — new explanation of project/case/run/suite keys, how they're
  generated, and that URLs now carry them instead of UUIDs.
- Coordination note for whoever resumes `add-execution-import` (#38)
  afterward: its `externalId` design and `conftest.py` snippet should be
  revisited to use the new case key as the natural value pasted into
  `record_property()`, instead of a raw UUID — not implemented here, this
  change only makes that revision possible.
