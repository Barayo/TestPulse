## Context

TestPulse's entire API today sits behind one `authenticate` middleware
(`apps/api/internal/server/middleware.go`), mounted as a single `r.Group`
wrapping every domain route. There is no unauthenticated read path
anywhere. `requirePermission` then enforces "no membership → no access,
including read" (`openspec/specs/authorization/spec.md`, "Tenant Admin and
project-scoped roles") via `EffectivePermissions`, which unions role flags
across `project_members` and `project_team_roles` — a user with neither
gets zero flags and a `403` that looks identical to "project doesn't
exist." This is a deliberate, documented v0.1 stance
(`docs/deployment.md`'s "Security status" section: "access to a project is
opt-in").

That stance is not being reversed. The read handlers this change exposes
(`getProject`, `listCases`, `listFolders`, `listSuites`, `getSuite`,
`listRuns`, `getRun`, `listRunItems`, `listResults`, `getAttachment`,
`flakyCases`, `suiteTrend`, `runSummary`) were verified by inspection to
never call `domain.ActorFromContext` — audit logging only fires on writes,
and none of these construct or need an `Actor`. That absence is what makes
a parallel, additive, unauthenticated path viable without touching the
authenticated one at all.

## Goals / Non-Goals

**Goals:**
- Let a Project Admin make a specific project's read surface reachable by
  anyone with its URL, no account required.
- Let a Tenant Admin disable the entire capability instance-wide, for a
  future multi-tenant hosting mode.
- Make the Sample Project itself demonstrate this, closing the
  `getting-started.md` onboarding gap where a fresh install's own
  quickstart implies pre-login browsing that doesn't actually work.
- Leave the authenticated RBAC model — `authenticate`, `requirePermission`,
  `EffectivePermissions`, every existing route — byte-for-byte unchanged.

**Non-Goals:**
- Signed, expiring, or revocable share tokens. The public link is a plain,
  stable, project-key URL — the same trust model as a public GitHub repo,
  not a secret. A token-based share-link system (issuance, rotation,
  revocation UI) is a materially bigger feature than issue #61 asked for;
  revisit only if a real need for expiring/revocable links shows up.
- Narrower-than-project scoping (a single public run or suite without
  making the whole project public). Public access is a whole-project flag.
- Any anonymous write path, including low-risk-seeming ones like comments
  or reactions. Every write handler requires a real `Actor` for
  attribution/audit; there is no cheap path to change that, so this is
  fully closed, not deferred.
- Any change to `domain.ActorKind`, `ResultActorKind`, or audit logging.
  Anonymous reads produce no audit entries (reads aren't audited today
  either) and never construct an `Actor` value.
- Any change to the `authorization` capability's existing requirements, or
  to `authenticate`/`requirePermission`. Purely additive.

## Decisions

### A parallel, additively-mounted route group — not a bypass inside `authenticate`

**Decision:** mount a new, separate route group in `server.go` for
`GET /api/v1/public/{projectKey}/...`, outside the existing
`authenticate`-gated group, reusing the same handler functions
authenticated routes already use.

**Alternative considered and rejected:** make `authenticate` optional
("attach actor if present, else continue") and teach `requirePermission`
to allow `PermRead` through for public projects. This would reuse the same
authenticated URLs, but every one of the ~40 routes behind that single
`r.Group` — including identity, teams, roles, and token management, none
of which should ever be reachable anonymously — would now have to
individually reason about a missing actor. That is a large, hard-to-review
blast radius for an additive feature, and it would directly weaken the one
sentence `docs/deployment.md` uses to describe the app's entire security
posture. A separate group with its own middleware (`requirePublicProject`)
keeps every existing route untouched and makes the new surface a
one-file, hand-picked whitelist.

**Scope of exposed reads:** project metadata, folders/library tree, cases
(content, versions, executions), suites, runs (list/detail/items/summary),
results, attachments, flaky-cases, suite trend. Explicitly excluded:
`getProjectMembership` (leaks member emails/display names to the open
internet), `myPermissions` (meaningless without an actor), and every write,
admin, teams/roles/tokens/identity route.

**Frontend:** a new `/public/:projectKey` route tree in `App.tsx`, outside
`RequireAuth`, reusing the existing authenticated project page components
with permissions hard-coded to all-false. Write controls already
self-hide off `MyPermissions` per the authorization spec's "hide
permission-gated controls entirely" rule (see "A user can query their own
effective permissions" scenario), so no bespoke read-only view components
are needed — only a new anonymous-viewer banner/header and the route guard
are new.

### Public link is a plain project-key URL, not a share token

**Decision:** `/public/{projectKey}`, stable and non-expiring, same shape
as the authenticated project URL. Choosing to publish is a conscious
Project Admin action (the toggle), not something that needs a
high-entropy secret to be safe — project keys are short human-readable
slugs, not intended as capability secrets.

**Alternative considered and rejected:** a signed/expiring share token per
project or per link. Bigger surface (issuance, storage, rotation,
revocation UI), not needed for the "share with people who don't have
accounts" use case this change targets. Deferred as explicit future work.

### `requirePublicProject`: two flags, checked in order, same 404 either way

**Decision:** the middleware checks, in this order: (1) the instance-wide
`instance_settings.public_projects_enabled` — `404` immediately if off,
without even querying the project; (2) the project's own
`projects.public_access` — `404` if false or the project doesn't exist.
Both checks return an identical `404`, so "public access disabled
instance-wide," "this project isn't public," and "this project doesn't
exist" are indistinguishable from the outside — consistent with how
authenticated RBAC already avoids leaking existence
("User with no role on a project cannot see it" treats absence and
no-access identically).

No caching layer: both are single-row/single-key lookups, and nothing else
in the service layer caches permission state either
(`EffectivePermissions` re-queries every request).

### Instance-wide kill switch: a new singleton settings table

**Decision:** a genuinely new concept — there is currently no
instance-wide settings mechanism anywhere in TestPulse (`IsTenantAdmin` is
per-`User`; `roles`/`teams` are per-project-scoped resources; `GET
/api/v1/meta` is the only unauthenticated, instance-wide response today,
and it's a static `{name, version}`).

```sql
CREATE TABLE instance_settings (
    id                       BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    public_projects_enabled  BOOLEAN NOT NULL DEFAULT true,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO instance_settings (id) VALUES (true);
```

`id BOOLEAN PRIMARY KEY CHECK (id)` is the standard singleton-row pattern:
the CHECK forbids a second row, so there's no ambiguity about which row is
"the" settings row and no application-level enforcement needed. Typed
columns (matching the repo's existing style, e.g. `projects.is_sample`)
rather than a generic key/value table — there is exactly one setting today,
and a second one later is an `ALTER TABLE` in its own new migration file,
not a pattern change.

**Alternative considered and rejected:** a generic key/value or JSONB
settings table. Would need value-type erasure for a single boolean today,
solving a problem (schema flexibility for arbitrary future settings) this
change doesn't have yet.

**Default: on.** This is a capability gate, not exposure by itself — a
project is only actually reachable when *both* flags are true. Defaulting
on preserves the Sample Project fix working immediately after `docker
compose up`, with no extra admin step. Operators wanting the stricter
multi-tenant stance (no project can ever be public without an explicit
instance-level opt-in too) flip it off deliberately — that is the
kill-switch use case this decision anticipates, and it should be a
deliberate action, not an accident of a restrictive default nobody
notices.

**Flip-to-off is non-destructive:** disabling the instance-wide switch
does not modify any project's own `public_access` column. Projects simply
become unreachable at `/public/*` while the switch is off, and resume
their exact prior state the moment it's switched back on. Rationale:
reversibility (a Tenant Admin toggling this off temporarily shouldn't have
to remember and manually restore which projects were public); no
efficiency argument for a bulk `UPDATE` (the two-flag check is already
free per-request); avoids inventing extra state to track "which projects
were public before a mass-disable." This matches the existing precedent of
`ResetRolesToDefaults` (`project_rbac.go`) being non-destructive and
in-place rather than wipe-and-recreate.

### API surface follows existing idioms

- `GET /api/v1/meta` (existing, unauthenticated) gains
  `publicProjectsEnabled: bool` — the one read path every consumer needs
  (the anonymous frontend, and the authenticated Project Settings page
  deciding whether to gray out the per-project toggle). Reveals nothing
  sensitive.
- `PATCH /api/v1/instance-settings`, Tenant-Admin-only
  (`requireTenantAdmin`, same gate as `mountRoles`/`mountTeams`), body
  `{"publicProjectsEnabled": bool}`. No separate GET route — the single
  field today is covered by `/meta`; a dedicated admin-only GET can be
  added later without conflict if a second, non-public setting appears.

### New UI surface for the instance-wide toggle

No existing admin page fits — `PeoplePage`/`RolesPage` are about
users/roles specifically. A third `AdminMenu` entry, "Instance," routes to
a new `/settings/instance` page, self-gated with the same client-side
idiom already used by `RolesPage.tsx`/`PeoplePage.tsx`
(`if (!me?.isTenantAdmin) { ... }`, not just route-level `RequireAuth`).

The per-project "Public access" toggle in Project Settings stays *visible*
to non-Tenant-Admins even when the instance switch is off — shown grayed
out with an inline explanation, rather than hidden, so a Project Admin
who clicks it understands why nothing happened instead of wondering if
it's broken.

## Risks / Trade-offs

- **[Risk]** A Project Admin publishes a project containing sensitive test
  data (credentials in case steps, internal URLs) without realizing the
  scope of what's exposed. → **Mitigation:** the Project Settings toggle's
  copy states plainly what becomes visible ("cases, runs, and results";
  nothing about who can see membership); this mirrors the disclosure a
  public GitHub repo already requires the same judgment call for.
- **[Risk]** The 404-for-everything response makes debugging "why can't I
  reach this public project" harder for a legitimate Project/Tenant Admin.
  → **Mitigation:** the authenticated Project Settings page always shows
  the true state (own toggle + instance flag) to someone who can already
  see it; the ambiguous 404 is only for the anonymous, outside view, where
  the ambiguity is the point.
- **[Risk]** Reusing authenticated page components for the anonymous view
  with permissions forced to all-false could regress if a future page adds
  a control that doesn't check `MyPermissions` correctly. → **Mitigation:**
  this is an existing, already-tested pattern (the authorization spec's
  "hide permission-gated controls entirely" scenario), not new surface
  introduced by this change; the new tests this change adds (task list)
  cover the anonymous route guard and banner, not every page's permission
  handling from scratch.

## Migration Plan

New, additive migration `apps/api/internal/db/migrations/0001N_instance_settings.sql`
(next sequential number after the current latest at implementation time,
per the migration policy of never editing an existing file) creating
`instance_settings` and adding `projects.public_access boolean not null
default false`. Both are additive columns/tables with safe defaults — no
backfill, no locking concern, no rollback complexity beyond a standard
goose `down` migration.
