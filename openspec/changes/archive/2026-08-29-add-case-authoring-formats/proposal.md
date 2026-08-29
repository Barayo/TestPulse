## Why

As a test author, when I'm documenting exploratory/manual test flows or BDD-style
scenarios, I want to write case content as free-text or Gherkin
(Given/When/Then) instead of being forced into structured action+expected
steps, so the case's format matches how the test is actually specified.
Today `CaseContent` (`apps/api/internal/domain/domain.go`) has exactly one
shape — a list of `Step{Action, Expected}` — with no alternative.

## What Changes

- `CaseContent` gains a `Format` discriminator field: `"steps"` (existing
  behavior, default), `"text"`, or `"gherkin"`. Validated in `Validate()`
  the same way `Priority` is validated today.
- New migration adds a `format text NOT NULL DEFAULT 'steps'` column (with a
  CHECK constraint mirroring the `priority` column's pattern) to
  `test_case_versions`. This is a **new** migration file, not an edit to
  `00001_baseline.sql` — the issue's own implementation note suggesting an
  in-place schema edit predates CLAUDE.md's permanent incremental-migration
  policy and is superseded by it.
- Free-text format reuses the existing `Description` field — no new column.
  When `Format` is `"text"`, `Steps` is empty/ignored.
- Gherkin format adds a new `gherkin_source text` column to hold the raw
  Given/When/Then source, since it's a distinct free-form syntax from
  `Description`.
- `packages/shared/openapi.yaml`: `CaseContent` schema gains `format` and
  `gherkinSource`.
- Frontend: a format picker in the create-case flow (`CaseDrawer.tsx`);
  `StepEditor.tsx` renders only for `"steps"`; a new lightweight
  Textarea-based `GherkinEditor` component for `"gherkin"` (no new
  syntax-highlighting dependency — none exists in `apps/web` today and this
  doesn't warrant introducing one); `CaseStepsList.tsx` (read-only render)
  branches on format; `versionDiff.ts` / `ContentDiffView.tsx` gain
  format-aware diffing (today they hardcode a steps-array + scalar-field
  diff).
- Case versioning/restore (`RestoreVersion`, `NewVersion`) needs **no**
  changes — it already treats `CaseContent` as an opaque blob.
- Sample Project (`apps/api/internal/sampledata/seed.go`): add at least one
  `"text"`-format and one `"gherkin"`-format case so the showcase
  demonstrates all three formats, not just `"steps"`.
- Docs: update the case-authoring/content-model pages to describe the three
  formats.
- Out of scope (per the issue's own "considered and set aside" note): Robot
  Framework's keyword-tabular style, TestRail/Zephyr "Text" templates — both
  are close variants of the two formats being added, not additional
  first-class formats.

## Capabilities

### New Capabilities

(none — this extends the existing case-authoring model rather than
introducing a new capability domain)

### Modified Capabilities

- `test-authoring`: cases can now be authored in one of three content
  formats (structured steps, free text, or Gherkin Given/When/Then) instead
  of only structured steps.

## Impact

- **Backend**: `apps/api/internal/domain/domain.go` (`CaseContent`,
  `Validate()`), new migration file, `apps/api/internal/store/cases.go`
  (marshal/unmarshal), `apps/api/internal/server/handlers.go` (no new
  routes, existing create/edit/get case handlers already pass the whole
  blob through).
- **API contract**: `packages/shared/openapi.yaml` (`CaseContent` schema),
  `packages/shared/src/api.ts` (regenerated via `make generate`).
- **Frontend**: `CaseDrawer.tsx`, `StepEditor.tsx`, `CaseStepsList.tsx`,
  `CaseDetailPage.tsx`, `RunItemDetailPage.tsx`, `versionDiff.ts`,
  `ContentDiffView.tsx`, new `GherkinEditor.tsx`.
- **Sample data**: `apps/api/internal/sampledata/seed.go` and its test.
- **Docs**: case-authoring / content-model pages under `docs/`.
- **No breaking change**: existing cases default to `Format: "steps"` and
  are unaffected.
