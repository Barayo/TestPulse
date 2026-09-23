## Context

TestPulse has no built-in role hierarchy — permissions are per-project,
fully custom, ten (soon twelve) independently-toggleable flags unioned
across whatever roles a user holds directly or via team
(`apps/api/internal/domain/domain.go`). Project reads and writes are gated
by two independent chokepoints today:

- HTTP: `requirePermission` middleware (`apps/api/internal/server/middleware.go`),
  wrapping ~91 route registrations in `handlers.go`.
- MCP: `Service.Authorize` (`apps/api/internal/service/project_rbac.go`),
  called directly by every tool in `apps/api/internal/mcp/write_tools.go`
  and `read_tools.go` — the MCP JSON-RPC server is a separate entry path
  that never touches chi's router or `requirePermission` at all (agents are
  first-class actors per this project's standing architecture constraints,
  so this path must get identical enforcement, not a weaker approximation).

`Archived` currently affects neither chokepoint — it's read only by the
archive-toggle endpoint itself and as `DeleteProject`'s own precondition
(`archived == true` required to permanently delete). Four project-membership
methods (`SetProjectMember`, `RemoveProjectMember`, `SetProjectTeamRole`,
`RemoveProjectTeamRole` in `project_rbac.go`) bypass both chokepoints
entirely, gated only by `requireTenantAdmin` at the route level.

## Goals / Non-Goals

**Goals:**
- Every write to an archived project's content — at the HTTP API and the
  MCP tool layer, with no exceptions for actor kind — is rejected.
- Project-membership/role writes on an archived project are rejected the
  same way.
- Unarchiving remains possible (a project must be able to leave the state
  it's in).
- The rule is enforced at the minimum number of chokepoints that actually
  cover every real caller, not scattered per-handler.

**Non-Goals:**
- Not introducing a new authorization primitive (visibility/enumerability
  restrictions) — this is about **writes**, not about who can see an
  archived project exists. Out of scope, and not implied by "read-only."
- Not adding a Tenant-Admin bypass. See Decisions.
- Not changing background-worker behavior
  (`project_auto_archive_worker.go`, `run_retention_worker.go`,
  `project_deletion_worker.go`) — these run as system actors, never call
  `Authorize`/`requirePermission`, and are correctly outside this
  invariant's scope. `run_retention_worker.go` pruning old closed runs
  inside an archived project is existing, already-specified behavior
  (`add-data-retention`) and must keep working unmodified.
- Not closing the `claimPendingImportJob` race window (an import job
  created before archiving and claimed after) — accepted as a narrow,
  pre-existing edge case, not a hole this change needs to close, since
  `createImportJob` itself is now blocked while archived.

## Decisions

### 1. Enforce in the service layer, called from three places — not middleware alone

**Decision:** A new `Service.EnsureProjectWritable(ctx, projectID) error`
helper, backed by a cheap store existence check, called from:
1. `Service.Authorize` (covers every MCP write tool and every HTTP route
   that goes through `requirePermission`, for free).
2. `Service.UpdateProject` (its own guard — see Decision 3).
3. The four project-membership methods that bypass `Authorize` entirely.

**Why not middleware alone:** MCP tool calls never reach chi's HTTP
middleware — `write_tools.go` calls `svc.Authorize` directly. A
middleware-only fix would leave every scoped-agent-token MCP write
(`upsert_test_case`, `upsert_test_suite`, `create_test_run`,
`record_result`, etc.) able to mutate an archived project, which fails this
project's standing "agents are first-class actors" constraint outright.

**Why not `Authorize` alone:** the four RBAC-membership methods are gated
by `requireTenantAdmin` at the route level and never call `Authorize` or
go through `requirePermission` — neither existing chokepoint reaches them.

### 2. The check itself: cheap existence query, `409 Conflict` on archived

```go
// store/projects.go — mirrors checkRunOpen's lean single-column style
// (store/runs.go), not a full Projects.Get, since this now runs on every
// mutating request in the app.
func (r *ProjectRepo) IsArchived(ctx context.Context, id string) (bool, error) {
    var archived bool
    err := r.pool.QueryRow(ctx, `SELECT archived FROM projects WHERE id = $1`, id).Scan(&archived)
    if errors.Is(err, pgx.ErrNoRows) { return false, ErrNotFound }
    return archived, err
}

// service/project_rbac.go — same error-type convention runClosedAsConflict
// already established for "run is closed" (service.go).
func (s *Service) EnsureProjectWritable(ctx context.Context, projectID string) error {
    archived, err := s.store.Projects.IsArchived(ctx, projectID)
    if err != nil { return err }
    if archived { return conflict("project is archived") }
    return nil
}
```

**Why 409, not 403:** this isn't a permission failure — it's "the target
rejects writes regardless of permission," the same class of rejection the
existing closed-run check (`runClosedAsConflict`,
`ClosedRunRejectsMutationsWith409`) already established. Reusing that
convention rather than inventing a new error shape or status code.

**Alternative considered:** a boolean field on every write DTO
(`allowArchived`). Rejected — pushes the decision to every call site
instead of centralizing it, the opposite of what this change is trying to
achieve.

### 3. `Authorize`'s discriminator: `perm != domain.PermRead`

```go
func (s *Service) Authorize(ctx context.Context, perm domain.Permission, projectID string) error {
    // ... existing tenant-admin / scoped-token / EffectivePermissions logic, unchanged ...
    if perm != domain.PermRead {
        if err := s.EnsureProjectWritable(ctx, projectID); err != nil { return err }
    }
    return nil
}
```

Confirmed at both MCP read-tool call sites (`read_tools.go`) that
`domain.PermRead` is the only permission they ever pass, and confirmed via
a full grep of `handlers.go` that this discriminator is **not** naive:

- Favorite/unfavorite and tag assign/remove are real mutations but are
  deliberately gated at the `PermRead` bar (`project-favorites`,
  `project-tags` specs: "the same permission bar as starring a project...
  shared project state, not per-user"). `perm != PermRead` correctly
  leaves them writable on an archived project for free — they aren't
  "project content," and blocking them would need special-casing for
  zero-risk metadata nobody asked to lock down.
- `getImportJob` and `folderDeletePreview` are pure reads gated at a
  stricter-than-`PermRead` bar for unrelated reasons (`PermManageProject`,
  `PermSectionDelete`). These need explicit exemption (Decision 4) since
  naively applying the gate to every non-`PermRead` permission would
  incorrectly 409 a read.

### 4. HTTP middleware: split into two named entry points, 4 of 91 call sites change

```go
func (h *api) requirePermission(perm domain.Permission, resolve projectIDResolver) func(http.Handler) http.Handler {
    return h.requirePermissionOpt(perm, resolve, true)
}

// requirePermissionEvenIfArchived: reserved for routes that are either a
// pure read gated at a stricter-than-read bar for unrelated reasons
// (getImportJob, folderDeletePreview), or the project's own lifecycle
// endpoints, which must stay reachable ON an archived project
// (updateProject — to unarchive it; deleteProject — which already
// requires archived == true as its own precondition).
func (h *api) requirePermissionEvenIfArchived(perm domain.Permission, resolve projectIDResolver) func(http.Handler) http.Handler {
    return h.requirePermissionOpt(perm, resolve, false)
}
```

Only `updateProject`, `deleteProject`, `getImportJob`, and
`folderDeletePreview` switch to the new variant. The other 87
`requirePermission` call sites are untouched and get the archived gate
automatically, since `blockArchived=true` was already `requirePermission`'s
only behavior before this change.

### 5. Membership methods get one explicit leading call each

```go
func (s *Service) SetProjectMember(ctx context.Context, actor domain.Actor, projectID, userID, roleID string) error {
    if err := s.EnsureProjectWritable(ctx, projectID); err != nil { return err }
    // ... existing body unchanged ...
}
```
Same one-line addition to `RemoveProjectMember`, `SetProjectTeamRole`,
`RemoveProjectTeamRole`.

### 6. Unarchiving: only a bare `{"archived": false}` is permitted while archived

`UpdateProject` handles every project-settings field (name, description,
archived, publicAccess, autoArchiveExempt,
assigneeRestrictedRecording, landingView) through one general patch.
Isolating "just the unarchive part" of a mixed request has no clean
answer (would the rename apply before or after unarchiving?), so the rule
is unambiguous instead:

```go
func (s *Service) UpdateProject(ctx context.Context, id string, upd ProjectUpdate) (domain.Project, error) {
    // ... existing "nothing to update" validation ...
    current, err := s.store.Projects.Get(ctx, id)
    if err != nil { return domain.Project{}, err }
    if current.Archived {
        unarchiving := upd.Archived != nil && !*upd.Archived
        onlyUnarchiving := unarchiving && upd.Name == nil && upd.Description == nil &&
            upd.PublicAccess == nil && upd.AutoArchiveExempt == nil &&
            upd.AssigneeRestrictedRecording == nil && upd.LandingView == nil && upd.ClearLandingView == nil
        if !onlyUnarchiving {
            return domain.Project{}, conflict("project is archived; unarchive it before making other changes")
        }
    }
    // ... rest unchanged ...
}
```

### 7. No Tenant Admin bypass

`EnsureProjectWritable` runs unconditionally, after any actor-kind bypass
already granted by `Authorize`/`requirePermission`. Archiving and
unarchiving are already cheap, reversible, `manageProject`-gated actions
(`test-authoring` spec) — a silent admin exemption buys no operational
value and reintroduces the exact ambiguity ("was this modified while
archived, or not?") this change exists to remove. A future break-glass
path, if ever needed, should be its own explicit, audited action — not an
exemption baked into this check.

### 8. Sample Project showcase

The always-public, always-seeded Sample Project must stay archived-free —
archiving it would break its "immediately reachable and editable by an
evaluator" purpose, the opposite of what the showcase rule wants. Instead,
`seed.go` gains a **second, minimal seeded project** — private (not
public), a handful of cases, no runs — created already archived, purely to
demonstrate the read-only behavior to an authenticated Tenant Admin
browsing their project list. It participates in the (separately in-flight,
not part of this change) collapsed "Archived · N" section on
`ProjectsPage.tsx` once that ships.

## Risks / Trade-offs

- **[Risk]** A caller depending on today's (arguably accidental) ability to
  edit an archived project silently breaks. → **Mitigation:** this is the
  intended behavior change; `409 Conflict` with a clear message
  ("project is archived") is actionable, and unarchiving is always one
  call away.
- **[Risk]** Missing a write path that doesn't go through `Authorize`,
  `requirePermission`, or the four membership methods. → **Mitigation:**
  the HTTP-layer test (`TestScenario_ArchivedProjectRejectsMutationsWith409`)
  exercises a representative sample across every content type listed in the
  proposal; any route added later that forgets `requirePermission` (or its
  `EvenIfArchived` variant) already fails the existing "every mutating
  route requires a permission" convention this codebase follows, independent
  of this change.
- **[Trade-off]** Splitting `requirePermission` into two named functions
  adds one more concept to the middleware layer. Accepted — the
  alternative (a boolean parameter on every `requirePermission` call site)
  is noisier at all 91 call sites instead of 4.

## Migration Plan

No schema or data migration — `archived` already exists on `projects`.
Pure application-layer change:
1. Store + service layer (`IsArchived`, `EnsureProjectWritable`) — unit
   tested in isolation first (red-green).
2. Wire into `Authorize` — MCP test coverage.
3. Split `requirePermission`, switch the 4 call sites — HTTP test coverage.
4. Membership methods — service test coverage.
5. `UpdateProject`'s unarchive-only guard.
6. `openapi.yaml` 409 response documentation + `make generate`.
7. `seed.go` + `seed_test.go` — the second, archived showcase project.
8. Docs update.

No rollback complexity beyond a normal revert — no data is migrated or
transformed.

## Open Questions

- None blocking. The one deferred question (a future break-glass/admin
  override) is explicitly punted per Decision 7, not left ambiguous.
