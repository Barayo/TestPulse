## Context

`add-library-bulk-select` and `add-library-folder-selection` already give the
Library a selection model (`FolderExplorerPage.tsx`'s `orderedVisibleEntries`
+ `selected: Set<string>`, disjoint folder/case ids) and a floating footer bar
(`LibraryBulkActionBar.tsx`) with Move to…/Delete/Clear. This change adds one
more action — turning the selection into a new suite — reusing existing
endpoints (`POST /projects/{projectKey}/suites`,
`PUT /suites/{suiteKey}/cases/{caseKey}`) with no backend change.

Per project rule, a Pepe (Fable 5) design pass ran before this doc was
written to resolve the proposal's four open questions; its reasoning and a
live mock are at
https://claude.ai/code/artifact/ddf8fca9-2ecf-4427-a76c-bdf8d3f21704 (the
mock has since been rebuilt and revised twice against direct user feedback —
see the D2 and D7 "Revised" notes below for what changed and why).

## Goals / Non-Goals

**Goals:**
- Add "Create suite from N cases…" to the footer bar. N is the *resolved*
  total: every directly-selected case, plus every case (recursively) inside
  every selected folder, deduplicated.
- A selected folder contributes its full subtree of cases as suite members
  — selecting a folder is shorthand for "all the cases in here," matching
  what the folder row's own case count already promises the user.
- Reuse the existing suite-creation dialog idiom (`SuitesPage.tsx`'s "+ New
  suite", `SuiteActionsMenu.tsx`'s quick-run dialog) rather than inventing a
  new interaction pattern.

**Non-Goals:**
- No new backend endpoint. Folder-to-case resolution happens entirely
  client-side (D7) — `FolderExplorerPage.tsx` already loads the project's
  full case and folder lists up front, so no new fetch is needed either.
- Folders themselves are never suite members (a suite is a set of case
  ids) — selecting one is purely a shorthand for its contained cases, the
  same relationship folders already have to bulk-delete's cascading scope.
- No "stay and keep editing" mode — this is a commit-and-navigate action,
  not a build-up-a-draft-suite flow.

## Decisions

### D1 — Commit immediately, navigate to the new suite's page (not a toast, not a stay-on-Library flow)

`SuitesPage.tsx:236-261`'s existing "+ New suite" dialog is the direct
precedent for *creating a suite*: confirm → `POST /suites` →
`navigate(`/projects/${projectKey}/suites/${created.key}`)`, no intermediate
screen. This action is still "create a suite," just pre-seeded with members,
so it follows the same shape rather than `SuiteActionsMenu.tsx`'s "Run
suite" dialog, which deliberately stays put with a `ConfirmBanner` toast —
that pattern exists because you're likely still reviewing the *suite* and
might fire another run. Here, once the Library selection becomes a suite,
there's nothing left to iterate on in the Library; the new suite's own page
(already showing the case count in its Properties sidebar) is the
confirmation.

One addition over the bare "+ New suite" dialog: a `DialogDescription`
stating what will happen, matching the quick-run dialog's own
`{n} cases from {suite.name}` idiom (`SuiteActionsMenu.tsx:184`) — here,
`{n} cases from your selection will become this suite's members.` A
selection can be large and is invisible once inside the dialog, so this line
carries information the plain "+ New suite" dialog doesn't need to.

**Alternative considered**: navigate to `NewRunPage`-style "customize
selection" hand-off (seed a page with `location.state`, let the user adjust
before committing). Rejected — that pattern exists for runs because a run's
membership is worth tuning per-execution; a suite created from a selection
the user just hand-picked in the Library needs no extra tuning step.

### D2 — Hide only when the resolved selection has zero cases

Matches the codebase's settled idiom for "doesn't apply here" —
`SuiteActionsMenu.tsx:118-144` hides Run suite/Rename/Delete per-permission
rather than rendering them disabled. The action doesn't render when the
*resolved* case count (D7) is zero — which, now that folders recursively
contribute their cases, only actually happens for an empty folder with no
cases anywhere in its subtree. A folders-only selection where those folders
do contain cases is no longer a reason to hide the button; it's exactly the
common case this action exists for.

**Revised twice against direct user feedback on the mock**: the original
design (Pepe's mock) put a case-only count on the button
(`"Create suite from {n} cases…"`) that deliberately *excluded* every case
inside a selected folder, intending the mismatch against the footer's
combined `{count} selected` to signal "some of your selection is excluded."
In practice this read as *wrong*, not *intentional* — a selected folder row
already shows its own case count (e.g. "Two-Factor · 4 cases"), so a footer
button reading "Create suite from 2 cases…" next to a folder visibly
containing 4 more looked like a bug, not a deliberate scope. The first
revision dropped the count entirely ("Create suite from selection…"); the
user's follow-up made clear the better fix was to make folders *count*
rather than making the button say less — so folders are now resolved
recursively into their contained cases (D7), and the button shows that
resolved, now-accurate total.

Gating: rendered only when `resolvedCaseCount > 0 && permissions?.suiteCreate`.
Placement in the action cluster: **Move to… → Create suite from N cases… →
Delete → Clear** — the destructive action stays rightmost next to Clear
(existing convention); the new non-destructive action slots in before it.

**Alternative considered**: disable the button with a tooltip explaining why,
for the true-zero-cases edge case. Rejected per the hide-not-disable
precedent above — an empty folder is rare and unremarkable, not an error
condition worth a tooltip.

### D3 — Exact button/dialog copy and control shape

- Footer button (new `BulkAction` entry, `kind: 'button'`): label
  `` `Create suite from ${n} case${n === 1 ? '' : 's'}…` ``, where `n` is
  the D7-resolved total (direct cases + every case in every selected
  folder's subtree, deduplicated) — not the footer's own combined
  `{count} selected`.
- Dialog title: **"New suite from selection"**.
- Dialog description: `` `${n} case${s} from your selection will become this
  suite's members.` `` — `n` is the same D7-resolved total the button
  shows, so the number a user commits to never changes between the footer
  and the dialog.
- Field: `Label` **"Suite name"**, `Input` placeholder **"Smoke"** (same
  example text as `SuitesPage.tsx:246`, kept for consistency).
- Footer: `Cancel` (outline) + **"Create suite"** (default, `disabled`
  until the name is non-empty) — named "Create suite" rather than bare
  "Create" because, unlike plain "+ New suite", this action also commits
  membership in the same step; matches the quick-run dialog naming its own
  button "Create run" rather than "Create".
- Enter-to-submit in the name field, matching `SuiteActionsMenu.tsx`'s
  rename dialog (`onKeyDown` → submit if non-empty).
- Cancel/dismiss (X, overlay, Escape): closes the dialog only. The Library
  selection is left untouched — same as the existing bulk-move dialog's
  cancel behavior.

### D4 — Cross-section membership needs no restriction

Suites already support members from arbitrary sections (a suite is just a
set of case ids); the selection's cases can span any number of sections
without special-casing. This mirrors the existing single-case
add-to-suite path and needs no new validation.

### D7 — Folder selection resolves recursively into its subtree's cases, client-side, no new endpoint

A selected folder contributes **every case anywhere in its subtree, at any
depth** — not just its direct children — mirroring how bulk-delete already
treats a selected folder's scope as its full recursive subtree, not one
level. This reuses `subtreeIds(folders, folderId)` (built for
`add-library-folder-selection`, already recursive) to get every descendant
folder id, then filters the case list already loaded by
`FolderExplorerPage.tsx` (`api.GET('/api/v1/projects/{projectKey}/cases')`,
loaded once up front for the whole project, not paginated per folder) by
folder membership in that set:

```
function resolveSuiteCaseKeys(
  selectedFolderIds: string[],
  selectedCaseKeys: string[],
  folders: Folder[],
  cases: TestCase[],
): string[] {
  const folderScope = new Set(
    selectedFolderIds.flatMap((id) => [id, ...subtreeIds(folders, id)]),
  )
  const fromFolders = cases.filter((c) => folderScope.has(c.folderId)).map((c) => c.key)
  return [...new Set([...selectedCaseKeys, ...fromFolders])]
}
```

The final `new Set([...])` dedupes a case that's both directly selected and
also inside a selected folder's subtree (or inside two overlapping selected
folders, e.g. a folder and its own selected ancestor) — this is a real
union, not `folderDeletePreviewTotal.ts`'s accepted-imprecision sum (that
helper only ever needs a count for a destructive-action upper bound; this
one needs the literal case keys that become suite members, so a duplicate
`PUT` would be wasted work, not just a display quirk — deduplication isn't
optional here the way it was there).

Because both `folders` and `cases` are already loaded in page state, this
is a synchronous, no-network computation — the resolved count (D2/D3) can
be recalculated on every selection change with no loading state, unlike
`folderDeletePreviewTotal.ts`'s per-folder network round trip for
bulk-delete's confirmation count.

**Alternative considered**: keep folders out of suite membership entirely
(the original design) and only ever act on directly-selected cases.
Rejected per direct user feedback — a folder's own case count is already
visible on its row, so excluding it from "create a suite from this
selection" reads as a bug, not a scope decision, and the codebase already
has the exact traversal helper (`subtreeIds`) needed to do it properly.

### D5 — Client orchestration: new `createSuiteFromCases.ts` helper

Following `bulkMoveCases.ts`/`bulkDeleteCases.ts`'s established shape, and
taking the already-resolved case keys from D7 (not the raw selection):

```
async function createSuiteFromCases(
  projectKey: string,
  name: string,
  caseKeys: string[],
): Promise<{ key: string; name: string }> {
  const { data: suite } = await api.POST('/api/v1/projects/{projectKey}/suites', {
    params: { path: { projectKey } },
    body: { name },
  })
  await Promise.all(
    caseKeys.map((caseKey) =>
      api.PUT('/api/v1/suites/{suiteKey}/cases/{caseKey}', {
        params: { path: { suiteKey: suite.key, caseKey } },
      }),
    ),
  )
  return suite
}
```

No new backend endpoint; `POST /suites` then `Promise.all` over the existing
per-case membership `PUT`, matching the bulk-move/bulk-delete helpers'
sequential-create-then-parallel-fan-out shape.

### D6 — Selection clears after successful creation

Matches existing bulk Move to…/Delete behavior (both clear `selected` on
success). The Library selection was "spent" turning into the suite; there's
nothing left in it to act on, and navigating away from the Library makes a
stale selection moot regardless.

## Risks / Trade-offs

- **[Risk] A very large selection means many sequential membership PUTs
  firing in parallel via `Promise.all`, no batch endpoint exists.** →
  Mitigation: this is the same trade-off already accepted by
  `bulkMoveCases.ts`/`bulkDeleteCases.ts`; no evidence of it being a real
  problem at Library-selection scale (bounded by what's visible/selectable
  in one folder view). Not addressed by this change; a real batch endpoint
  is a separate, larger change if it ever becomes necessary.
- **[Risk] Partial failure mid-`Promise.all`** (suite created, some
  memberships fail) **→** Mitigation: none added beyond what
  `bulkMoveCases`/`bulkDeleteCases` already do (no rollback) — consistent
  with existing bulk-action error handling in this codebase; out of scope
  for this change to introduce transactional semantics that don't exist
  elsewhere in the bulk-action family.
- **[Risk] A folder selected alongside its own ancestor or descendant folder
  (both selected at once) could double-add a case if resolution weren't a
  true set union.** → Mitigation: D7's `resolveSuiteCaseKeys` collects into
  a `Set` before mapping to `PUT` calls, so overlapping folder scopes and a
  directly-selected case that's also inside a selected folder all collapse
  to one membership call each. Not a `Promise.all`-timing risk — the
  dedup happens synchronously before any network call is made.

## Open Questions

None outstanding — Pepe's original design pass resolved the proposal's four
open questions, and D2/D7's later revision resolved the follow-up feedback
that the case-only-exclusion behavior read as a bug once tried in the mock.
