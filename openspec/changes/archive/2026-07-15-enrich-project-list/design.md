## Context

`apps/web/src/pages/ProjectsPage.tsx` currently renders one fixed card grid
regardless of project count (this session's redesign, issue #21).
`useProjectSummaries` (`apps/web/src/lib/useProjectSummaries.ts`) already
batches `GET /api/v1/projects` + `GET /api/v1/projects/summaries` into one
merged list — the natural place to extend with the new fields rather than
adding more requests. `HealthBar` (`apps/web/src/components/HealthBar.tsx`,
also extracted this session) already encodes the three color bands this
change turns into status words — extending it, not replacing it.

## Goals / Non-Goals

**Goals:**
- The list's density matches how many projects there actually are, with a
  sensible automatic default and a manual override.
- Favorites and metadata (description, owner) are real, persisted
  concepts — not client-side-only decoration.
- Every new piece of UI reuses the existing teal/Geist design system; no
  new palette or typeface.
- A non-admin who can see exactly one project skips the list entirely.

**Non-Goals:**
- Server-side search/pagination — project counts at this stage don't
  justify it; `useProjectSummaries` already fetches everything in one
  batched call, and client-side filtering over that in-memory list is
  simpler and sufficient (revisit only if project counts grow enough to
  make one batched fetch itself a problem — same reasoning as
  `add-project-stats-endpoint`'s original motivation, just one order of
  magnitude further out).
- Sortable table columns, multi-select bulk actions on the list — not
  asked for.

## Decisions

### D1: View mode resolution is a pure function, not tangled into component state
```ts
type ViewMode = 'expanded' | 'compact'
function resolveViewMode(projectCount: number, isMobile: boolean, manualOverride: ViewMode | null): ViewMode {
  if (isMobile) return 'compact'
  if (manualOverride) return manualOverride
  return projectCount <= 10 ? 'expanded' : 'compact'
}
```
(Precedence corrected 2026-07-14 — an earlier draft checked
`manualOverride` before `isMobile`, which contradicts the ui-navigation
spec's "Mobile always renders compact" scenario: mobile overrides *any*
manual choice made on desktop, not the other way around. There is
accordingly no manual toggle control on mobile at all — the "Manual view
toggle overrides the automatic choice" scenario is explicitly scoped to
"a desktop user".)
Isolated and unit-testable independent of rendering — a separate concern
from the single-project skip (D6), which decides whether the list renders
at all, not which density it renders at. `isMobile` comes from a small
`useIsMobile()` hook
(`window.matchMedia('(max-width: 640px)')`, matching Tailwind's `sm`
breakpoint already used elsewhere). The manual override persists in
`localStorage` (confirmed 2026-07-14) — not just component state — so the
user's explicit choice survives a reload rather than silently reverting to
the automatic threshold. Chosen over a cookie: this is a pure
client-rendered SPA with no server-side rendering, so there's no server
that ever needs to read this value; a cookie would only add bytes to every
API request for a preference the backend never uses. `resolveViewMode`
itself stays a pure function — the `localStorage` read/write lives in the
hook that calls it, not inside it, keeping the function trivially testable.

### D2: Favorites are a new small table, not a column on `projects`
`project_favorites(user_id uuid NOT NULL, project_id uuid NOT NULL,
created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id,
project_id))`, both columns FK'd (`ON DELETE CASCADE` — a favorite has no
meaning once either side is gone, unlike audit/result history which must
survive deletion; nothing about "which projects did a now-deleted user
favorite" needs to be reconstructable later). A join table is the standard
shape for a many-to-many per-user preference; a column on `projects` can't
express "favorited by user A but not user B."

### D3: `isFavorite` and the status label are computed server-side, folded into the existing summaries response
`GET /api/v1/projects/summaries` already exists and is already
actor-independent today (same response for every caller) — this change
makes it actor-*dependent* (whether project X is a favorite depends on who's
asking), which is a real, deliberate shift, not an oversight: the
alternative (a separate `GET /api/v1/favorites` the client joins
client-side) reintroduces a second request purely to avoid this shift, for
no real benefit. `ProjectRepo.Summaries` gains a fourth grouped query
(favorites for the calling actor) alongside its existing three
(suite/case counts, pass rates) — same O(1)-requests shape
`add-project-stats-endpoint` established, extended, not abandoned. The
status label itself is *not* computed server-side — it's a pure function of
`passRate` the client already has (`healthLabel(rate)`, sibling to
`HealthBar`'s existing `healthColor(rate)`), so no new API field for it.

### D4: `ownerId` is a real (nullable) foreign key with `ON DELETE SET NULL`, not denormalized like `audit_log`/results
Unlike audit entries or run results, "who owns this project" is a *current*
fact, not a historical record — there's no requirement that it survive the
owner's deletion with the old value intact; "unowned" is the correct
post-deletion state. A plain FK with `ON DELETE SET NULL` is simpler than
denormalizing a name that would go stale the moment the real owner's email
changes anyway.

**Alternative considered**: denormalize `owner_name` like the identity
change's audit pattern. Rejected — that pattern exists specifically for
records that must stay accurate as of when they were written (an audit
trail), which "current owner" explicitly isn't.

### D5: Status label bands are word-only additions to existing `HealthBar` thresholds — not reopened
`healthLabel(rate: number): 'Healthy' | 'In progress' | 'At risk'` mirrors
`healthColor`'s existing `>=80` / `>=50` / else thresholds exactly. "No
runs yet" is handled by the caller when `passRate === null`, same place
`ProjectsPage.tsx` already branches on null today — not inside
`healthLabel`, which only ever receives a real number.

### D7: Every new label in this change is English-only — no Spanish, until real i18n exists
(Corrected 2026-07-14 — the first pass shipped these bands and the view-mode
toggle in Spanish, which was wrong: the rest of the app's copy is English,
and there is no i18n/locale-detection mechanism yet to justify mixing
languages on one page. Fixed to English across the same set: `healthLabel`,
the "No runs yet" fallback, the "Expanded view"/"Compact view" toggle, the
"Favorites"/"All projects" section headings, and the status filter chip
labels/"All".) Real localization — detecting the user's locale and
translating the whole app, not just this page — is a distinct, larger
feature, tracked separately, not bundled into this change.

### D8: Card visual language rebuilt to match the approved mockup's actual computed styles, not an approximation of it
(Corrected 2026-07-14 — the first implementation pass took the mockup's
*interaction/behavior* description (density modes, favorites, search,
status labels) seriously but not its *visual* spec: it rendered the status
as inline text next to a thin `HealthBar` sliver, used suite/case icons the
mockup doesn't have, and — most visibly — built "compact" as an entirely
different flat list-row layout that doesn't exist anywhere in the mockup.
Re-inspected the mockup's actual computed styles (via its own DOM, not
eyeballing screenshots) and rebuilt to match:
- **Status badge** (`StatusPill`, `HealthBar.tsx`): a filled pill below the
  title, tinted per band, word-only, no percentage — colors pulled directly
  from the mockup's computed `oklch()` values and registered as new
  `--status-*-bg`/`-fg` custom properties in `index.css` (both themes),
  not reused from `--primary`/`--secondary`/`--destructive` directly, since
  those are tuned for solid fills and don't have the right contrast as a
  light tint + darker text.
- **Progress bar** (`ProgressBar`, `HealthBar.tsx`): its own row below the
  badge, no percentage label, `7px` tall (vs. `HealthBar`'s existing `4px`
  inline sliver, which stays as-is for its other caller,
  `ProjectLandingPanels.tsx` — not touched by this correction). Null
  `passRate` renders a dashed empty pill, matching the mockup exactly.
- **Card footer**: plain `"N suites · N cases"` text, no icons — the
  mockup has none.
- **Compact mode**: no longer a different component/layout. Both view
  modes render the *same* card; "compact" only tightens padding/gap and
  adds more grid columns at wide viewports, matching what the mockup
  actually does between its "few" and "many" project states (nothing in
  it switches to list rows).
- **Favorites**: a distinct small mint-tinted chip-card
  (`FavoriteCard`), showing the pass rate as a *number* — the inverse of
  the main grid's word-only badge, matching the mockup's own scan-fast
  (word) vs. info-dense (number) split between the two card types.
- **Filter/toggle chips**: active state is a solid dark fill (`bg-foreground
  text-background`), not the light `bg-accent` tint used elsewhere in the
  app — matching the mockup's own filter-chip treatment specifically,
  which doesn't reuse the app's general hover/active tint.

Verified against the mockup's own DOM (`getComputedStyle`) rather than
visual comparison alone, to avoid repeating an approximation that "looks
close" but isn't actually derived from the source.)

### D10: Compact and expanded genuinely differ in information, not just in card size; project titles use weight 600, not 900
(Added 2026-07-14, after direct user feedback that D8's rebuild — while
matching the mockup's colors/bars — still had two real problems the mockup
itself couldn't answer, since it only ever depicts one density: (1) the
card title's `tp-heading` weight (`font-black`, 900) reads as "ugly"/
shouting when repeated 30+ times on one screen, appropriate for a
once-per-page `<h1>` but not a list item; (2) compact and expanded rendered
the *same* content at different padding, so switching between them barely
changed anything — defeating the point of having two modes.

**Typography**: project-card titles (both the `ExpandedGrid` card and the
`FavoriteCard` chip) drop `tp-heading` in favor of `font-semibold
text-foreground` at the same size — clear and readable at high repetition,
without introducing a new typeface (still Geist Sans, per `redesign-ui`
D2's settled "no new display typeface" decision) or changing the shared
`tp-heading` utility class itself, which stays untouched for its other,
sparser uses (page `<h1>`s, dialog titles) elsewhere in the app.

**Compact = `CompactList`, not a denser `ExpandedGrid`**: a single-column
list of slim rows — a solid status dot (`statusDotClass`, same bands as
`StatusPill`/`ProgressBar`), the name, and a small numeric/word readout
(`84%` or `No runs yet`). No description, no owner, no suite/case counts,
no progress bar. This is a real, separate component from `ExpandedGrid`,
not the same card with conditionally-hidden fields — the two view modes
now differ in *information*, matching the user's explicit ask ("compact
should contain minimum information and the extended more info"), not just
in layout density.

**Expanded gets genuinely richer**, surfacing real data the page already
fetched but discarded:
- Suite/case counts become two small stat tiles (number + caption) instead
  of one line of plain text — more scannable, more "dashboard," reuses
  `tp-label`'s existing caption styling.
- A new "Created *X* ago" line, from `createdAt` — already present on the
  `Project` API response, previously dropped during the
  `useProjectSummaries` merge; now plumbed through (`ProjectSummary` gains
  `createdAt: string`) and rendered via a small new `timeAgo()` utility
  (`apps/web/src/lib/timeAgo.ts` — hand-rolled, not a new dependency;
  `Intl.RelativeTimeFormat`-adjacent but the project has no date library
  and didn't need one for six unit buckets).
- Description grows from a 1-line to a 2-line clamp, since expanded cards
  have the room now that suite/case counts moved into tiles below.
- A subtle left-edge accent bar (`statusBorderClass`, same bands again)
  lets a card's status register by color before the pill is read, a common
  severity-scan pattern in dashboards — implemented as an absolutely
  positioned bar inside an `overflow-hidden` card rather than a Tailwind
  border-side utility, to avoid fighting the card's own uniform border.

Every new color (`statusDotClass`, `statusBorderClass`) reuses the exact
same band→token mapping `StatusPill`/`ProgressBar` already established in
D8 (`primary`/`secondary`/`destructive`/neutral) — no new palette, per the
Goals section above; "play with color" here meant applying the existing
palette in a new place (dot, border), not inventing new hues.

### D11: Compact is a grid of small accented chip-cards, not a flat row list
(Added 2026-07-14 — user feedback on D10: expanded was right, compact
"needs to be more attractive." D10 had correctly made compact minimal
*information*, but the flat `<ul>`/`divide-y` row-list it used to get there
read as a plain table — a different, plainer visual language than
`ExpandedGrid`'s rounded, accented cards, and that mismatch was most of
what read as unattractive.

Fix: `CompactList` keeps D10's information budget exactly (dot + name +
readout, nothing else) but renders each project as its own small rounded
card — `rounded-xl border`, the same `statusBorderClass` left-accent bar as
`ExpandedGrid`, hover lift (`hover:shadow-sm`) — arranged in a wrapping
grid (`grid-cols-2` up to `2xl:grid-cols-6`) rather than a single-column
list. The percentage/word readout also picks up its band's color
(`statusTextClass`, new — same tokens as `statusDotClass`/
`statusBorderClass`, just as a text color) instead of uniform muted gray,
so a Compact screen full of chips reads as colored at a glance the way the
Favorites mini-cards already did.

Net effect: compact and expanded now share one card grammar (rounded,
left-accented, hover-lit) at two different densities and information
levels, rather than compact looking like an unrelated, plainer component
bolted onto the same page.

### D12: Compact reverted to the D8 rich card — D10/D11's minimal-information experiment was the wrong call
(Added 2026-07-14 — direct user correction: "revert to this the compact
view," pointing at a screenshot of the plain D8 card — title, `StatusPill`,
`ProgressBar`, plain `"N suites · N cases"` footer, no dot, no chip, no
color-coded readout. D10's premise — "compact should show less information
than expanded" — was right and stays; D10/D11's *execution* of that premise
overcorrected into a card so stripped down (a colored dot, nothing else)
that it read as a different, plainer product. `CompactList` now renders
the exact same card body as `ExpandedGrid` — no left accent bar, no stat
tile captions, no description/owner/created/last-run — arranged at higher
grid density (`sm:grid-cols-2` up to `2xl:grid-cols-5`, smaller `p-4` vs
`p-5`) than `ExpandedGrid`. Density is still the real, deliberate
difference between the two modes; the earlier D10/D11 attempts changed too
much else along with it. `statusDotClass`/`statusTextClass` (D10/D11) stay
exported and tested in `HealthBar.tsx` — unused today, but real, working,
independently-tested primitives a future denser view could still reach
for, not deleted for having been the wrong choice this time.

### D13: `lastRunAt` is the one addition worth making to expanded, not tags
(Added 2026-07-14, in response to "include more data... or tags" — as
design lead, evaluated both against what a QA/test-management dashboard
specifically benefits from seeing, not "more data" for its own sake.

**Added**: `lastRunAt` — when the project's most recent run was started,
not just when the *project* was created. For a test-management tool, "is
this project still being actively tested" is a more actionable staleness
signal than "when did this project get created" — a project created two
years ago that was run an hour ago is healthy; one created last week with
no runs since is the one worth noticing. Threaded end-to-end: the
pass-rate query in `ProjectRepo.Summaries` already joins each project's
single most-recent run (`DISTINCT ON (project_id) ... ORDER BY
created_at DESC`) to compute `PassRate` — changed its inner join to a
`LEFT JOIN` so a run with zero items still produces a row (a run's
*existence*, not just its item count, is what `LastRunAt` reports), added
`domain.ProjectSummary.LastRunAt *time.Time`, `ProjectSummary.lastRunAt`
in the OpenAPI contract, and `ProjectSummary.lastRunAt` in
`useProjectSummaries`. `ExpandedGrid` shows `Last run {timeAgo}` in place
of `Created {timeAgo}` whenever a project has run history — showing both
every time was considered and rejected as clutter; once a project has real
run history, "when was it last run" is strictly the more useful of the two
signals, so it replaces rather than joins "Created."

**Deferred (not built)**: tags. Unlike `lastRunAt` — one column, one query
change, no new UI beyond a text label — tags are a genuinely separate
feature: a new many-to-many domain concept (tag vocabulary, project↔tag
associations), create/assign/remove UI, and almost certainly a
filter-by-tag control once they exist (an unlabeled tag is dead weight).
That's comparable in scope to `project-favorites` within *this* change,
not a card-decoration tweak — tracked as a backlog issue for its own
proposal/design cycle rather than folded in here unscoped.

### D14: Search/status-filter are available in both view modes, not compact-only
(Added 2026-07-14, direct user request.) The original scoping — search and
filter chips only in compact — assumed they mattered only once a list got
long enough to need them. In practice a user wants to search/filter
regardless of how many projects are currently visible or which density
they've chosen; gating the toolbar on `viewMode` was an arbitrary coupling
between two independent concerns (how much a card shows vs. how you narrow
the list). Fix was a two-line simplification: the toolbar's visibility
condition dropped `viewMode === 'compact' &&`, and the `visible` filter
(name/status) that used to apply only in compact now always applies before
the expanded/compact split — so the Favorites section in expanded view
correctly stops showing a favorited project once it's filtered out too,
not just the main grid.

### D15: The project switcher is hidden on the project list page itself
(Added 2026-07-14, direct user feedback: "this Select project makes not
sense in this project view.") `ProjectSwitcher` exists so a user already
inside a project can jump to another without going back to the list — on
the list page itself, showing a "Select project" control is redundant with
the page's entire purpose. `Layout` (`App.tsx`) now checks
`location.pathname === '/'` and skips rendering the switcher there;
every other route is unaffected. The switcher's ⌘K shortcut binding lives
inside `ProjectSwitcher` itself, so it's naturally unavailable on `/` too
— consistent, not a separate thing to wire up.

### D16: Toolbar layout matches the approved mockup exactly — title row carries only the create button; search/filter/density share one wide row below
(Added 2026-07-15, direct user request pointing at the mockup's own
header.) The title row previously also carried the density toggle,
crowding it against "+ New project" and leaving the search input
`max-w-xs`-narrow beside the filter chips. Restructured to match the
mockup: title row is just `<h1>Projects</h1>` + count on the left, "+ New
project" alone on the right. Everything about *narrowing/viewing* the
list — search (now `flex-1`, genuinely wide), status filter chips, and
the density toggle — moved into the one row below, in that order, the
toggle visually separated with `ml-2` since it's a different kind of
control (view density, not a filter) sharing the row for space efficiency
rather than starting a third row. No behavior changed, purely the JSX
layout — existing role/label-based test queries were unaffected since none
of them depended on DOM position.

### D6: Single-project skip needs no per-project access control — it reacts to whatever the list already is
(Corrected 2026-07-14 — originally scoped out of this change as blocked on
`add-project-rbac`; that was wrong.) The behavior is exactly: if
`useProjectSummaries()` resolves to exactly one project and the
authenticated user's role is not `admin`, navigate to that project instead
of rendering the list. This needs no new data — `useProjectSummaries`
already returns the full visible list today (currently always "every
project," since no per-project scoping exists), and `useAuth()` already
exposes the caller's role (`add-identity-basics`). The mechanism doesn't
know or care *why* the list has one entry — today that's simply because
the instance has one project; once `add-project-rbac` lands and starts
scoping the list per-user, the identical code starts doing the intended
"this tester only has access to one project" thing with zero changes here.
Admins are excluded deliberately: they need the create-project action and
the list's overview visible even with only one project today, since
they're the ones who'd add a second.

**Alternative considered**: gate this behind a check for `add-project-rbac`
existing (e.g. a feature flag). Rejected — there's nothing to gate; the
behavior is correct and safe to ship now under today's "list == all
projects" reality, and requires no follow-up change when scoping arrives
later.

## Risks / Trade-offs

- **[Risk] Favorites add a fourth query to an endpoint whose whole
  original point was staying cheap** → Mitigation: it's one more grouped
  `WHERE user_id = $1` query against a two-column indexed table — cheap
  relative to the pass-rate query's join already there; watch it in
  `add-...-performance-testing` (backlog #22) once that exists, not a
  reason to avoid building it now.
- **[Trade-off] `localStorage` is per-browser, not per-account** → a user
  switching devices or browsers sees the automatic default again, not
  their last manual choice. Accepted: the automatic default is already
  designed to be sensible (D1), so this only matters on the first visit
  from a new device, not as an ongoing annoyance.
- **[Risk] `ownerId` referencing a user that later gets deactivated (not
  deleted — `add-identity-basics` only supports deactivation, not
  deletion, for users)** → Not actually a risk: deactivated users still
  exist as rows, so the FK stays valid and the owner still displays,
  correctly reflecting "this project's owner account is deactivated" as a
  fact worth showing, not hiding.

## Migration Plan

1. Amend `00003_identity.sql`, not `00002_core_domain.sql`: add
   `description text NOT NULL DEFAULT ''` and `owner_id uuid REFERENCES
   users (id) ON DELETE SET NULL` to `projects` there instead.
   (Corrected 2026-07-14 — the original plan said this could stay in
   `00002_core_domain.sql` because "identity already runs after it by
   filename ordering," which is backwards: `00002` runs *before* `00003`
   by filename order, so `users` doesn't exist yet when `00002` applies. A
   real FK to `users` has to live in a migration that runs after `users`
   is created — `00003_identity.sql` itself, appended after the `users`
   table statement, still one file per pre-1.0 amend-in-place policy, just
   the other existing file.)
2. New `project_favorites` table, same file (`00003_identity.sql`), same
   reasoning — both its FKs reference `users`.
3. Store/service: favorites CRUD, `Summaries` extended with the actor's
   favorite set, project create/update extended with `description`/
   `ownerId`.
4. Web: `resolveViewMode` + `useIsMobile`, favorites star control, status
   labels, search/filter, description/owner on the create form and card,
   and the single-project skip check (D6) in `ProjectsPage.tsx` (or a
   route-level guard, whichever avoids a flash of the list before
   redirecting).

## Open Questions

- None — every ambiguous point (view-mode threshold, favorite semantics,
  status bands, owner deletion behavior) was resolved above by reusing an
  existing pattern already in the codebase rather than inventing a new
  one.
