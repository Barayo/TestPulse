## Why

As a test case author, when the same steps need to run with several different
inputs (e.g. valid/invalid/edge-case login credentials), I want to define the
case once with a set of parameters, so I don't have to hand-duplicate
near-identical cases for every data variation. There is no data-driven/
parameterized case concept in TestPulse today — confirmed absent from
`domain.CaseContent` — forcing authors into either copy-paste drift risk or
under-coverage (GitHub issue #133).

## What Changes

- Add an optional `Parameters` table (a `Name` column plus author-defined
  columns, and any number of rows) to Steps-format `CaseContent`. A case with
  zero rows behaves exactly as today — no new flag, no new validation.
- Step `Action`/`Expected` text may reference `{columnName}` placeholders,
  validated at save time against the parameter table's columns whenever the
  case has at least one row.
- Adding a parameterized case to a run (via explicit case list, suite, or
  manual add-item) always expands to one Run Item per row, each with its own
  distinct name and pre-substituted step text.
- A Run Item gains its resolved test-data row (the substituted values), shown
  on its detail page.
- A new "Test Data" editor section (Steps format only) and a read-only
  parameter table on the case detail page.

## Capabilities

### New Capabilities
- `parameterized-cases`: authoring a Steps-format case's parameter table,
  `{placeholder}` substitution and validation, and run-item expansion (one
  item per data row) with the substituted content exposed on the Run Item.

### Modified Capabilities
- `test-authoring`: the case-content shape gains an optional `Parameters`
  table, and step-content validation gains the placeholder-matches-column
  rule when parameters are present.
- `test-execution`: adding a case to a run gains the "one Run Item per data
  row" expansion behavior for a parameterized case (in addition to today's
  one-Run-Item-per-case behavior for a non-parameterized one).

## Impact

- **API**: `CaseContent` gains `parameters` in `packages/shared/openapi.yaml`;
  `RunItem` gains a `testDataRow` field carrying the resolved row's values.
- **Backend**: `apps/api/internal/domain` (new `CaseParameters`/placeholder
  validation), `apps/api/internal/service` (validation on case save, run-item
  expansion in `CreateRun`/`AddRunItem`), `apps/api/internal/store` (no new
  tables — a new nullable `parameters` column on the already-versioned
  `test_case_versions` table, alongside its existing `steps`/`custom_fields`
  columns; `RunItem`'s `testDataRow` is derived, not separately stored).
- **Frontend**: a new Test Data editor section (`CaseFormatEditor.tsx`'s
  steps branch), a read-only Test Data card on `CaseDetailPage.tsx`, and a new
  "Test data" property row on `RunItemDetailPage.tsx`.
- **Docs**: case-authoring docs gain a parameterized-cases section, including
  a note to use disposable/fake values (no masking is implemented).
- **Sample Project**: seeds one parameterized case already added to a run,
  demonstrating multiple distinctly-named, correctly-substituted Run Items.
