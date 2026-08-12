## Context

Two live Pepe (senior UX/UI design persona, Fable 5) reviews of the Administration
section (People/Roles/Tokens/Instance Settings), 2026-08-12:

1. A first, tactical pass — triggered while validating `add-user-deletion`'s new
   Delete-user action — found and fixed a real row text-overlap bug, and flagged
   discoverability and consistency issues across all four pages.
2. A second, holistic pass — explicitly requested after the first felt too tactical —
   proposed a structural fix: a persistent tab shell replacing the current
   dropdown-only navigation. Published mock:
   `https://claude.ai/code/artifact/97df8543-6f39-4c01-bf72-36458a691c4c`.

This design combines both: the IA restructuring from pass 2, plus the per-page content
fixes from pass 1 (which pass 2's mock didn't re-litigate, just didn't re-draw).

## Goals / Non-Goals

**Goals:**
- One persistent tab shell (People / Roles / Instance) so a Tenant Admin stays oriented
  while moving between admin pages, replacing today's dropdown-only navigation.
- Fix the real bugs and inconsistencies pass 1 found: row overlap (already fixed and
  verified live), Deactivate discoverability, missing Tokens-revoke confirmation,
  undifferentiated revoked tokens, name/email treatment, and the small polish items.
- Give Roles' delete-confirmation dialog the same real-reference-count treatment
  `add-user-deletion` already established for deleting a user.
- Give Instance Settings room to grow (v0.2's SSO-enforcement toggle) without another
  ad hoc bare-Card stack.

**Non-Goals:**
- `TokensPage` does **not** join the tab shell. Verified, not assumed: it only ever
  shows the caller's own tokens (`GET /api/v1/tokens`, no `userId` = own tokens); there
  is no admin-facing "every token on the instance" view to justify folding it into
  Administration's shell. It stays reachable from `ProfilePage.tsx`'s Account card,
  exactly where it is today.
- No new instance-wide "all tokens" admin capability — that's a real gap Pepe flagged,
  but it's a new feature (new endpoint, new UI), not part of this redesign.
- No change to the actual RBAC/permission model, `roles` table schema, or any
  authorization semantics — this is navigation/presentation only, plus one new
  read-only preview endpoint.
- No left sidebar. This app has no vertical-rail precedent anywhere (project pages
  navigate via landing-page cards + a header switcher, not a persistent side nav) — a
  horizontal tab strip matches the app's existing wayfinding idiom and is proportional
  to 3 destinations (soon 4, with SSO's own settings surface).

## Decisions

### D1: A shared `AdminShell` component owns the tab strip; People/Roles/Instance render inside it

New `apps/web/src/components/AdminShell.tsx`: renders the tab strip (People/Roles/
Instance, each a `NavLink` to `/settings/people`, `/settings/roles`, `/settings/instance`)
plus `children`. `PeoplePage.tsx`, `RolesPage.tsx`, `InstanceSettingsPage.tsx` each wrap
their existing content in `<AdminShell>...</AdminShell>` and drop their own
`<Breadcrumbs>` call (now redundant — the active tab already states where you are, the
same over-restatement `docs/design-system.md`'s entity-detail-header finding already
covers for a different duplicate-affordance case).

Tab strip markup (from the mock, translated to this app's actual components/tokens):
```tsx
<nav aria-label="Administration" className="inline-flex gap-0.5 rounded-2xl bg-muted p-1">
  <NavLink to="/settings/people" className={({isActive}) => tabClass(isActive)}>
    <UsersIcon className="size-4" aria-hidden="true" /> People
  </NavLink>
  <NavLink to="/settings/roles" className={({isActive}) => tabClass(isActive)}>
    <ShieldCheckIcon className="size-4" aria-hidden="true" /> Roles
  </NavLink>
  <NavLink to="/settings/instance" className={({isActive}) => tabClass(isActive)}>
    <SettingsIcon className="size-4" aria-hidden="true" /> Instance
  </NavLink>
</nav>
```
where `tabClass(isActive)` is `"flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold " + (isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")` — the filled-panel active-state idiom `docs/design-system.md` already settled on over a hairline underline (found functionally invisible on this palette).

### D2: `AdminMenu.tsx`'s dropdown becomes a single direct link

Its only job today is jumping between the 3 admin destinations — a job the tab strip
now owns once inside. Replace the `<button aria-haspopup="menu">` + open-state/
outside-click/`Escape` machinery with `<Link to="/settings/people">` at the same
position in `Layout.tsx`, same `ShieldIcon` + "Admin" label, same hover treatment, plus
an active/current style (`text-primary font-semibold`) when already inside `/settings/
{people,roles,instance}`. `AdminMenu.test.tsx` gets rewritten for the new, much smaller
surface (a link, not a menu).

### D3: Instance Settings restructures into labeled sections

`InstanceSettingsPage.tsx` currently renders one bare `Card` with the public-access
toggle. Restructure into `<section>` blocks, each with an uppercase `tp-label` +
icon heading ("Access", "Authentication") above its own `Card`. Add a disabled
"Require SSO sign-in" row under "Authentication" with a small `Coming with SSO (v0.2)`
pill (reusing `ProfilePage.tsx`'s existing "Coming soon" idiom: muted icon chip,
`opacity-60` row, pill badge) — this is optional dressing; the section-heading
structure is the real change, justified because `ROADMAP.md`'s v0.2 (`add-sso-oidc`)
already commits to a second instance-wide toggle that needs a home.

### D4: Roles delete-dialog gets real reference counts, mirroring `add-user-deletion`

New endpoint `GET /api/v1/roles/{roleId}/deletion-preview` (Tenant Admin only, same
`requireTenantAdmin` gate as the rest of role management), returning
`{directUserCount, teamCount, projectCount}` — direct user assignments
(`project_members` rows referencing this role), team assignments
(`project_team_roles` rows referencing this role), and the number of distinct projects
either touches. `RolesPage.tsx`'s delete-role dialog changes from the current vague
"may be assigned to users or teams across multiple projects" to a real sentence:
"Deleting '{name}' — currently assigned to N users and M teams, across P projects.
Deleting it removes those assignments too. This cannot be undone." Same
opens-immediately / loads-async-with-a-spinner / confirm-disabled-until-loaded pattern
`PeoplePage.tsx`'s user-deletion dialog already established.

### D5: PeoplePage content fixes (pass 1, carried forward)

- **Discoverability**: Deactivate's icon button (`PeoplePage.tsx`) loses its
  `opacity-0`/`group-hover`/`focus-visible:opacity-100` hiding — always visible, same
  treatment as the less-consequential "Remove member" control nearby
  (`text-muted-foreground hover:bg-destructive/10 hover:text-destructive`), plus a
  `title` attribute mirroring the existing `aria-label`.
- **Name/email**: the Person cell renders `displayName` (bold, `text-sm font-semibold`)
  with `email` demoted to a second line (`text-xs text-muted-foreground`) when they
  differ; falls back to email-only (current behavior) when there's no display name or
  it equals the email. Reuses the `displayName ?? email` fallback idiom already used
  elsewhere in this codebase.
- **Access pill**: "Tenant Admin" renders as a small pill (`bg-primary/10 text-primary
  rounded-full px-2 py-0.5 text-xs font-medium`); "Member" (the default, non-notable
  case) stays plain muted text — color marks the notable state only, per
  `docs/design-system.md`'s color-restraint rule.
- Confirmation dialogs keep naming the account by **email**, not display name — email
  is the unique, unambiguous identifier for an irreversible action; this is a
  deliberate exception to "prefer display name," not an oversight.

### D6: TokensPage fixes (pass 1, carried forward)

- **Revoke confirmation**: `handleRevoke` no longer fires directly from the row button.
  A `Dialog` (same shape as every other destructive dialog in this app) opens first:
  title `Revoke "{name}"?`, description "Any CI/agent using it immediately loses
  access. This cannot be undone.", Cancel / Revoke(`variant="destructive"`) footer.
  New interactive behavior — TDD required (RED test asserting revoke doesn't fire
  until confirmed, matching `PeoplePage.tsx`'s existing deactivate-dialog test shape).
- **Revoked-token display**: a token with `revokedAt` set renders a status dot +
  "Revoked" (muted, `bg-border` dot) in place of the Revoke button — the exact
  Active/Deactivated status-cell idiom `PeoplePage.tsx` already uses. The
  `ListByCreator` query already returns revoked tokens (no store change needed) — this
  is a frontend-only fix to a field (`revokedAt`) that was already in the type but
  never read.

### D7: Small consistency fixes (pass 1, low-priority, bundled here since they're one-line each)

- `RolesPage.tsx`/`InstanceSettingsPage.tsx` get a real `<h1 className="tp-heading text-xl">` (Roles/Instance), matching `PeoplePage.tsx`/`TokensPage.tsx`.
- `RolesPage.tsx`'s "New role" button → "+ New role", matching "+ New user"/"+ New token"/"+ New team" elsewhere.
- `PeoplePage.tsx`'s hand-rolled inline `<svg>` `PowerIcon` replaced with `lucide-react`'s own `PowerIcon` import.
- `TokensPage.tsx`'s `border-amber-500` (Tailwind stock color) on the "copy this token now" warning → `border-secondary` (this app's actual warn semantic token).
- `RolesPage.tsx`'s redundant outer `Card` wrapper around the whole roster dropped, promoting the heading+buttons to a plain `flex items-center justify-between` row, matching People's/Tokens' bare-list shape.

## Risks / Trade-offs

- **[Route-structure churn]** Wrapping three pages in a new shared shell touches every
  existing test for those three pages (anything asserting on `Breadcrumbs` output, or
  on exact DOM structure near the top of the page). Mitigation: update each page's
  test file in the same task as the page change, never leave a red test between tasks.
- **[`AdminMenu` surface shrinks a lot]** Existing `AdminMenu.test.tsx` tests the
  dropdown's open/close/outside-click/`Escape` behavior — all of that goes away.
  Mitigation: this is expected, not a regression to guard against; rewrite the test
  file for the new, much smaller link-only surface rather than trying to preserve
  dropdown-shaped assertions that no longer apply.
- **[New endpoint surface]** `GET /api/v1/roles/{roleId}/deletion-preview` is new,
  read-only, Tenant-Admin-gated — same risk shape as the already-shipped per-user
  equivalent. No migration, no schema change.
