## Why

As a Tenant Admin, when I archive a project, I want it to genuinely stop
changing, so that "archived" means the project is frozen exactly as it was
when I put it aside — not just hidden from the default list while anyone
with permission can still silently edit its cases, run tests against it, or
reassign who has access. Today, archiving a project has zero effect on
writes: every case/suite/run/membership mutation endpoint works identically
on an archived project as on an active one, at both the HTTP API and the MCP
tool layer. That's a real gap between what "archived" implies and what it
actually does.

## What Changes

- Archived projects become read-only: every write to project content
  (cases, suites, folders, runs, run items, results, releases, test plans,
  requirements, comments, attachments, tags, custom fields) is rejected
  with `409 Conflict` while the project is archived, at both the HTTP API
  and the MCP tool layer (agents get the same enforcement as humans — no
  separate, weaker path).
- Project-membership and role changes (assigning/removing a user or team's
  role on the project) are rejected the same way while archived.
- Unarchiving stays reachable while archived (a project must be able to
  leave the state it's in) — but only as a bare `{"archived": false}`
  request; bundling any other field change into the same request while
  archived is rejected.
- Deleting an already-archived project is unaffected (deletion already
  requires `archived == true` as its own precondition).
- No Tenant Admin bypass — the read-only rule applies unconditionally.
  Archiving/unarchiving are already cheap, reversible, `manageProject`-gated
  actions, so an admin exemption would only reintroduce the ambiguity
  ("was this modified while archived, or not?") this change exists to
  remove.
- Favoriting/unfavoriting and tag assignment stay writable while archived —
  both are already specified as shared, low-stakes metadata gated at the
  `read` permission bar (`project-favorites`, `project-tags`), not "project
  content," and archiving a project shouldn't block a personal bookmark or
  a label.

## Capabilities

### New Capabilities

(none — this is a new constraint on existing write paths, not a new
capability of its own)

### Modified Capabilities

- `test-authoring`: the "Project management" requirement gains a new rule —
  a project's content becomes unwritable while it is archived, enforced
  uniformly across every content-mutation endpoint this capability and its
  sibling execution/requirements capabilities expose, with `409 Conflict`
  replacing today's silent success. Unarchiving itself remains the one
  exception.
- `project-membership`: the "Assigning users and teams to a project"
  requirement gains the same rule for membership/role writes.

## Impact

- **API**: every project-content mutation route (`apps/api/internal/server/handlers.go`)
  now returns `409` on an archived project; `packages/shared/openapi.yaml`
  gains that response documented on the affected paths (contract-first,
  `make generate` after editing).
- **Service layer**: new `Service.EnsureProjectWritable` helper
  (`apps/api/internal/service/project_rbac.go`), called from
  `Service.Authorize` (the shared HTTP+MCP chokepoint) and from the four
  project-membership methods that bypass `Authorize` today
  (`SetProjectMember`, `RemoveProjectMember`, `SetProjectTeamRole`,
  `RemoveProjectTeamRole`). `Service.UpdateProject` gets its own guard for
  the "only a bare unarchive is allowed while archived" rule.
- **Store layer**: new cheap `ProjectRepo.IsArchived` existence check
  (`apps/api/internal/store/projects.go`).
- **HTTP middleware**: `requirePermission` (`apps/api/internal/server/middleware.go`)
  splits into a shared core plus a `requirePermissionEvenIfArchived` variant
  for the 4 routes (of 91) that must stay reachable on an archived project
  (update, delete, and two reads gated at a stricter-than-`read` bar for
  unrelated reasons).
- **MCP tool layer**: every write tool in `apps/api/internal/mcp/write_tools.go`
  is covered for free via `Service.Authorize`, since MCP calls that function
  directly and never touch HTTP middleware.
- **No schema/migration change** — `archived` already exists on `projects`.
- **Sample Project showcase**: `apps/api/internal/sampledata/seed.go` needs
  a demonstration of this behavior, without archiving the always-public
  Sample Project itself (that would break its "immediately reachable and
  editable by an evaluator" purpose) — resolved in design.md.
- **Docs**: wherever project archiving is currently documented
  (`docs/test-management.md` or similar) needs the read-only behavior
  added, per this project's standing "docs are part of every change" rule.
