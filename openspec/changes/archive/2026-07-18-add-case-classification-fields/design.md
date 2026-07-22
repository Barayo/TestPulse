## Context

Split out from `add-execution-import` deliberately: platform/test-type/
automated describe how a case is *authored and classified*, not
something a particular execution or import produces — a hand-curated
case benefits from these exactly as much as an imported one, and none of
this needs the import pipeline to exist first.

## Goals / Non-Goals

**Goals:**
- Record platform, test type, and automated/manual status per case,
  optionally, without disrupting any existing case-authoring flow.
- Make all three fields — and `priority`/`tags`, which already existed
  with no UI at all — actually settable from `CaseDrawer.tsx`, not just
  from direct API calls.

**Non-Goals:**
- No fixed enum for `platform`/`testType` — see decision below.
- No filtering/search UI work (ProjectsPage/library filtering by these
  fields) in this change — only the authoring drawer. Filtering is a
  follow-on once real usage data exists to filter by.
- No UI for `description`/`expectedResult` (case-level, not per-step) —
  out of scope here; the edit path now preserves them instead of
  wiping them, but doesn't expose controls for them.

## Decisions

**`platform` and `testType`: free text, not enums.** `priority` is the
one existing enum on `CaseContent`, and it works because "low/medium/
high/critical" is genuinely universal. Platform and test-type taxonomies
aren't — "web/iOS/Android/API" versus "unit/integration/e2e/contract"
varies enough between teams that a fixed list would mean either
constant migrations to add values or teams contorting their taxonomy to
fit ours. Free text now; if a pattern of real values emerges later, a
UI-level autocomplete-from-previously-used-values is a much cheaper
addition than a schema-level enum would be to walk back.

**`automated`: boolean, defaults to `false`.** Every case in TestPulse
today is implicitly manual (no import pipeline exists yet at the time
this lands, depending on sequencing) — defaulting to `false` reflects
that honestly rather than guessing.

**UI scope expanded to cover `priority`/`tags` too, not just the three
new fields.** Discovered while implementing: `CaseDrawer.tsx` never had
controls for `priority` or `tags` either — they were set-once-via-API-
then-frozen in practice. Adding UI for only the three new fields would
have left five conceptually-identical "case classification" fields in
two different states (three editable, two still API-only) for no
principled reason. One drawer redesign covering all five is simpler for
users and for the codebase than doing this twice.

**Tags as a comma-separated text input, not a chip/pill editor.** No
tag-editing UI exists anywhere else in the app to extend or mirror, and
a full chip editor (add/remove pills, keyboard nav) is real added
complexity `tags` hasn't earned yet — it's an unstructured `text[]` with
no validation today. A single text field split on `,` and trimmed is the
smallest thing that works; a richer editor is easy to swap in later
since the underlying data shape doesn't change.

**Priority as a native `<select>`, not the `Select` component in
`components/ui/select.tsx`.** That Radix-based component exists but is
unused anywhere in the app yet, so there's no established pattern for
testing it in this codebase's Vitest/RTL setup (Radix Select needs
`hasPointerCapture`/`scrollIntoView` polyfills to render in jsdom that
nothing here currently provides). `priority` has exactly four fixed
values — a native `<select>` needs none of that machinery and is exactly
as accessible. Worth revisiting once a first real use of the styled
`Select` establishes the testing pattern.

**Editing now preserves `description`/`expectedResult` instead of
wiping them.** `PUT /api/v1/cases/{id}` replaces a case's entire content
(D1: immutable versioning) — it was never partial-update semantics. The
UI's edit path only ever sent `{title, steps}`, so every UI-driven edit
silently reset `priority` to `medium` and cleared `tags`/`description`/
`expectedResult`, even though the API itself was never broken. Fixing
the round-trip for the five classification fields makes this bug worse
unless `description`/`expectedResult` are fixed too — so `saveCaseEdit`
now starts from the case's current `content` and overrides only the
fields the drawer actually edits.

## Risks / Trade-offs

- Free-text `platform`/`testType` means no server-side validation catches
  typos ("Andriod" vs "Android") — acceptable trade-off given the
  alternative (a fixed enum) creates more friction than it prevents.
- Comma-separated tags means a tag containing a literal comma isn't
  representable — acceptable given tags are short keywords in practice
  ("smoke", "regression"), not free sentences.

## Open Questions

None outstanding.
