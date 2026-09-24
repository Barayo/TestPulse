## Why

As a project admin trying out an import from TestRail, Qase, Zephyr Scale, or
Kiwi TCMS, when my dry-run preview fails or I navigate away while
"Scanning..." is running, I want the incomplete attempt to be visible and
cleanable, so I don't end up with permanent, empty "ghost" projects
cluttering my workspace with no trace of what happened or why.

A QA exploratory pass (2026-09-16) against a real local deploy reproduced
this for all four shipped structural importers: `ImportProjectPage.tsx`
creates the real target project before the import job is even attempted, so
closing the tab or navigating away during the dry run permanently orphans an
empty project with zero indication it came from a failed import — there is
no per-project import-jobs list endpoint to discover it happened. The same
pass found raw internal Go error chains (including an internal job UUID in
one case) surfacing verbatim in the job-status UI for 3 of 4 sources, with
no actionable next step.

## What Changes

- Add a per-project import-jobs list endpoint so a project's import history
  (including abandoned/failed attempts) is queryable — the missing piece
  that makes an orphaned project's origin undiscoverable today.
- When a project has no content yet and has at least one associated import
  job, replace the generic "Get started" empty-state on its Overview page
  with the latest job's status, source, and (if failed) a sanitized error —
  with a clear path to either retry the import or archive-and-delete the
  project via the existing project lifecycle.
- Add a shared, vendor-agnostic error-classification layer in the
  import-connector so a failed job's stored error is always a short,
  actionable, user-appropriate message (connectivity, authentication, not
  found, or unexpected-failure categories) instead of a raw wrapped Go error
  chain or an internal job UUID.
- Align the "Need a credential?" help copy across all four Connect screens
  in the wizard (including adding one for Kiwi TCMS, currently missing).
- **Not changing**: project creation stays eager (still happens on Connect
  submit, before the dry run). See design.md for why deferring it was
  considered and rejected in favor of visibility.

## Capabilities

### New Capabilities
- `import-job-visibility`: a project's import-job history is listable and
  surfaced on an otherwise-empty project, with sanitized, actionable error
  messages — closing the discoverability gap that makes today's orphaned
  imports invisible.

### Modified Capabilities
(none — no existing capability's requirements change; the four vendor
import specs (`testrail-import`, `qase-import`, `zephyr-scale-import`,
`kiwi-tcms-import`) keep their current requirements as-is, since this change
adds a new cross-cutting capability rather than altering how any one of them
maps vendor data.)

## Impact

- **Backend**: new `GET /api/v1/projects/{projectKey}/import-jobs` endpoint
  (`apps/api/internal/store/import_jobs.go`, `service/import_jobs.go`,
  `server/import_job_handlers.go`), `packages/shared/openapi.yaml`. No
  migration — all needed columns already exist.
- **import-connector** (`tools/import-connector/`): new shared error
  classification used by `internal/poller/poller.go` before calling
  `CompleteJob`, applied uniformly across all vendor clients.
- **Frontend**: `apps/web/src/pages/ProjectPage.tsx` (empty-state branch),
  `apps/web/src/pages/ImportProjectPage.tsx` (Connect-screen help copy
  consistency pass).
- **Docs**: `docs/integrations.md` (note the import-jobs list endpoint and
  the cleanup path for an incomplete import).
- **Sample Project**: exempt — this is a resilience/visibility fix for a
  failure path, not new user-facing capability the Sample Project would
  showcase (CLAUDE.md's Sample Project rule applies to features, not error
  handling for an abandoned wizard flow).
