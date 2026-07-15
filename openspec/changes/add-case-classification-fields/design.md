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

**Non-Goals:**
- No fixed enum for `platform`/`testType` — see decision below.
- No filtering/search UI work in this change — the fields exist and are
  settable; surfacing them in the ProjectsPage/library UI is a follow-on,
  not required for the data model to land.

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

## Risks / Trade-offs

- Free-text `platform`/`testType` means no server-side validation catches
  typos ("Andriod" vs "Android") — acceptable trade-off given the
  alternative (a fixed enum) creates more friction than it prevents.

## Open Questions

None outstanding.
