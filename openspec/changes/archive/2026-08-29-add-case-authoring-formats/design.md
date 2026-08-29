## Context

`CaseContent` (`apps/api/internal/domain/domain.go:81-107`) has exactly one
shape today: `Title`, `Description`, `Steps []Step` (`Action`+`Expected`),
`ExpectedResult`, plus classification fields (`Priority`, `Tags`,
`Platform`, `TestType`, `Automated`, `CustomFields`). It's stored on
`test_case_versions` as normalized columns (`steps jsonb`, everything else
plain columns) — see `00001_baseline.sql:178-196`. Case versioning
(`RestoreVersion` in `service.go:444-465`, `NewVersion` in
`store/cases.go`) treats the whole struct as an opaque blob, so it needs no
changes for this work.

GH issue #3 asks for two more first-class authoring formats: free-text
(for exploratory/manual testers) and Gherkin Given/When/Then (a natural fit
since TestPulse's own OpenSpec practice already treats WHEN/THEN as its BDD
contract, per CLAUDE.md).

## Goals / Non-Goals

**Goals:**
- Let a case be authored as structured steps (existing/default), free text,
  or Gherkin — chosen at creation, changeable later.
- Keep the change additive and non-breaking: every existing case is
  `Format: "steps"` and renders/diffs exactly as it does today.
- Keep versioning/restore untouched — content stays an opaque blob there.

**Non-Goals:**
- Robot Framework keyword-tabular style, TestRail/Zephyr "Text" templates
  (per the issue: variants of the two new formats, not additional formats).
- Gherkin syntax highlighting, autocomplete, or step-definition linking —
  it's a plain-text `Given/When/Then` editor with line placeholders, not an
  IDE feature.
- Converting between formats on an existing case (e.g. steps → gherkin)
  — switching format on an already-authored case starts that case's content
  fresh in the new format; no auto-transform.

## Decisions

**`Format` lives on `CaseContent`, as a sibling of `Steps`/`Description`,
not nested inside a wrapper type.**
Alternative considered: a tagged-union Go type (`type Content interface{}`
with `StepsContent`/`TextContent`/`GherkinContent` implementations). Rejected
— `CaseContent` is already a flat struct serialized directly to/from JSON
and DB columns throughout the codebase (handlers, store, sampledata, tests);
introducing a real discriminated union would touch every call site for
marginal type safety. A `Format Format` string field plus "the other fields
mean something different depending on Format" mirrors the existing
`Priority` precedent (a validated string enum) and is the smallest change
consistent with the current data shape.

**Free text reuses `Description`; Gherkin gets a new `GherkinSource`
field/column — not a shared "content blob" field.**
`Description` already exists and is free text today (used as a summary
even on `"steps"`-format cases), so `"text"`-format cases just mean "author
puts the full test narrative in `Description`, `Steps` stays empty." Gherkin
needs its own field because `Description` and Gherkin source are
semantically different (a human summary vs. a parseable
Given/When/Then block) and both should be independently readable — a case
should be able to keep a short `Description` even when `Format` is
`"gherkin"`.

**New migration file, not an in-place edit to `00001_baseline.sql`.**
The issue's own "Implementation note" says this "likely lands as an
addition to `add-core-domain`'s existing schema rather than a new change,"
reasoning from a pre-1.0 "migrations amended in place" model. That model
was reversed (`reinstate-incremental-migrations`, 2026-08-16) specifically
because of a production incident from editing a shipped migration in
place — CLAUDE.md now states this is a **permanent** policy enforced by a
CI gate, with no pre-1.0 exception. This design supersedes the issue's own
note: `00010_case_content_format.sql` adds `format text NOT NULL DEFAULT
'steps' CHECK (format IN ('steps','text','gherkin'))` and `gherkin_source
text NOT NULL DEFAULT ''` to `test_case_versions`.

**Format is chosen at case creation and is changeable via edit, not
locked in.**
`CaseDrawer.tsx`'s create flow gets a 3-way format picker up front (mirrors
how `Priority`/`TestType` are already picked at creation). `CaseDetailPage`'s
edit-in-place flow allows changing `Format` later — switching format doesn't
auto-migrate content between shapes (see Non-Goals); the UI clears/hides
the fields that no longer apply for the new format.

**Frontend rendering/diffing branches on `format`, no shared abstraction
introduced.**
`CaseStepsList.tsx` (read-only), `versionDiff.ts`, and `ContentDiffView.tsx`
each get a format switch (steps-list / text-block / gherkin-block) rather
than a new polymorphic "content renderer" abstraction — three call sites
with a switch statement is simpler than a plugin-style renderer registry
for three fixed, known formats.

## Risks / Trade-offs

- **Frontend diff complexity** → `versionDiff.ts`'s `SCALAR_FIELDS` list and
  step-array diff are hardcoded today; adding format-aware branching risks
  missing a diff case (e.g. a version that changed *both* format and
  content). Mitigation: test the "format changed between versions" diff
  case explicitly, in addition to the three same-format diff cases.
- **Switching format loses content** → an author who switches an
  established case from `"steps"` to `"gherkin"` loses their step list from
  the active editor view (though prior versions still have it, via existing
  version history). Mitigation: confirm-before-switch UI prompt when the
  case already has non-empty content in the format being abandoned.
- **Sample Project drift** → CLAUDE.md's standing rule requires `seed.go`
  to showcase this; skipping it would silently make the showroom stale
  again (as already happened once this session with project tags).
  Mitigation: tasks.md includes an explicit seed.go task, not a trailing
  catch-all.

## Migration Plan

Additive migration (`00010_case_content_format.sql`), default-backfilled
(`DEFAULT 'steps'`) so existing rows need no data migration. No rollback
concerns beyond the standard migration-policy escape hatches already
documented in CLAUDE.md (`TESTPULSE_ALLOW_MISSING_MIGRATIONS`); this change
doesn't touch that mechanism.

## Open Questions

None outstanding — scope, storage shape, and frontend approach are settled
above.
