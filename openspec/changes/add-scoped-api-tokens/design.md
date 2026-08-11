## Context

`api_tokens` today has no scope at all: `AuthenticateToken` (`apps/api/internal/service/identity.go`) resolves an `Actor` with `EffectiveUserID = creator.ID` and `IsTenantAdmin = creator.IsTenantAdmin`, then every downstream `requirePermission` check re-derives the token's permissions from the creator's *current* project membership/role — exactly as `openspec/specs/authorization/spec.md`'s "Agent actors inherit their creator's permission level" requirement deliberately specifies. That was the right default when tokens were introduced (one actor kind, no scoping story needed yet). It stops being sufficient once a Tenant Admin can mint one: a leaked token is then a leaked Tenant Admin credential, with no way to hand an integration less than everything its creator can do.

Storage and generation are already correct and stay untouched: 256-bit `crypto/rand` secret, SHA-256 hashed before persisting, only a display prefix kept in the clear (`identity.go` `randomSecret`/`hashToken`, `store/tokens.go`).

## Goals / Non-Goals

**Goals:**
- Let a token be created scoped to exactly one project and a named, reusable role (not an ad-hoc per-token flag set), enforced server-side on every request that token makes.
- Keep every existing token's behavior byte-for-byte unchanged (unscoped = today's full-inheritance behavior).
- A scoped token's effective permissions can never exceed what its creator can *currently* do — scoping only ever narrows, never grants something the creator doesn't themselves have.
- Give "read-only" as an out-of-the-box, named option (D2) — not something every Tenant Admin has to construct themselves before they can use it.

**Non-Goals:**
- Multi-project scoping (one project per token, or none — matches how a human's own project access is already granted one project-role-assignment at a time; a second project needs a second token, same as a second role assignment).
- A per-token, ad-hoc flag picker independent of the role system (D1) — a scoped token's permission set is always a named, reusable role, never a bespoke one-off combination.
- Changing anything about how *human* actors (session-based) are authorized — this only touches the agent/token path.
- Retroactively scoping existing tokens — they stay unscoped (full inheritance) unless recreated.

## Decisions

### D1 — Scope is (project, role) reusing the existing `roles` table, not raw per-token flags

**Revised (2026-08-11) after user feedback: reuse named, reusable roles instead of an ad-hoc flag picker per token.** A raw 11-checkbox grid at token-creation time is exactly the wrong UX for the actual goal — it pushes the same misconfiguration risk (check too much because the semantics are unclear, or give up and grant everything) that scoping exists to prevent. This project already solved "let an admin express a reusable, named permission bundle" once, deliberately: `add-project-rbac` design.md D10 replaced fixed role tiers with fully-custom, flag-built, **named and reusable** roles specifically so an admin builds the bundle once and assigns it many times. Token scope should be the same bundle, not a second, parallel permission-modeling concept invented just for tokens.

New columns on `api_tokens`: `project_id uuid REFERENCES projects(id) ON DELETE CASCADE` and `role_id uuid REFERENCES roles(id) ON DELETE CASCADE`, both nullable, `CHECK ((project_id IS NULL) = (role_id IS NULL))` (scoped requires both; unscoped requires neither — no independently-nullable pair to reason about). `ON DELETE CASCADE` on both mirrors `project_members`' existing, already-tested precedent exactly (`TestEffectivePermissionsLostWhenRoleDeleted`, `store/project_rbac_test.go`) — deleting a role a token depends on deletes the token outright (fails closed: the token stops authenticating entirely, never silently upgrades to unscoped/full-access, which a `SET NULL` policy would have caused).

Concretely, this gives "readonly", "full access" etc. for free, as named roles a Tenant Admin picks from a dropdown — no bespoke "token capability preset" vocabulary needs inventing. A narrower ask like "only allow new runs" is a one-time custom-role creation (`POST /api/v1/roles`, already fully built) with just `canRunCreate` (+ `read`) set — the existing custom-role system already exists precisely for asks like this.

**Alternative considered and rejected (original version of this design):** raw `can_*` boolean columns directly on `api_tokens`, picked per-token via a checkbox grid. Rejected on reconsideration — duplicates the role system's job with worse UX (no reuse across tokens, no central place to audit/adjust "what can my CI tokens do", the exact named-tier ergonomics the user asked for don't fall out of it for free) and cuts against this codebase's own established D10 philosophy of one reusable, flag-built, named bundle mechanism, not two.

**Alternative considered and rejected:** invent a small fixed set of hardcoded preset names ("read-only", "read-write", "admin") baked into frontend/backend code, independent of the role system. Rejected — reintroduces exactly the fixed-tier rigidity D10 already moved away from, and duplicates modeling territory with `roles` instead of reusing it.

### D2 — Seed one additional default role: read-only

None of the three existing seeded roles (Tester/Contributor/Project Admin, `00003_identity.sql`) is pure read-only — Tester already includes `runCreate`/`runRecordResult`. Seed a fourth, `Viewer` (rank 0, below Tester's rank 1): `can_read = true`, every other flag `false`. Directly answers "readonly" as an out-of-the-box option (for tokens *and* for human project members — a real, independently useful gap this closes, not just a token-scoping side effect) with no new mechanism, just one more seed row.

### D3 — Effective permissions for a scoped token: intersection of the role's flags and the creator's *current* permissions, computed at request time

`AuthenticateToken` resolves a scoped token's granted flags via a direct `SELECT can_read, ... FROM roles WHERE id = $1` (simpler than `ProjectMembers.EffectivePermissions`'s query — no team-membership union needed, a token has exactly one role, not a set to merge) and ANDs it, flag by flag, against the creator's current `EffectivePermissions(creator, tok.ProjectID)` (the same call `requirePermission` already makes for a human actor on that project). The result — never the role's flags alone — is what the request is authorized for. This extends the existing "reflects the creator's *current* state, not token-creation-time state" invariant (`authorization` spec's already-existing scenario) to the scoped case: if the creator's own role on that project is later downgraded, a token scoped to a broader role narrows too, exactly like an unscoped token already does.

Mechanically: `domain.Actor` gains an optional `ScopedProjectID *string` and `ScopedPermissions *Permissions` (both nil for unscoped/human actors) — populated from this intersection, not the raw role. `requirePermission`'s existing per-route check adds one branch: if the actor is a scoped agent, the permission must be in `Has()` on the intersected set, and the actor is rejected outright (403) for any route resolving to a different project than `ScopedProjectID`.

**Alternative considered and rejected:** store a snapshot of the intersected permissions at token-creation time. Rejected — reintroduces exactly the staleness problem the existing unscoped-inheritance requirement already solved.

### D4 — Token creation: scoping is opt-in, validated against the *creating* user's own current access

`POST /api/v1/tokens` gains optional `projectId` + `roleId` in the request body. Server-side validation: if provided, the creating user must currently have `read` on that project, and every flag the named role grants must already be granted by the creator's own `EffectivePermissions` on that project — a user can never scope a token to a role more powerful than their own current access, mirroring D3's request-time intersection but checked once at creation as a fail-fast UX courtesy (D3's real enforcement happens on every subsequent request regardless, so this check is a courtesy, not the actual security boundary).

### D5 — Frontend: two `<select>`s on `TokensPage.tsx`, scope shown in the list

Creation form gains a collapsed-by-default "Scope to a project (optional)" section: a project `<select>`, then a role `<select>` populated from `GET /api/v1/roles` — the exact same plain-`<select>`-fed-from-the-roles-list pattern `ProjectMembersPage.tsx` already uses for assigning a human's role, not a new component. Leaving it collapsed/empty creates an unscoped token, unchanged from today. The token list gains a column/badge: "Full access" (unscoped) vs. "{project name} · {role name}" (scoped) — every existing token shows "Full access", correctly, with zero data migration needed.

## Risks / Trade-offs

- **[Risk]** A fourth `Actor`-shape branch (human session, unscoped agent, scoped agent, plus the existing Tenant-Admin-bypass short-circuit) adds real branching complexity to `requirePermission`, the single most security-critical function in the codebase. → **Mitigation:** D3's design keeps the scoped case a pure narrowing filter applied *after* the existing resolution path, not a parallel code path — same `EffectivePermissions` call, one additional role lookup, one AND, and one project-match check. Exhaustive tests per branch combination (unscoped agent / scoped agent × in-scope project / scoped agent × out-of-scope project / role grants a flag the creator no longer holds) are non-negotiable, not just "nice to have."
- **[Risk]** Scoping computed at request time means an extra role lookup + `EffectivePermissions` DB call on every scoped-token request (unscoped tokens are unaffected — no new call for them). → **Mitigation:** accepted; the `EffectivePermissions` half of this cost matches what every human-actor request already pays (`requirePermission` already calls it for every non-Tenant-Admin session request); the role lookup is a single indexed row fetch by primary key.
- **[Risk]** A Tenant Admin's own scoped token silently stops being "Tenant-Admin-equivalent" the moment it's scoped, which could surprise someone expecting all their tokens to behave the same. → **Mitigation:** D5's UI makes scope visible and explicit at creation and in the list; no silent narrowing — a Tenant Admin has to actively opt in.
- **[Risk]** Deleting a role a token depends on deletes the token outright (D1's `ON DELETE CASCADE`), which could surprise a Tenant Admin cleaning up unused-looking roles from the Roles admin page if they don't realize a token still references one. → **Mitigation:** the existing Roles admin page already has to reckon with this exact risk for human members (deleting a role already silently revokes anyone assigned it, per already-shipped, already-tested behavior) — extending the same UI affordance (if one exists there, e.g. "N members use this role") to also count scoped tokens is a reasonable follow-up, not a blocker for this change.

## Migration Plan

Single additive migration: `ALTER TABLE api_tokens ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE, ADD COLUMN role_id uuid REFERENCES roles(id) ON DELETE CASCADE, ADD CONSTRAINT api_tokens_scope_check CHECK ((project_id IS NULL) = (role_id IS NULL))`, plus one `INSERT INTO roles (...) VALUES ('Viewer', 0, true, false, ..., false)` (D2). No backfill needed for existing tokens — they get `project_id = NULL, role_id = NULL` (the default), which is exactly "unscoped, full inheritance," their current real behavior. Fully backward compatible; rollback is a plain column-drop + role-delete `Down` migration, no data loss (nothing meaningful to preserve — scope was never set on existing rows, and no token can yet reference the newly-seeded role at rollback time in the same deploy).

## Open Questions

- Exact request-body field names for `POST /api/v1/tokens`'s new `projectId`/`roleId` — left to implementation to match existing naming conventions elsewhere in `packages/shared/openapi.yaml` (e.g. how `PUT /api/v1/projects/{projectKey}/members/{userID}` already shapes a `roleId` payload).
- Whether the Sample Project showcase should include a pre-seeded scoped token, or whether that's awkward given tokens are only ever shown once at creation (likely: seed.go can still create the row directly, just can't "reveal" a full value the same way a real creation flow does — implementer's judgment during that task).
- Whether the Roles admin page should show a token-usage count per role (surfaced as a follow-up in Risks above, not required for this change).
