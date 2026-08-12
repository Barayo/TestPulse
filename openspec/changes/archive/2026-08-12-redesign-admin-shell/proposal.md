## Why

As a Tenant Admin, when I move between People, Roles, and Instance Settings, I want to
stay oriented inside "Administration" as one place — because today those are three
independent pages reachable only via a dropdown menu (`AdminMenu.tsx`), with no way to
move between them once inside one, even though `Layout.tsx` already renders a static
"› Administration" breadcrumb segment implying a section that doesn't structurally
exist. A live product review (Pepe, senior UX/UI design review, 2026-08-12) of the
whole admin surface — prompted while validating `add-user-deletion`'s new Delete
action, which itself surfaced a real layout bug (overlapping row text) and a
discoverability gap (Deactivate hidden behind hover with no visible affordance) — found
this IA gap plus several smaller inconsistencies across People/Roles/Tokens/Instance
that don't match this app's own documented design system.

## What Changes

- New persistent tab strip (People / Roles / Instance) replacing the current
  dropdown-only navigation between admin pages; `AdminMenu.tsx`'s dropdown becomes a
  single direct link into the section.
- `Breadcrumbs` dropped from People/Roles/Instance (now redundant once the active tab
  already states where you are).
- Instance Settings restructured from one bare `Card` into labeled sections, with a
  disabled "Authentication — coming with SSO (v0.2)" placeholder row — the shape v0.2's
  SSO-enforcement toggle will need, built now rather than retrofitted.
- Roles' delete-role confirmation gets real reference counts (users/teams/projects
  affected), matching the pattern `add-user-deletion` already established for deleting
  a user — needs a new `GET /api/v1/roles/{roleId}/deletion-preview` endpoint.
- PeoplePage fixes: the confirmed row text-overlap bug (already fixed and verified
  live), Deactivate made always-visible (was hover-only, less discoverable than the
  less-consequential "Remove member" control beside it), user rows show display
  name + demoted email instead of a single bold email line, "Tenant Admin" rendered as
  a pill instead of plain text, roster header's "Role" column relabeled "Access" (real
  pre-existing bug: conflated the instance-wide admin flag with this app's actual
  project-scoped Role concept).
- TokensPage fixes: Revoke gets a real confirmation dialog (currently a bare
  click-to-revoke, against this app's own documented destructive-action pattern);
  revoked tokens get a status dot + label instead of an always-clickable Revoke button
  that no longer does anything meaningful.
- Small consistency fixes: missing `<h1>` page headings on Roles/Instance, "New role" →
  "+ New role" (matching "+ New user"/"+ New token" elsewhere), hand-rolled `PowerIcon`
  SVG replaced with `lucide-react`'s own, one hardcoded `amber-500` border replaced with
  the app's actual warn token (`--secondary`), Roles' redundant outer `Card` wrapper
  dropped to match People/Tokens' bare-list shape.
- No backend change beyond the one new deletion-preview endpoint for roles (mirrors
  the existing per-user one).

## Capabilities

### New Capabilities
(none — this reshapes existing UI and adds one supporting endpoint, not a new domain
capability)

### Modified Capabilities
- `authorization`: documents the new `GET /api/v1/roles/{roleId}/deletion-preview`
  endpoint (Tenant Admin only, mirrors the existing per-user deletion-preview pattern).

## Impact

- **Frontend**: `apps/web/src/components/AdminMenu.tsx` (dropdown → link),
  `apps/web/src/components/Layout.tsx` (admin trigger), a new shared admin-shell
  component (tab strip), `PeoplePage.tsx`, `RolesPage.tsx`, `TokensPage.tsx`,
  `InstanceSettingsPage.tsx`.
- **Backend**: one new read endpoint (`GET /api/v1/roles/{roleId}/deletion-preview`),
  `packages/shared/openapi.yaml` updated, `make generate`.
- **Docs**: `docs/design-system.md` (tab-strip pattern, if it becomes a reusable
  idiom), `docs/test-management.md` or wherever admin navigation is documented.
- **No schema change, no migration.**
