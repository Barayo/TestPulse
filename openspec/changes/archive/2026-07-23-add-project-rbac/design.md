## Context

`add-identity-basics` (shipped) gave every user exactly one instance-wide role, `admin` or `member`, and both can fully read/write every project — the two-role model was a deliberate v0.1 placeholder (`domain.go`'s comment on `Role`: "There is no per-project scoping yet — that arrives with add-project-rbac").

This change is that arrival. It replaces the flat role with: one instance-wide flag (**Tenant Admin**) and three **project-scoped roles** (Project Admin, Contributor, Tester), assignable to a user directly or via a **Team**. It also removes `projects.owner_id` (`enrich-project-list`, nullable, set at creation) entirely — that field was purely informational and gated nothing; now that real project membership exists, keeping a separate "nominal owner" concept alongside it would be redundant and confusing (per direct user feedback during implementation: "we just need the admin to be able to assign people, teams and roles to the project").

Constraint from `CLAUDE.md`: agents are first-class actors, never SSO, and every capability must treat "actor" as human-or-agent. The existing token design already established the pattern this change follows: `AuthenticateToken` resolves an agent's `Actor.Role` from its creator, "acting at its creator's role, never impersonating" (D1/D3.1) — a token's *identity* (for audit) is its own, but its *permission level* is derived from the human who created it. Project RBAC extends this same pattern rather than inventing a new one: a token's effective project roles are its creator's, resolved fresh on every request (so revoking/reassigning the creator's access immediately affects every token they've created).

## Goals / Non-Goals

**Goals:**
- Real project isolation: a non-Tenant-Admin user only sees/acts on projects they're a member of.
- Fully custom, instance-wide, Tenant-Admin-editable roles — create/rename/delete roles and toggle what each one can do (D10; revises the original "three fixed hardcoded roles" goal after further review — see D10 for why "customizable later" collapsed into "customizable now").
- Teams as a reusable, instance-wide group assignable to any project with its own role per project.
- Every case/folder/suite/run/run-item route enforces the caller's effective *permissions* on that resource's project (D10).
- Agents (API tokens) participate correctly: permission level inherited from creator, identity kept separate for audit.

**Non-Goals:**
- Per-project role customization — a role's permissions are the same everywhere it's assigned, not redefinable per project (D10).
- SSO / external identity provider mapping to roles (`add-sso-oidc`, separate v0.2 change).
- Generic custom fields or a project-admin "add new fields to the view" capability (a different, earlier-flagged idea — out of scope here).
- Configurable platform taxonomy per project (separate, not-yet-started change).
- Team-level settings beyond a name and membership list (no team description, no nested teams).

## Decisions

### D1: `users.role` (admin/member) → `users.is_tenant_admin boolean`

The old two-value enum collapses to one boolean because "member" no longer means anything on its own — a non-tenant-admin user's access is now entirely determined by project membership. `domain.Role` is repurposed to mean *project role* only (`ProjectAdmin` / `Contributor` / `Tester`); there is no more instance-wide `Role` type.

`domain.User.Role` field is removed; `domain.User.IsTenantAdmin bool` replaces it. `ParseRole` now parses project roles, not instance roles.

**Alternative considered**: keep a `users.role` enum with a fourth `tenant_admin` value alongside `admin`/`member`. Rejected — `member` has no remaining meaning post-migration, so keeping the enum just carries dead states forward.

### D2: Project role ordering is a total order: Tester < Contributor < ProjectAdmin

Every permission Tester has, Contributor also has (plus create/update on cases/folders/suites); every permission Contributor has, Project Admin also has (plus delete, plus project settings). This lets enforcement be a single ordinal comparison (`effectiveRole >= requiredMinRole`) instead of a permission-flag bitmask — simpler now, and still the right shape if per-role customization arrives later (that would loosen the ordering into flags at that point, not before).

```
Tester(1) ──⊂── Contributor(2) ──⊂── ProjectAdmin(3)
  read cases/       + create/update      + delete
  folders/suites,      cases/folders/      cases/folders/
  create/modify         suites               suites,
  runs, record                             + project
  results                                    settings
```

Tenant Admin is not part of this ordinal scale — it's a separate instance-wide flag checked first and short-circuits every project-role check (a Tenant Admin always passes, regardless of membership).

### D3: Effective permissions = union of every applicable role's flags (revised by D10, flag list widened by D11)

```
EffectivePermissions(userID, projectID):
  if user.IsTenantAdmin: bypass (implicit access to everything)
  roleIDs = []
  if row in project_members(project_id=projectID, user_id=userID): roleIDs.append(row.role_id)
  for team in teams containing userID:
    if row in project_team_roles(project_id=projectID, team_id=team.id): roleIDs.append(row.role_id)
  if roleIDs is empty: no access (403)
  roles = roles table rows for roleIDs
  return { flag: OR(r.can_<flag> for r in roles) for flag in the ten permission flags (D11) }
```

A user with no direct or team-derived row on a project has no access at all — not even read. This is deliberately simple: no "viewer of everything" fallback role. Originally this returned "the higher-ranked of the candidate roles" (see D10 for why that stopped being coherent once roles are fully custom and non-nested) — it now ORs each permission flag independently across every applicable role instead, so a user with two roles gets the sum of what either one grants, never less than what a single one of them would have given alone.

**Alternative considered**: direct assignment always overrides team assignment (explicit beats implicit). Rejected as unnecessary complexity — no requirement calls for a user to be *deliberately restricted* below what their team grants them; union covers every case the user described.

### D4: Agent actors inherit the creator's effective role, resolved fresh per request

`domain.Actor` drops its flat `Role` field. It gains `EffectiveUserID string` (the user whose membership applies — the actor's own ID for a human, the token's `CreatedBy` for an agent) and `IsTenantAdmin bool` (also inherited from the creator for an agent). `AuthenticateToken` looks up the creator once (as it already does, to check `DeactivatedAt`... actually it doesn't check that today — see Risks) and sets both fields from the creator's current state, not the state at token-creation time. This matches D1/D3.1's existing intent literally: "acting at its creator's role" was always meant to track the creator live, not snapshot it.

Project-role middleware then calls `EffectiveProjectRole(actor.EffectiveUserID, projectID)` regardless of whether the actor is a user or an agent — one code path, no kind-specific branching in the authorization logic itself.

### D5: Project-role middleware resolves `projectID` per route group via a resolver function

Most routes carry `projectID` directly (`/projects/{projectID}/...`); others carry `caseID`/`suiteID`/`runID`/`folderID`/`itemID` and need one extra store lookup to find the owning project. New store methods: `Cases.ProjectID(caseID)`, `Suites.ProjectID(suiteID)`, `Runs.ProjectID(runID)`, `Folders.ProjectID(folderID)`, `RunItems.ProjectID(itemID)` — each a single-column lookup, no joins beyond the existing FK chain.

```go
func requireProjectRole(min domain.ProjectRole, resolve func(*http.Request) (projectID string, err error)) func(http.Handler) http.Handler
```

mounted per route group, e.g.:
```go
r.With(requireProjectRole(domain.RoleContributor, projectIDFromCase)).Put("/", h.editCase)
r.With(requireProjectRole(domain.RoleProjectAdmin, projectIDFromCase)).Delete("/", h.deleteCase)
```

**Alternative considered**: a single global middleware that inspects the route pattern and dispatches internally. Rejected — chi's per-route `.With()` composition is already the codebase's established pattern (`requireRole(domain.RoleAdmin)` today); a resolver-per-route-group keeps each route's requirement visible at the route declaration instead of buried in a dispatch table.

### D6: Enforcement matrix

Revised by D10, flag names updated by D11: columns are permission flags, not fixed role names — the "Tester/Contributor/Project Admin" columns below show what the *seeded default* roles happen to grant, not what a route hardcodes. A route only ever checks one flag.

| Route group | Required permission | Tester (seeded) | Contributor (seeded) | Project Admin (seeded) | Tenant Admin |
|---|---|---|---|---|---|
| `GET /projects`, `GET /projects/{id}` (member projects only) | `read` | ✓ | ✓ | ✓ | ✓ (all projects) |
| `POST /projects` | Tenant-Admin-only | — | — | — | ✓ |
| `PATCH /projects/{id}` (rename/description/archive) | `manageProject` | — | — | ✓ | ✓ |
| Project membership assign/remove; Roles CRUD (new) | Tenant-Admin-only | — | — | — | ✓ |
| `POST/DELETE .../favorite` | `read` | ✓ | ✓ | ✓ | ✓ |
| `GET` cases/folders/suites/runs (list/read) | `read` | ✓ | ✓ | ✓ | ✓ |
| `POST /cases` | `caseCreate` | — | ✓ | ✓ | ✓ |
| `PUT /cases/{id}`, `PUT /cases/{id}/folder` (edit, move) | `caseEdit` | — | ✓ | ✓ | ✓ |
| `DELETE /cases/{id}` | `caseDelete` | — | — | ✓ | ✓ |
| `POST /folders` | `sectionCreate` | — | ✓ | ✓ | ✓ |
| `DELETE /folders/{id}` | `sectionDelete` | — | — | ✓ | ✓ |
| `POST /suites` | `suiteCreate` | — | ✓ | ✓ | ✓ |
| `PUT/DELETE /suites/{id}/cases/{caseId}` (membership) | `suiteEditMembership` | — | ✓ | ✓ | ✓ |
| `POST /runs`, `POST .../items` | `runCreate` | ✓ | ✓ | ✓ | ✓ |
| `POST .../results`, `PUT .../status` | `runRecordResult` | ✓ | ✓ | ✓ | ✓ |
| Teams CRUD, team membership (existing) | Tenant-Admin-only | — | — | — | ✓ |
| Users CRUD (existing) | Tenant-Admin-only | — | — | — | ✓ |

`GET /projects` for a non-Tenant-Admin filters to projects where `EffectivePermissions` resolves at least one grant (i.e. `project_members`/`project_team_roles` joins to `roles`), replacing today's unfiltered list.

### D7: Schema

```sql
ALTER TABLE users RENAME COLUMN role TO is_tenant_admin_legacy; -- transitional, see migration plan
-- amended in place: users.is_tenant_admin boolean NOT NULL DEFAULT false

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- Fully custom, instance-wide roles (D10) — replaces the fixed project_role
-- ENUM. rank is a Tenant-Admin-set display/sort key only, never compared in
-- authorization logic (see D3/D10) — access is decided purely by the ten
-- can_* flags (D11), OR'd across every role a user holds on a project.
CREATE TABLE roles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL UNIQUE CHECK (name <> ''),
  rank                        integer NOT NULL DEFAULT 0,
  can_read                    boolean NOT NULL DEFAULT true,
  can_case_create             boolean NOT NULL DEFAULT false,
  can_case_edit               boolean NOT NULL DEFAULT false,
  can_case_delete             boolean NOT NULL DEFAULT false,
  can_section_create          boolean NOT NULL DEFAULT false,
  can_section_delete          boolean NOT NULL DEFAULT false,
  can_suite_create            boolean NOT NULL DEFAULT false,
  can_suite_edit_membership   boolean NOT NULL DEFAULT false,
  can_run_create              boolean NOT NULL DEFAULT false,
  can_run_record_result       boolean NOT NULL DEFAULT false,
  can_manage_project          boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Seeded defaults reproduce the original three roles' net permissions
-- exactly (D10/D11) — an instance that never opens the Roles page sees
-- identical behavior to before the flags were split more finely.
INSERT INTO roles (
  name, rank, can_read, can_case_create, can_case_edit, can_case_delete,
  can_section_create, can_section_delete, can_suite_create,
  can_suite_edit_membership, can_run_create, can_run_record_result, can_manage_project
) VALUES
  ('Tester',         1, true, false, false, false, false, false, false, false, true,  true,  false),
  ('Contributor',    2, true, true,  true,  false, true,  false, true,  true,  true,  true,  false),
  ('Project Admin',  3, true, true,  true,  true,  true,  true,  true,  true,  true,  true,  true);

CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_team_roles (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, team_id)
);
```

This amends `00003_identity.sql` in place (pre-1.0 policy — no real deployment has data to preserve). The compose/demo stack requires `docker compose down -v` to pick up the amended migration, same as every prior in-place schema change this session.

### D8: Bootstrap and seed data

`BootstrapAdmin` creates the first user with `is_tenant_admin = true` instead of `RoleAdmin`. Since Tenant Admin has implicit access to every project, the bootstrap admin needs no `project_members` rows to keep working. `make seed-demo`, however, seeds additional non-admin users and projects for realistic testing — those seeded users need explicit `project_members` rows on the seeded projects (as Contributor or Project Admin, matching whatever the seed script is demonstrating), or the demo becomes "everything exists, nobody but the bootstrap admin can see any of it."

### D9: Remove `projects.owner_id` entirely rather than keep it alongside membership

`enrich-project-list` added an optional `owner_id` (a single nominal "who's responsible" reference) with no access implications — it never gated anything. Once real project membership exists, keeping both concepts side by side invites confusion about which one actually controls access (it's always membership). Decided during implementation (user: "we don't need an owner for creating a project... we just need the admin to be able to assign people, teams and roles to the project") to drop `owner_id` entirely — schema column, domain field, API surface, UI create-form field and card display — rather than just hide it from the creation form and leave the rest in place.

**Alternative considered**: keep `owner_id` as pure display metadata (who to informally contact about a project), separate from access control. Rejected per explicit user direction — simpler to have one mechanism (membership) than two overlapping ones, and nothing in the product today reads `owner_id` for anything other than the now-removed card display.

### D10: Fully custom, instance-wide roles — permission-flag union replaces the ordinal scale

Decided during implementation (user, after seeing the shipped fixed 3-role version: "Where the admin can create/customise roles?" → chose "fully custom roles" over "fixed names, editable capabilities", and "instance-wide" over "per-project"). This is a bigger change than "let the admin flip some checkboxes" — it invalidates D2's core assumption.

**Why D2's ordinal scale can't survive fully-custom roles.** D2 worked because the three roles were fixed, known-at-compile-time identities: every route's minimum requirement (`RoleTester`, `RoleContributor`, `RoleProjectAdmin`) was a Go constant, and "sufficient privilege" meant "rank ≥ this specific named role's rank." Once the Tenant Admin can rename, delete, or add roles freely, there is no fixed reference role left for a route to compare against — "Contributor" might not exist tomorrow. Enforcement has to ask a different question: not *"does this role outrank Contributor,"* but *"does this role carry the specific permission this route needs."* That requires permissions to be independent, named, checkable flags — not rungs on a ladder.

**The permission catalog** (five flags per role, replacing the old three-tier ordinal ladder; superseded by D11's ten more concrete, per-resource flags — the mechanism described below, "union across every applicable role," is unchanged, only the flag list is):
- `read` — view cases/folders/suites/runs/results; list project membership; star/unstar the project
- `execute` — create/modify runs, add run items, update item status, record results
- `author` — create/update cases, folders, suites (including moving cases and suite membership)
- `delete` — delete cases and folders
- `manageProject` — rename/describe/archive the project itself

This exact split reproduces the old three roles as the seeded defaults (Tester: `read+execute`; Contributor: `+author`; Project Admin: `+delete+manageProject`) — nothing observable changes for an instance that never touches the new Roles page. Assigning project membership (who gets which role) stays Tenant-Admin-only, unchanged from before.

**Effective permission = union, not "pick the highest-ranked role."** A user's grants (direct + every team they're in) can now be genuinely non-nested custom roles — Role A might grant `delete` without `author`, Role B the reverse. Picking "the highest-ranked single role" and discarding the rest would make adding a second, differently-shaped role able to *reduce* what a user can do, which is backwards from every other permission system's expectations. So `EffectivePermissions` ORs every flag across every applicable role instead: `hasPermission = role₁.flag OR role₂.flag OR ...` for each of the five flags independently.

**`rank` becomes a display-only sort key, not a security primitive.** Roles still carry a Tenant-Admin-set `rank` integer (shown in the Roles admin page, used to order the dropdown when assigning a role to a project) — but no code path compares ranks to decide access anymore, since "union of flags" doesn't need a total order to resolve conflicts (there's nothing to resolve; every applicable flag just applies).

**Schema**: `project_role` ENUM is dropped; a new `roles` table (`id`, `name` UNIQUE, `rank`, five `can_*` booleans, `created_at`) replaces it, seeded with the three defaults above directly in the amended migration (pre-1.0 policy — schema and seed data land together). `project_members.role`/`project_team_roles.role` (enum column) become `role_id uuid REFERENCES roles(id) ON DELETE CASCADE` — deleting a role removes every grant that referenced it, the same "deletion cascades away derived access" behavior teams already have (D7).

**API/domain**: `domain.ProjectRole`/`RoleTester`/`RoleContributor`/`RoleProjectAdmin`/`AtLeast` are removed outright (not deprecated — nothing outside this change depended on them, since nothing shipped yet). `domain.Role` becomes a real record (id/name/rank/five booleans); `domain.Permission` is the five-value enum routes check against. `requireProjectRole(min, resolver)` middleware becomes `requirePermission(perm, resolver)` — same Tenant-Admin-bypass structure, same resolver-per-route-group pattern (D5 is otherwise unchanged), just checking a flag instead of a rank. New Tenant-Admin-only endpoints: `GET/POST /roles`, `PATCH/DELETE /roles/{roleId}`. `ProjectMember`/`ProjectTeamRole` payloads move from `role` (enum string) to `roleId` (references a `Role`).

**Alternative considered**: keep the three named roles as special/undeletable, and layer "additional custom roles" on top as an escape hatch. Rejected — two parallel systems (special hardcoded roles + generic custom ones) is more code and more surface area than one uniform system where the defaults are just ordinary seeded rows.

### D11: Ten concrete, per-resource permission flags replace D10's five broad ones

User feedback after D10 shipped: "I would like to add more concrete actions, not so general roles." D10's five flags (`read`/`execute`/`author`/`delete`/`manageProject`) each bundled several unrelated actions under one switch — `author` alone gated create-case, edit-case, move-case, create-section, create-suite, and suite-membership changes as a single yes/no, so a role that could create cases could not be denied the ability to also, say, edit suite membership. Asked to choose a granularity (per-resource CRUD vs. per-route/maximal vs. a light create/edit split), the user picked **per-resource CRUD**: one pair (or more) of flags per resource type, matching how people actually describe a role ("can touch cases, can't touch suites") rather than either collapsing everything into a handful of cross-cutting verbs or exploding into one flag per HTTP route.

**The new catalog** (ten flags, replacing D10's five):
- `read` — unchanged: view cases/folders/suites/runs/results; list project membership; star/unstar the project
- `caseCreate` — `POST /cases`
- `caseEdit` — `PUT /cases/{id}` (edit content) and `PUT /cases/{id}/folder` (move) — moving a case is edit-shaped (changes the case's own record), not suite-shaped
- `caseDelete` — `DELETE /cases/{id}`
- `sectionCreate` — `POST /folders`
- `sectionDelete` — `DELETE /folders/{id}`
- `suiteCreate` — `POST /suites`
- `suiteEditMembership` — `PUT/DELETE /suites/{suiteId}/cases/{caseId}` (add/remove a case from a suite)
- `runCreate` — `POST /projects/{id}/runs` and `POST /runs/{id}/items` (adding items extends a run's composition, same authoring shape as creating it)
- `runRecordResult` — `POST /items/{id}/results` and `PUT /items/{id}/status` (recording a verdict and marking retest are both execution-time actions on an existing run)
- `manageProject` — unchanged: rename/describe/archive the project itself

**No `suiteDelete`.** There is no suite-deletion capability anywhere in the stack today — no store method, no service method, no handler, no OpenAPI path (suites can only be created and have their case membership changed). Adding a tenth-and-a-half flag for a capability that doesn't exist would be a flag that can never do anything, so it's omitted; building real suite deletion is a separate, not-yet-requested feature.

**Seeded defaults, remapped to preserve identical default behavior**: Tester = `read + runCreate + runRecordResult` (everything the old `execute` covered); Contributor = Tester's flags `+ caseCreate + caseEdit + sectionCreate + suiteCreate + suiteEditMembership` (everything the old `author` covered, split out); Project Admin = Contributor's flags `+ caseDelete + sectionDelete + manageProject` (everything the old `delete` + `manageProject` covered). Same net permissions as before the split — nothing observable changes for an instance that never edits the seeded roles, same guarantee D10 made.

**Everything else from D10 is unchanged**: still a union across every applicable role (not a ranked pick), still instance-wide and fully custom, still enforced via `requirePermission(perm, resolver)` checking one flag per route, still `rank` as a display-only sort key. This is purely a widening of the permission catalog's vocabulary, not another architectural pivot.

### D12: "Reset to defaults" touches only the three named default roles, in place

User request: a button to "restore the original profiles and the default permissions," warning that it deletes the current roles configuration. Two readings were possible — wipe every role in the instance and start over, or only restore Tester/Contributor/Project Admin to their factory settings and leave everything else alone. Asked directly (the blast radius differs enormously), the user chose the **selective** reading.

**What it does**: for each of the three default role names, if a role with that exact name currently exists, its permission flags and rank are overwritten back to the D11 factory values **in place** — same `id`, so every `project_members`/`project_team_roles` row referencing it stays valid and every assignment using it is unaffected. If one of the three doesn't currently exist (deleted or renamed away), it's recreated fresh with a new id. Any other role — a Tenant-Admin-created custom one, or a default one the admin renamed — is left completely untouched, along with every project/team assignment anywhere in the instance.

**What "deleting current roles configuration" in the warning actually refers to**: not deleting role rows, but discarding whatever customization a Tenant Admin has made to Tester/Contributor/Project Admin's own permission flags (if they edited "Contributor" to also grant `manageProject`, that edit is gone after a reset) — the confirmation copy needs to be precise about this scope, not imply a full wipe.

**API**: `POST /api/v1/roles/reset` (Tenant-Admin-only, alongside the other `/roles` routes), no request body, returns the three resulting roles (same shape as `GET /roles`). Implemented in the service layer via `Roles.List` (to find existing default-named roles by name) then `Roles.Update` (in place, if found) or `Roles.Create` (if missing) per default — no new store methods, no cascading deletes, no effect on any role or assignment outside the three names.

**UI**: a destructive-styled "Reset to defaults" control on the Roles page, gated behind a confirmation dialog (this codebase had no prior "are you sure" pattern for any destructive action — built here for the first time, reusable if a future destructive action needs it) whose copy states precisely what's affected: only Tester/Contributor/Project Admin's own permissions, not other roles or any project's assignments.

## Risks / Trade-offs

- **[Breaking change, no migration path]** Every existing session/token's authorization behavior changes the moment this ships — a `member` today has full access; the same user tomorrow has none until explicitly added to a project. → Mitigation: acceptable per the project's own pre-1.0 policy (no real deployment has data to preserve yet); the seed/bootstrap task (D8) ensures the dogfood/demo environment isn't broken by the change.
- **[Deactivated creator's tokens]** `AuthenticateToken` today does not check the token creator's `DeactivatedAt` (only `AuthenticateSession` does) — an existing gap, not introduced by this change, but D4's "resolve fresh per request" makes it slightly more visible since agent permission now actively depends on live creator state. → Mitigation: out of scope to fix here (pre-existing gap), but flagged as a good follow-up; not blocking since it doesn't make anything *less* secure than today.
- **[N+1-shaped resolver lookups]** `projectIDFromCase`/`...Suite`/`...Run`/`...Folder`/`...Item` each add one extra query before the handler runs. → Mitigation: single indexed PK lookup each, negligible at this scale; no different in kind from the existing `authenticate` middleware's per-request session lookup.
- **[Team assignment surprises]** A user could gain unexpected project access purely by being added to a team, with no visibility into *why* they can see a project. → Mitigation: out of scope for this change's UI (no "access explanation" view); the project Members tab lists both direct and team-derived members so a Project Admin can audit it manually.

## Migration Plan

1. Amend `00003_identity.sql`: add `is_tenant_admin`, drop `role`; add `teams`, `team_members`, `project_role` enum, `project_members`, `project_team_roles`.
2. `BootstrapAdmin` sets `is_tenant_admin = true` on the first user.
3. `make seed-demo` updated to grant seeded users `project_members` rows on seeded projects.
4. Local/compose/E2E stacks require `docker compose down -v` (documented already as the standing pre-1.0 procedure for in-place migration changes).
5. No production rollback plan needed — pre-1.0, no real deployment.

## Open Questions

None outstanding — the two decisions that needed the user's input (teams in scope now; Tenant Admin replaces instance RoleAdmin) were resolved before writing this design. Everything else follows from those two plus the codebase's existing D1/D3.1 agent-inheritance precedent.
