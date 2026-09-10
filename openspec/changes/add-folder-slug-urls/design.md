## Context

Folders (`apps/api/internal/domain/domain.go`'s `Folder`) are the only
project-scoped, user-facing entity addressed by raw UUID in both its
frontend route (`/projects/{projectKey}/library/{folderId}`) and its REST
path (`/api/v1/folders/{folderId}`). Every other entity a user might share
or bookmark a URL for (Case, Suite, Run, StepGroup, Release, TestPlan,
Project) already has a short human-readable key, generated via
`claimEntityKey` against the `project_key_counters` table. Folders were
deliberately excluded from that pattern (confirmed by audit: `folder`/
`section` has never appeared in the `project_key_counters` CHECK
constraint), and a sequential key in that same style (e.g. `SP-F1`) was
considered and rejected during design discussion as not fitting folders'
nature — they're nested and moved far more often than a case is, and a
numbered key doesn't carry any of that structure the way a name-path does.

`FolderExplorerPage.tsx` already renders a breadcrumb (Library › Section ›
Subsection) built from the loaded folder tree, and already fetches that
whole tree client-side for its sidebar. This design reuses both facts
directly rather than introducing new backend surface.

**Pre-implementation review finding, load-bearing for this design:**
folder *rename* does not exist anywhere in this codebase — no service
method, no API route, no UI control (`Suite` has this exact capability
already; `Folder` never got it). The original draft of this design assumed
rename was existing plumbing being extended; it wasn't, and building it was
never this change's purpose. **Rename is explicitly out of scope** (see
proposal.md). Every mechanism below — sibling uniqueness, the redirect
columns, the resolution algorithm — is scoped to **create** and **move**
only, both of which are real, working capabilities today.

## Goals / Non-Goals

**Goals:**
- A folder's browser URL is built from its ancestors' names, not its UUID.
- Moving a folder doesn't permanently break a URL someone already
  bookmarked or shared — one prior identity is remembered.
- No change to how folders are addressed over the REST API or MCP — this
  is a browser-URL-presentation concern only.

**Non-Goals:**
- No sequential business key for folders (rejected — see Context).
- **No folder rename** (descoped — see Context). Nothing in this change
  adds a rename capability; the redirect mechanism only ever needs to
  handle a folder being moved to a new parent, not renamed in place.
- No unbounded slug-history / full redirect chain across many moves —
  single-hop only, by design (YAGNI: the common case is "I just moved this
  and my own bookmark still works," not "I moved this five times over two
  years and expect every historical link to still resolve").
- No change to `CustomField`/`User`/`Team`/`Role`/`ApiToken`/`Tag`/
  `Attachment` — confirmed during scoping that none of these are ever
  addressed by their own shareable browser URL.
- No new REST endpoint for slug-path resolution — resolution happens
  client-side against the tree the frontend already loads.

## Decisions

**Slug-path URLs, resolved client-side against the already-loaded folder
tree, not a new backend endpoint.** `FolderExplorerPage` already fetches
every folder in the project (it has to, to render the sidebar tree and
breadcrumb). Adding a server round-trip just to turn `authentication/
two-factor` into a folder ID would be pure overhead when the mapping is
already sitting in memory. Alternative considered: a
`GET /api/v1/projects/{projectKey}/folders/resolve?path=...` endpoint —
rejected as unnecessary indirection for data the client already has.

**Slug is a derived, stored column (`folders.slug`), not computed on every
read.** Computing a slug from `name` on every request is cheap in
isolation, but the redirect-resolution and uniqueness-check paths both need
to *query by* slug, which requires it to be a real column (and eventually
indexed), not a virtual/computed value. `slug` is recomputed and
rewritten only when `name` changes — today that's only at creation time,
since rename doesn't exist.

**Slugify normalizes with NFKC before transliterating**, so two names that
are byte-distinct but visually identical (different Unicode composition of
the same accented character) reliably produce the same slug — otherwise
the uniqueness guarantee below is silently incomplete for a real, if
uncommon, input class.

**A name with no slugifiable characters is rejected at validation time,
not given a fallback slug.** A name like `"🎉"`, `"···"`, or (depending on
the transliteration table) certain non-Latin scripts can slugify to the
empty string. Falling back to a random/ID-based slug for these would still
let the create succeed but produce a URL segment with no relationship to
the folder's name — silently defeating this whole feature's purpose for
that folder. `ValidateFolderName` (`apps/api/internal/domain/domain.go`)
gains a check: if `slugify(name)` is empty, reject with a clear message
("this name needs at least one letter or number") rather than silently
degrading. Alternative considered: fall back to a short opaque suffix —
rejected as reintroducing exactly the "URL doesn't mean anything" problem
this whole change exists to fix.

**`ValidateFolderName` also gains a maximum length (255 characters).**
Today there's no cap beyond the generic request body size limit. Once the
new unique index exists, an unbounded name becomes an unbounded `slug`
value, and Postgres's btree index has its own row-size ceiling — a
sufficiently long name would fail there with a generic `54000` error, not
the `23505` unique-violation the existing `isUniqueViolation` helper
(`internal/service/identity.go`) checks for, surfacing as an unhandled 500
instead of the clean 4xx this design otherwise promises. A validation-layer
cap avoids ever reaching that failure mode.

**Uniqueness is enforced per `(project_id, parent_folder_id)`, on both the
raw `name` and the derived `slug`, on both create and move.** Two names
that render differently but slugify identically (`"Two Factor"` vs
`"Two-Factor"`) must still collide, because routing only ever sees the
slug — and pure case variance (`"Auth"` vs `"auth"`) collides for the same
reason, since slugify lowercases. Moving a folder into a new parent can
just as easily produce a collision as creating one directly there, so
`MoveFolder` gets the identical check at its destination, not just
`CreateFolder`. Alternative considered: enforce uniqueness on `name` only
and let slug collisions silently pick "whichever folder was created first"
at resolution time — rejected as a silent, surprising ambiguity a
uniqueness error avoids entirely.

**The uniqueness check on create/move also rejects a slug that matches any
folder's `(previous_parent_folder_id, previous_slug)` under that same
parent — not just a live sibling's current slug.** Found during
pre-implementation review (Pepe): without this, a folder moved away frees
its old slug; if a *different* new folder is later created (or moved) into
that same parent under that same freed name, an old bookmark to the
*original* folder would resolve — via the plain live-match branch below —
straight to the *new, unrelated* folder, silently and with no redirect
indicator at all (worse than the accepted "two hops → not found" limit,
since a wrong answer is worse than a clear failure). Rejecting the create/
move in this situation means a freed slug stays genuinely unavailable for
as long as it's still serving as a redirect target for the folder that
used to hold it — which is bounded (see next decision), not permanent.

**Resolution algorithm** (client-side, walking a slug-path against the
loaded tree): starting at the project's root folder, for each path
segment, first look for a **live** child whose `slug` matches that
segment. If none, search the *entire loaded folder set for the project*
(not just this parent's live children — a moved folder is by definition no
longer a live child of its old parent) for a folder whose
`previous_parent_folder_id` equals the currently-resolved node's ID *and*
whose `previous_slug` matches the segment; if found, continue resolving
remaining segments from that folder's current children, and flag that a
redirect happened. If neither a live nor a previous match exists at any
segment, the path doesn't resolve → not-found. After full resolution, if a
redirect was flagged, the frontend replaces the URL bar with the folder's
fully-current slug-path (via `history.replaceState`, not a full
navigation) and shows a one-shot confirmation banner — reusing the
existing `ConfirmBanner` component and its established pattern (e.g.
`RunPage.tsx`'s post-navigation confirmations) rather than inventing a new
indicator. The banner doesn't reappear on a subsequent page reload, since
by then the URL bar already holds the resolved (live-matching) path.

*(An earlier draft of this algorithm checked a live child's own
`previous_slug` field, "regardless of what its `previous_parent_folder_id`
was." That's wrong: a moved folder isn't a live child of its old parent at
all, so that branch could never actually fire for the move case this
column exists to handle. Corrected above per pre-implementation review
[Luis].)*

**Existing-data migration disambiguates before adding any constraint, and
partitions by `(project_id, parent_folder_id)`, never `parent_folder_id`
alone.** Because no uniqueness has ever been enforced, some projects may
already have duplicate sibling names/slugs. **Critical detail, found during
pre-implementation review (Luis):** every project's root folder is created
by the `create_project_defaults` trigger with the identical hardcoded name
`"Root"` and `parent_folder_id = NULL`. SQL's `GROUP BY`/`PARTITION BY`
treat all `NULL`s in a column as one bucket (unlike `=` comparisons, which
never match `NULL`) — a backfill that partitions duplicate-detection by
`parent_folder_id` alone would treat **every project's root folder in the
entire instance** as one duplicate-sibling group and silently rewrite most
of them to `Root-2`, `Root-3`, etc. The backfill's `PARTITION BY` (or
equivalent) clause MUST explicitly include `project_id`. The migration
walks every project's folder tree once (ordered by `created_at` within
each `(project_id, parent_folder_id)` group), assigns each folder its
slug, and appends a numeric suffix (`-2`, `-3`, ...) to the name/slug of
every duplicate past the first — only then does the uniqueness constraint
apply to future writes.

## Risks / Trade-offs

- **[Risk]** A folder moved twice in quick succession loses the first
  move's redirect. → **Mitigation**: explicitly accepted (Non-Goals); the
  realistic case is one redirect hop, and this is far cheaper than
  unbounded history for a benefit few users will ever need.
- **[Risk]** The existing-data migration's numeric-suffix disambiguation
  changes some folders' *names*, not just their slugs, which is a
  user-visible change for any project with pre-existing duplicate sibling
  names. → **Mitigation**: this only affects the small suffix appended to
  the *duplicate* (the first-created sibling keeps its exact original
  name); flagged explicitly in the migration's own log output so it's
  auditable if a real deployment ever hits it.
- **[Risk]** Slug uniqueness is a genuinely new constraint on operations
  (folder create, folder move) that previously always succeeded — an
  existing integration (script, MCP client) that creates or moves
  same-named sibling folders will start seeing a rejection it never has
  before. → **Mitigation**: this is called out as **BREAKING** in the
  proposal; the rejection is a clean 4xx with a specific message, not a
  500, so it's straightforward for a caller to detect and handle (rename
  and retry).
- **[Risk]** `previous_parent_folder_id`'s `ON DELETE SET NULL` behavior
  will essentially never fire, since this app's `DeleteFolder` only ever
  soft-deletes (sets a `deleted` flag), never issues a SQL `DELETE`. Not a
  bug, but worth being explicit about so nobody later assumes stale
  previous-parent references get cleaned up automatically — they won't.
  → **Mitigation**: documented here; no functional impact since
  soft-deleted folders are already excluded from every list/resolution
  path.

## Migration Plan

1. Ship the new migration: add `slug`, `previous_slug`,
   `previous_parent_folder_id` columns (all nullable initially), and the
   `ValidateFolderName` max-length + empty-slug-rejection checks.
2. Run the one-shot backfill: compute + write `slug` for every existing
   folder, disambiguating duplicates per `(project_id, parent_folder_id)`
   as described above.
3. Ship the uniqueness constraint (now safe, since step 2 already
   eliminated any collision) and the service-layer checks on `CreateFolder`
   and `MoveFolder` — including the previous-identity-reservation check.
4. Ship the frontend slug-path routing and redirect resolution.

Rollback: the new columns are purely additive and unused by any
pre-existing code path; reverting the frontend routing change alone is
sufficient to fully roll back user-visible behavior without touching the
schema.

## Open Questions

None outstanding — the design was reviewed by Pepe, Luis, and Paco prior to
implementation, and every blocking/should-fix finding from that review is
incorporated above.
