## Context

`enable-public-project-access` built anonymous read access as a fully
parallel implementation on purpose: a separate backend route tree
(`mountPublicAPI`, `/api/v1/public/*`, reusing the authenticated handler
functions behind a different middleware) and a separate frontend page
(`PublicProjectPage.tsx`), justified in that change's own design.md by a
real, still-valid concern — folding anonymous reads into the single
`authenticate`-gated route group would force ~70-80 routes, including
identity/teams/roles/tokens, to individually reason about a possibly-nil
actor. That argument was about the **backend**. It says nothing about
whether the **frontend** needed a second, hand-maintained page — and that
half of the decision has now cost twice: the public page shipped without
the Library's classification pills (fixed ad hoc), then was found to be a
flatter page entirely, missing the summary-strip dashboard layout the
authenticated `ProjectPage.tsx` has. `enable-public-project-access`'s own
design.md named this exact risk in advance: *"Reusing authenticated page
components for the anonymous view... could regress if a future page adds
a control that doesn't check `MyPermissions` correctly."* — predicting
today's problem while choosing not to solve it, because solving it then
meant retrofitting permission-gating across pages that didn't need it yet
for a single-page feature. It's the same size problem now, just overdue.

A follow-up architecture review (2026-08-08) independently reached the
same backend/frontend split: don't touch `authenticate`/`requirePermission`
(the blast-radius argument holds, if anything more strongly now that the
authenticated route group has grown), but the frontend duplication is a
"drift by construction" problem worth fixing by sharing rendering. This
change is that fix, scoped by the user's explicit direction: the same
page, same look, for every visitor — logged-in or not — with anonymous
visitors on a non-public or nonexistent project, or a private one, seeing
the same "not found" handling that already exists, and the only
difference for a successful anonymous view being that every write control
is hidden.

## Goals / Non-Goals

**Goals:**
- One implementation per page. `ProjectPage`, `FolderExplorerPage`,
  `CaseDetailPage`, `SuitesPage`, `SuiteDetailPage`, `RunsPage`, `RunPage`,
  `RunItemDetailPage` render identically for an authenticated member and
  an anonymous visitor on a publicly accessible project — same components,
  same layout, same URL.
- Every write control on those pages hides for an anonymous visitor
  exactly the way it already hides for a member without the matching
  permission flag — one gating mechanism, not two.
- `/` becomes a real discovery surface for anonymous visitors, folding in
  `add-public-project-discovery`'s zero/one/many resolution rather than
  keeping it as a separate `/public` page.
- Zero backend changes. `/api/v1/public/*` already covers every read these
  pages need; it becomes the frontend's anonymous data source as-is.
- Zero database/migration involvement — this is a pure frontend
  reorganization, trivially revertible.

**Non-Goals:**
- Reopening the backend decision. `authenticate`, `requirePermission`, and
  the two separate route trees stay exactly as `enable-public-project-access`
  designed them. This change is entirely about which frontend component
  renders for a given request, not about how the API authorizes it.
- Any change to what's exposed anonymously. The read surface is exactly
  what `mountPublicAPI` already whitelists (no membership list, no
  permissions endpoint, no admin/teams/roles/tokens/identity routes) —
  unchanged.
- Signed/expiring share links, narrower-than-project scoping, or any
  anonymous write path — all already explicitly rejected by
  `enable-public-project-access` and still out of scope here.
- Fixing `useProjectSummaries()`'s pre-existing `[]`-loading-sentinel flash
  (flagged out-of-scope by `add-public-project-discovery` too) — unless
  D6 below turns out to demonstrably need it; verify during implementation
  rather than assuming either way up front.

## Decisions

### D1 — No backend or auth-model change; `/api/v1/public/*` becomes the frontend's anonymous data source, unmodified

Every read the nine pages need already has a public equivalent, **with one
deliberate exception**: `CaseDetailPage` and `RunItemDetailPage` call
`GET /api/v1/users` to resolve version/result-history author names and
avatars. That route is authenticated-only, unscoped, and returns every
instance user's email and Tenant Admin status — it has no public
equivalent and **must not get one**. This is scope, not an oversight: a
security review (2026-08-10) flagged that "make the anonymous view look
identical" is exactly the instinct that would motivate adding a public
identity lookup later to close this one remaining visual gap, which would
leak the entire user directory. The anonymous branch of both pages
renders version/result history **without** an author name (see D10)
rather than closing this gap. Every other read the nine pages need — project,
folders, cases (detail/versions/executions), suites (detail/trend), runs
(detail/items/summary), results, attachments — is already covered.
`authenticate`/`requirePermission`/`EffectivePermissions` and the
`authorization` capability's requirements are untouched; this change adds
no delta to that spec.

### D2 — Dual-mode data access: each page branches on `useAuth().user`, calling the matching public path when absent — gated on `loading`, not just `user`

No generic "auto-switching API client" abstraction — that would hide a
real branch behind magic and make the two trees harder to audit
independently (the same reasoning `mountPublicAPI` used to stay a
literal, readable whitelist). Instead, each page's existing data-fetching
hook (`useProjectLanding`, the inline `api.GET` calls in
`FolderExplorerPage`/`CaseDetailPage`/etc.) takes the authenticated-vs-anonymous
branch explicitly: `user ? '/api/v1/projects/{projectKey}/...' :
'/api/v1/public/projects/{projectKey}/...'`, mechanical and visible at
each call site. `PublicHeader.tsx`'s existing `usePublicProjects`-style
loading-sentinel discipline (`T[] | undefined`, never defaulting to `[]`)
carries over to any hook this touches.

**Critical correction from security review (2026-08-10):** today,
`RequireAuth`'s `if (loading) return null` (`App.tsx`) means none of these
pages' fetch effects have ever needed to consider `useAuth()`'s `loading`
state — they only ever mount once `loading` is already `false`. Once
`RequireAuth` stops wrapping these routes (D3), that guarantee disappears.
Branching on `user` alone would run the anonymous-mode fetch on first
paint whenever `loading` is still `true` — the always-present window while
`GET /api/v1/users/me` is in flight on every hard refresh or deep link.
A signed-in member refreshing a private project's URL would transiently
fetch the public endpoint, get its 404, and could render "not found"
before auth resolves — and since these effects' dependency arrays don't
currently include `loading`, nothing would force a re-fetch once it does.
**Every dual-mode fetch effect must therefore wait on `!loading` before
firing either branch**, exactly mirroring what `RequireAuth`'s blanket
`return null` used to give for free. Each per-page task (tasks.md §3-11)
includes a test asserting no request fires while `loading` is `true`.

**Alternative considered and rejected:** a shared `apiForContext()` helper
returning a pre-bound client. Saves a few characters per call site at the
cost of making "which tree does this request hit" a hop through indirection
instead of a literal string next to the call — not worth it for ~8 call
sites.

### D3 — `RequireAuth` stops wrapping the 9 project-content routes; each page resolves its own access and falls back to existing "not found" handling

Today `RequireAuth` is a blunt gate: no session → redirect to `/login`,
no exceptions. Making it resource-aware (fetch first, then decide whether
to redirect) would mean either an extra network round-trip before any
page can render, or teaching the router about resource-level public-ness
before rendering starts — real complexity for a binary outcome the page
itself already needs to compute anyway (D2's branch already resolves "can
I read this").

Instead: the 9 project-content routes in `App.tsx` (the eight listed under
Goals, plus `ProjectsPage` at `/` — see D6) render outside `RequireAuth`. Each page keeps its existing `notFound` state (every one of
them already has one, per D1's confirmed API parity) and extends it: a
missing/inaccessible resource now covers three cases the page can't and
shouldn't distinguish (doesn't exist / exists but not public / exists,
private, you're not signed in) — the same non-disclosure guarantee
`requirePublicProject`'s uniform `404` already gives, inherited for free
because the frontend is calling that same endpoint and gets that same
`404` back, unable to tell the cases apart either. The existing "not
found" message gains a second affordance alongside "Go to Projects" (which
still works — `/` is a legitimate destination for everyone, per D6): a
"Log in" link carrying the current path as `loginFrom`, reusing the
pattern `PublicHeader`/`LoginPage` already established.

Every other route (`ProjectSettingsPage`, `ProjectMembersPage`,
`PeoplePage`, `RolesPage`, `TokensPage`, `InstanceSettingsPage`,
`ProfilePage`) keeps `RequireAuth` exactly as today — none of these have
or need a public equivalent.

### D4 — Uniform permission-gating across all 9 pages (and one shared component) is a hard prerequisite, not a parallel task

`SuitesPage`, `RunPage`, `CaseDetailPage`, `RunItemDetailPage`,
`NewRunPage`, `SuiteDetailPage` currently render write controls
unconditionally for any authenticated user (backlog issue #110) — safe
today only because the server 403s and no anonymous visitor ever reaches
these pages. Once D3 ships, that second assumption stops being true:
an anonymous visitor reaching one of these pages would see live-looking
buttons that silently fail (or, for a truly anonymous request with no
session at all, would 401 with nothing to show for it — same outcome,
worse UX). This retrofit must land and be verified — for authenticated
users, as a pure UX improvement with no behavior change to what's
actually allowed — before any of these pages is pulled out of
`RequireAuth`. `useProjectPermissions` already returns `undefined`
(treated as "hide everything") when there's no project key or the request
fails; for an anonymous caller it will simply never resolve a truthy
permission, so no new hook logic is needed there.

**Correction from security review (2026-08-10) — the retrofit scope is
larger than first assessed:**

- **`FolderExplorerPage` is NOT already correctly gated**, contradicting
  this design's original claim. Only its Delete action checks
  `permissions?.caseDelete`/`sectionDelete`; "+ New section" (`sectionCreate`),
  "+ New test case" (`caseCreate`), and the row-level "Move to…" action
  (`caseEdit`) all render unconditionally today. `ProjectPage` and
  `ProjectSettingsPage` were re-verified and are genuinely correct — only
  the `FolderExplorerPage` claim was wrong.
- **`RunPage`'s retrofit covers more than Close/Reopen**: its per-item
  "Assign to…" action and bulk verdict-setting also need
  `runRecordResult` gating.
- **`RunItemDetailPage`'s retrofit covers more than record-verdict**:
  Retest, "Assign to…", and attachment upload/remove all need
  `runRecordResult` gating too.
- **`SuiteActionsMenu.tsx`**, a component shared by both `SuiteDetailPage`
  and `SuitesPage`, has zero gating today: Run suite (`runCreate`),
  Rename (`suiteEditMembership`), and Delete (`manageProject` — not
  `suiteEditMembership`, easy to get wrong) all render unconditionally.
  Since it's shared, it's gated once, not per-page.

**Fragility note, worth a code comment where these checks live:** the
"hidden" outcome is identical whether caused by "no session at all" or
"authenticated but under-permissioned" — both resolve through
`useProjectPermissions` returning a falsy flag. That equivalence is
correct and intentional, but a future "simplification" to
`if (!user) return null` instead of checking the actual permission flag
would be wrong for a different reason (it would stop correctly hiding
controls from an under-permissioned *authenticated* user) even though it
happens to still be safe for anonymous visitors. The permission check,
not a user-presence check, is the one true gate — keep it that way even
where the anonymous case would work out fine either way.

### D5 — Anonymous chrome lives in `Layout`, not a separate header component

`App.tsx`'s `Layout` already conditionally renders the user-only chrome
(`{user && (<AdminMenu/>, <UserMenu/>)}`) and permission-gated links
(`Members`, `Settings`). Once `Layout` wraps anonymous requests too (it
currently only ever renders inside `RequireAuth`, i.e. never for
anonymous — that changes under D3), those conditionals already do the
right thing with zero new code: anonymous visitors simply get none of
that chrome, for free. What's missing is the reverse — an explicit
"you're viewing this without an account" banner and a "Log in" link when
`!user`, which today live in the now-deleted `PublicHeader.tsx`. That
banner strip moves into `Layout`, rendered when `!user && !loading`,
directly above `<main>`, matching its original visual position on the old
public page.

### D6 — `/` (`ProjectsPage`) becomes the anonymous discovery surface, replacing the standalone `/public` index

`add-public-project-discovery`'s zero/one/many resolution
(`usePublicProjects`, the redirect-when-exactly-one behavior) is the
correct logic — it's just currently attached to a page (`PublicProjectsIndexPage`)
that no longer needs to exist separately. `ProjectsPage.tsx` gains the
anonymous branch: `user` present → today's behavior, unchanged; `user`
absent → fetch `/api/v1/public/projects`, apply the same zero/one/many
resolution. `ProjectsPage` moves out of `RequireAuth` alongside the other
eight (D3's list is actually nine pages counting this one).

### D7 — `/public/{key}` and `/public` become plain redirects, not 404s

Anyone who already has a `/public/{key}` link (documented in
`getting-started.md`, potentially already shared by a user) should land
somewhere better, not break. Both become `<Navigate>` routes to
`/projects/{key}` and `/`, respectively — the unified page renders there
under D3/D6, visually richer than before, which is the intended outcome
of this whole change, not a regression to guard against.

**The redirect must be existence-blind** — a pure `useParams()` → path
rewrite, no fetch, no check of whether the project exists or is public.
The destination page (already unwrapped per D3) owns the not-found/
non-disclosure decision entirely; a redirect that tried to decide where
to send someone based on a pre-check would reintroduce exactly the
existence oracle D8 depends on not existing anywhere in this flow.

### D8 — Non-disclosure posture is preserved, not weakened

The old design relied on the backend returning one literal `404` response
body for "not public," "doesn't exist," and (for the discovery index)
"switch is off." That guarantee is untouched — the frontend still can't
distinguish these cases, because it's calling the exact same
`requirePublicProject`-gated endpoint and getting the exact same `404`.
What changes is only which component renders the resulting "not found"
state — the real project page's existing not-found branch, instead of a
dedicated public page's.

### D9 — Route categorization is structural (two named route groups + a manifest test), not just this document's prose

Today `App.tsx`'s route table is one flat list of near-identical
`<Route><RequireAuth>...` blocks — nothing in the code itself distinguishes
"account-only, always gated" from "project-content, potentially public."
After this change, the two categories will sit interspersed, distinguished
only by the presence or absence of a `RequireAuth` wrapper and by this
document. A security review (2026-08-10) flagged that as inadequate
margin at this project's scale (one maintainer + AI agents adding pages
over time, per `CLAUDE.md`): a future page added by copying an
already-unwrapped route as a template could skip `RequireAuth` without
anyone noticing the omission was supposed to be a closed, deliberate list.

**Decision:** two explicitly named route arrays/groups in `App.tsx` —
`ACCOUNT_ONLY_ROUTES` (rendered inside `RequireAuth`, unchanged from
today) and `PROJECT_CONTENT_ROUTES` (rendered outside it, per D3) — so
which category a route belongs to is a structural fact of the code, not
something you have to already know to notice is missing. A new
`App.test.tsx` case enumerates every registered route and asserts each
appears in exactly one of the two arrays, so CI fails if a new route is
added to neither (or both).

### D10 — No public identity lookup, ever; anonymous version/result history omits the author name instead

Per D1, `CaseDetailPage`/`RunItemDetailPage`'s author-name lookup
(`GET /api/v1/users`) has no public equivalent and must not get one — that
endpoint returns every user's email and Tenant Admin status, unscoped.
The anonymous branch of both pages renders version/result history rows
without a resolved author name (e.g. blank, or a generic "—", exact copy
left to implementation) rather than closing this one remaining visual gap.
This is the one deliberate, permanent exception to this change's own
"identical page" goal — flagged explicitly, not left to be silently
rediscovered, precisely because "make it look the same" is the instinct
that would otherwise motivate adding the public lookup this decision
forbids.

### D11 — `user` alone is the wrong branch signal: a signed-in non-member must fall back to the public branch, not 403

**Correction from a QA/security pass (2026-08-11), after all of D1–D10 had
already shipped.** D2's branch — `user ? authenticated : public` — silently
assumed every signed-in visitor is either a project member or a Tenant
Admin. Verified against the running stack that this is false:
`GET /api/v1/projects/{key}` requires `PermRead` (`requirePermission`,
`middleware.go`), so a signed-in user with no membership row on a
*public* project gets **403**, while the exact same project's
`GET /api/v1/public/projects/{key}` returns 200 to that same user. Every
one of the 9 dual-mode pages currently branches on `user` alone, so a
signed-in non-member is 403-walled into "Project not found" on a project
an anonymous, logged-out visitor to the identical URL reads fine — a
regression versus the pre-existing `PublicProjectPage.tsx` (retired by
this same change), which never checked auth state at all and so gave a
signed-in non-member full public read access. Not a confidentiality bug
(the failure mode is 403/denial, never over-exposure) but a real,
demonstrated availability regression, and squarely within this change's
own stated goal ("the same page ... for every visitor — logged-in or
not").

**Fix:** each of the 9 dual-mode pages' branch condition changes from
`user` to a new `useProjectReadAccess(projectKey, user, authLoading)`
hook (`useProjectPermissions.ts`), returning `'loading' | 'member' |
'public'`. It fetches the same `/api/v1/projects/{projectKey}/permissions`
route every one of these pages already calls via `useProjectPermissions`
for control-gating (`PermRead`-gated, so 200 iff the signed-in actor can
read this project — Tenant Admins always pass via the existing bypass in
`requirePermission`) and resolves to `'member'` on success, `'public'` on
any failure (403, 404, network error) **and** immediately for `!user`
(no fetch needed — anonymous always takes the public branch). Each page's
data-fetch effect gates on `access !== 'loading'` in place of the old
`!authLoading` guard (subsumes it: `access` cannot leave `'loading'`
until the auth check has already resolved).

**Rejected: extending `useProjectPermissions`'s own return value.** Its
existing `Permissions | undefined` contract is relied on, unchanged, by
10 call sites for pure UI control-gating, where "still loading" and
"confirmed no access" are deliberately indistinguishable (both correctly
mean "hide the control"). Overloading it to also carry the loading/denied
distinction this decision needs would touch two account-only pages
(`ProjectSettingsPage`, `NewRunPage`) that have nothing to do with dual-mode
access at all. A second, small hook costs one extra `GET /permissions`
per authenticated page view (no shared query cache exists in this
codebase to dedupe it) — accepted as the cheaper trade against rippling
a working, independently-tested hook's contract; matches D2's own
"mechanical and visible, no shared abstraction" reasoning.

**Scope:** 8 of the 9 dual-mode pages (`ProjectPage`, `FolderExplorerPage`,
`CaseDetailPage`, `SuitesPage`, `SuiteDetailPage`, `RunsPage`, `RunPage`,
`RunItemDetailPage`) plus the new hook — `ProjectsPage`'s `/` list route
is unaffected (it lists projects the caller has access to; there is no
per-project 403 case for a list endpoint). tasks.md §16.

## Risks / Trade-offs

- **[Risk]** Regression risk touching 9 already-shipped, well-tested
  pages in one change. → **Mitigation:** every existing authenticated-mode
  test for these pages must stay green throughout — the anonymous branch
  is additive test coverage per page, sequenced so each page's public mode
  is proven (RED→GREEN) immediately after its authenticated tests are
  reconfirmed passing, never as a batch at the end.
- **[Risk]** D4's permission-gating retrofit changes real UI behavior for
  authenticated users (buttons that used to always render now sometimes
  don't) ahead of and independently of the public-access work it's a
  prerequisite for. → **Mitigation:** this is desired, not incidental —
  it's backlog issue #110, a genuine pre-existing UX bug; landing it first
  and confirming it in isolation (its own tests, its own visual check)
  de-risks D3 rather than bundling an unverified behavior change into a
  bigger diff.
- **[Risk]** Larger scope than a typical single change. → **Mitigation:**
  tasks.md sequences this into independently-buildable, independently-
  revertible steps (retrofit → one page at a time → discovery → cleanup);
  nothing requires a single big-bang diff to reach a working intermediate
  state, though final commit/push grouping follows the user's own
  standing "reduce commits" preference, not this sequencing.
- **[Risk]** Deleting `PublicProjectPage.tsx`/`PublicProjectsIndexPage.tsx`
  discards recently-written, tested, currently-passing code. →
  **Mitigation:** accepted and intended — that code is precisely the
  duplication this change exists to remove; it was never committed, so
  nothing is lost from git history either.
- **[Risk]** A signed-in member could see a false "not found" flash on a
  private project during the brief window before `useAuth()`'s initial
  session check resolves, if a dual-mode fetch fires before `loading`
  settles (D2). → **Mitigation:** every dual-mode fetch effect gates on
  `!loading`; each per-page task includes a test asserting no request
  fires while `loading` is `true`.
- **[Risk]** "Make the anonymous view look identical" could motivate a
  future contributor to add a public identity-lookup endpoint to close
  the one remaining gap (author names on version/result history),
  leaking the entire user directory. → **Mitigation:** D10 names this
  explicitly as a permanent, deliberate exception, not an oversight to
  fix later.

## Migration Plan

No database or backend deploy involved — this ships as a normal frontend
release. Suggested internal sequencing (not separate PRs/commits unless
the user asks for that): (1) D4's permission-gating retrofit, verified
against today's authenticated-only behavior; (2) D2/D3 applied page by
page, smallest first (`SuiteDetailPage`, `CaseDetailPage`) building up to
`ProjectPage`/`FolderExplorerPage`; (3) D6's `ProjectsPage` discovery
branch; (4) D7's redirects and deletion of the now-unused public-only
files. Rollback is a standard `git revert` — no data migration, no schema
change, nothing to unwind server-side.

## Open Questions

- Exact "not found / not signed in" copy per page (D3) — left to
  implementation, not a blocker for this design.
- Whether `useProjectSummaries()`'s pre-existing loading-sentinel flash
  (Non-Goals) actually surfaces as a problem once `ProjectsPage` also
  serves anonymous discovery — check during D6's implementation; fix only
  if it demonstrably does, otherwise stays out of scope as before.
