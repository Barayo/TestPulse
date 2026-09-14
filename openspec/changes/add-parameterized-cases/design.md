## Context

TestPulse has no data-driven/parameterized case concept today (confirmed
absent from `domain.CaseContent`). This design was brainstormed and approved
section-by-section with the user, plus a Pepe/Fable-5 visual mock. This
document records the resulting technical decisions, including two real
mechanics not fully resolved during brainstorming that surfaced while
grounding the design in the actual `CreateRun`/`AddRunItem`/`RunRepo` code:
where per-row substitution is computed, and how a row gets a distinguishable
name in run-item lists (reusing an existing field rather than adding one).

## Goals / Non-Goals

**Goals:**
- Let a Steps-format case define a `Name` column plus author-defined columns
  and rows; `{columnName}` placeholders in step text get substituted per row.
- Adding a parameterized case to a run always expands to one Run Item per
  row, each distinguishable in list views and carrying its own resolved data.
- A case with zero parameter rows behaves exactly as it does today — no
  migration risk for the ~100% of existing cases that will never use this.

**Non-Goals:**
- Text/Gherkin format support — Gherkin's own native Scenario Outline /
  Examples table is the right future mechanism for that format specifically.
- Partial/selectable row inclusion when adding a case to a run.
- Execution-import reconciliation with native parameterization — an
  imported parameterized external test keeps matching by `TestName`/case key
  exactly as today.
- A separate "make this parameterized" toggle distinct from "has rows".
- Masking/redaction of test-data values.

## Decisions

**D1: `Parameters` is a field of `CaseContent`, versioned for free.**
`CaseContent.Parameters *CaseParameters` where `CaseParameters{ Columns
[]string; Rows []map[string]string }`. The first column is always literally
named `Name` (required, pinned — never removable and, as shipped, not
renamable in the editor either: its header input is read-only, and
`Columns[0]` is enforced to equal `"Name"` at validation time regardless).
**Storage, corrected from the original brainstorm**: rather than one
`CaseContent` JSON blob, this codebase's `test_case_versions` table already
stores each content field as its own column (`steps`, `custom_fields`,
`gherkin_source`, etc.) — `Parameters` follows that same precedent as a new
nullable `parameters jsonb` column (migration `00017`), not a field inside
some other JSON column. It's still versioned for free either way, since
that column lives on the already-versioned table — a parameter-table edit
is a case edit like any other, no new versioning machinery needed.

**D2: Row names must be unique within a case.**
Not raised during brainstorming, but required for D4's lookup to be
unambiguous: `CaseContent.Validate()` (or a new sibling validator) rejects a
save where two rows share the same `Name` value, alongside the existing
placeholder-must-match-a-column rule (validated only when `len(Rows) > 0`).

**D3: Substitution is computed at read time from the pinned, immutable case
version — nothing is separately snapshotted.**
A `test_run_items` row gains one new nullable column,
`test_data_row_name TEXT`, identifying which row (by `Name`) this item
represents. Because `test_run_items` already pins an immutable
`case_version`, and `Parameters.Rows` lives inside that same immutable
version's content, the row's values can never drift out from under an
already-created item — unlike `reusable-steps`' `StepGroupRef`, which
resolves an *external* mutable entity and therefore needs an explicit
resolve-and-snapshot step at save time, there is nothing here to snapshot.
`RunRepo`'s existing content-scanning path (used by `Items`/`Get`) is
extended: when `test_data_row_name` is set, look up that row in the scanned
content's `Parameters.Rows`, substitute `{column}` tokens into every step's
`Action`/`Expected` (and leave the row's `Name` entry out of the
substitution map itself — `Name` isn't a `{placeholder}` token, it's the
row's own label), and populate `RunItem.TestDataRow map[string]string`
(the substituted row's values, `Name` excluded, added as a new field
alongside the existing `Content`/`StepStates` fields) for the frontend.

**D4: Row naming reuses `RunItem.TestName` verbatim — no new "item name"
field.** `TestName` already exists as exactly this: "the literal name...
independent of the pinned case's own title... empty for items added
manually" (today used only by execution-import). For a parameterized case's
expanded row, the item is created with `TestName` set to that row's `Name`
value, through the *exact same* `pinItem` low-level helper `RunRepo.Import`
already uses for its own per-item names — not a parallel mechanism. This
already renders as a secondary distinguishing line in `RunPage`'s item list
and as a "Test name" property on `RunItemDetailPage` with zero frontend
changes, closing the gap Pepe's mock flagged (a manually-added parameterized
case must not produce indistinguishable, identically-titled items).

**D5: Expansion happens in the service layer, not the store layer.**
`CreateRun` and `AddRunItem` are the two entry points where a case ID
becomes one-or-more run items (explicit case list, suite-sourced case list,
and manual single-case add all funnel through the same expansion point per
entry point). After the existing dedup-and-cross-project-validation logic
(unchanged), each *unique* case ID is expanded: if its pinned current
version has zero parameter rows, it contributes one `(caseID, testName="")`
entry exactly as today; if it has N rows, it contributes N entries,
`(caseID, testName=row.Name)` each, plus the row identifier that becomes
that item's `test_data_row_name`. Rather than changing `RunRepo.create`/
`CreateWithOptions`/`AddItem`'s existing signatures (touching the ~13 call
sites across the store/service test suites that pass a bare case ID list
for the ordinary, non-parameterized case), a new `RunItemSpec{CaseID,
TestName, TestDataRowName string}` slice type is added (mirroring the
existing `ImportItem` shape `RunRepo.Import` already uses) alongside new
`createWithItems`/`AddItemSpec`-style store methods; the existing
`Create`/`CreateWithOptions`/`AddItem` become thin wrappers that build a
`[]RunItemSpec` with empty `TestName`/`TestDataRowName` and delegate —
reproducing today's exact behavior unchanged. Only `service.go`'s
`CreateRun`/`AddRunItem` (the two places expansion actually needs to
happen) call the new spec-based store methods directly; every other
existing caller is untouched.

**D5a: A baseline schema constraint had to be relaxed, not just extended.**
Discovered during implementation (not anticipated during brainstorming):
the baseline schema has `UNIQUE (run_id, case_id)` on `test_run_items` —
a case could only ever appear once per run. A parameterized case's rows
need the *same* case_id to appear multiple times within one run. Migration
`00017` replaces the blanket constraint with two partial unique indexes:
`(run_id, case_id) WHERE test_data_row_name IS NULL` (preserves today's
exact one-ordinary-item-per-case-per-run invariant, confirmed by a
regression test) and `(run_id, case_id, test_data_row_name) WHERE
test_data_row_name IS NOT NULL` (a given row of a given case still can't
be added to the same run twice).

**D6: Format scope enforced at the domain-validation layer.**
`CaseContent.Validate()` rejects a non-empty `Parameters.Rows` when
`Format != FormatSteps` — a parameterized Text/Gherkin case is a save-time
error, not a silently-ignored field, so an author can't accidentally build a
parameter table that then does nothing.

**D7: Editor and display, per Pepe's approved mock** (artifact
`60e44c2f-186f-4566-8b43-12cd060d6e2f`):
- New "Test Data" section in `CaseFormatEditor.tsx`'s steps branch, in the
  primary content column directly below `CaseStepsList.tsx` — not the
  sidebar (`PropertyRow`/`CaseSidebarSection` are for scalar one-value
  properties, not a variable-row/column grid).
- Empty state: quiet `CaseResultsPanel`-weight treatment (`tp-label` + one
  muted sentence + an outline button), not the heavier dashed "No steps
  yet" card — Test Data is off by default and shouldn't visually compete
  with Steps sitting directly above it.
- The app's first real `<table>`: compact (`text-sm`, tight `py-2` cells),
  borderless "invisible until focused" cell inputs (the same idiom already
  used for the case title), not boxed `Input` components.
- Add-row: text link copying `CaseStepsList.tsx`'s exact "+ Add step"
  treatment. Add-column: a compact ghost icon button pinned at the header
  row's trailing edge. Header column-delete icons are hover-reveal only.
  Client-side guard blocks removing a column still referenced by a
  `{placeholder}` in the steps, before it ever reaches server-side
  validation.
- Case detail (view mode): steps keep literal `{placeholder}` text, tinted
  `text-primary font-bold` to read as a recognized template slot; a
  read-only Test Data card renders below, only when rows exist.
- `RunItemDetailPage.tsx`: one new "Test data" `PropertyRow` (chip per
  non-`Name` column, `key: value`, reusing the Tags/custom-field chip idiom
  — never `Badge`, since these are free values not a fixed enum). No
  change to how steps themselves render — already-substituted text arrives
  from the API and flows through `CaseContentView`/`ExecutionStepsList`
  unmodified.
- Plaintext test-data values are a deliberate choice (masking would defeat
  the point of seeing what value a failing step actually ran against); docs
  gain a one-line note to use disposable/fake values, never real ones.

**D8: Permissions.** Reuses `caseEdit` verbatim for editing the Test Data
table — it's part of case content editing, no new permission flag.

**D9: The run-item detail route is keyed by caseKey, which a parameterized
case now breaks — needs a disambiguator, not a route redesign.** Discovered
writing the E2E test (not anticipated during brainstorming or sections
1-8, since store/service/API tests all address items by `id` and every
frontend unit test mocked exactly one item per caseKey): every navigation
to a run item's own page builds `/runs/{runKey}/items/{caseKey}`
(`RunPage.tsx`, `RunItemDetailPage.tsx`'s own next/prev and
advance-to-next-pending logic), and `RunItemDetailPage.tsx` resolves
"the" item via `runItems.find(it => it.caseKey === caseKey)`. A
parameterized case's N expanded rows all share one `caseKey` within a
run, so every one of those links resolved to the same first-matched
item — rows 2..N were simply unreachable. Considered renaming the route
to key by the item's own `id` instead (more semantically correct, but a
bigger blast radius: every internal link, e2e test, and any bookmarked/
shared URL would change shape, for a problem this feature alone
introduces). Chose the smaller, backward-compatible fix: an optional
`?row={testName}` query parameter appended whenever `item.testName` is
set (a new `apps/web/src/lib/runItemUrl.ts` helper used at every
navigation call site), and `RunItemDetailPage.tsx` now filters
same-caseKey candidates by `testName === row` when present, falling back
to the first match otherwise — zero URL-shape change for the overwhelming
majority of items, which have no `testName` and are still unambiguous by
caseKey alone. This also incidentally fixes the same pre-existing
collision for several externally-imported results sharing one caseKey in
one run (already possible before this feature, via `testName`'s other
meaning), which was previously silently broken the same way. **Known
remaining gap, deliberately not chased further**: `VersionDetailDialog.tsx`'s
per-version "Executions" list (cross-run history, sourced from
`GET /api/v1/cases/{caseKey}/executions`) still links bare
`/runs/{runKey}/items/{caseKey}` with no disambiguator, because
`CaseExecution` doesn't carry `testName` at all — fixing that would need
a store/service/openapi change to add the field, out of proportion to
this already-broad change. The redirect-to-login `state.from` on
`RunItemDetailPage.tsx`'s not-found branch has the same small gap. Both
land on *a* valid item for the case, just not necessarily the originally
intended row — no crash, no data loss, just an extra click to find the
right row on a secondary path.

## Risks / Trade-offs

- **[Risk]** A naive implementation could change `RunRepo.create`/
  `CreateWithOptions`/`AddItem`'s existing signatures, touching every
  existing caller (`sampledata/helpers.go` and ~13 store/service test
  files).
  → **Mitigation (D5):** don't change them — add new `RunItemSpec`-based
  methods and make the existing bare-case-ID methods thin wrappers around
  them. Every existing caller is untouched; only `CreateRun`/`AddRunItem`
  (where expansion actually needs to happen) call the new methods.
- **[Risk]** A case with a very large parameter table (many rows) could
  make a single "add to run" action create an unexpectedly large number of
  run items.
  → **Mitigation:** no cap added now (YAGNI — no evidence this is a real
  problem yet); the existing per-request unbounded-list concerns already
  tracked elsewhere (#180-class) apply here too if it ever becomes one.
- **[Trade-off]** No partial-row selection when adding to a run (accepted,
  matches brainstorming) means a tester who only wants some variations must
  either not add the case, or add it and ignore/skip the unwanted items —
  slightly awkward, but avoids a nontrivial new picker UI for a need that
  hasn't been demonstrated yet.
