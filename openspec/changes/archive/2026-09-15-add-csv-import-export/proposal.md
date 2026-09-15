## Why

As a QA lead with an existing spreadsheet or another tool's export, when I want to bring my cases into TestPulse — or pull my data back out for a report or a migration — I want a generic CSV import and export, so I'm not locked out of, or into, the tool. Import today is JUnit-XML only and match-only (it maps *results* onto already-existing cases by key; it can never create a case). There is no CSV import at all, and no export of any kind anywhere in the codebase. Unlike the TestRail/Qase importers (`add-testrail-importer`, `add-qase-importer`), this isn't vendor-specific: a CSV round-trip is the lowest-common-denominator migration path every competing tool supports, regardless of what a team is coming from — or going to.

## What Changes

- Add `POST /projects/{projectKey}/cases/import-csv` — a synchronous, in-process multipart file upload (no external vendor to poll, so none of `tools/import-connector`'s async job machinery applies here) that parses a CSV, creates one TestPulse case per row in a target folder, and returns a report naming every row that failed to import and why. Never silently drops a row.
- Add `GET /projects/{projectKey}/cases/export-csv` (optionally scoped to a folder) — streams a CSV of the folder's/project's current cases in the same column shape import accepts, so a round-trip (export → edit → re-import) is possible.
- Fixed core CSV columns (`Title` required, `Description`, `Expected Result`, `Priority`, `Tags`, `Platform`, `Test Type`, `Automated`) matching `CaseContent`'s existing fields; any other column header is treated as a project custom field, created as `text` type on first encounter if it doesn't already exist.
- A "+ New project" and Library-level "Import from CSV" entry point, plus an "Export" action on the Library/folder view — both new, small UI surfaces (Pepe design pass required before implementation, per standing practice).
- **Non-goals for this version, called out explicitly**: structured multi-step cases (a CSV row's one-to-many relationship to steps isn't natively representable without a much more complex encoding most spreadsheet sources don't have anyway — cases import with `expectedResult` only, no `steps`), run/result export (a distinct reporting use case, tracked separately if it turns out to matter), matching/updating existing cases by key (import always creates new cases — no merge semantics), and Excel/`.xlsx` (every competitor's CSV export already covers the actual migration need; `.xlsx` is a low-risk, separable follow-up once the CSV column-mapping/case-creation logic is proven).

## Capabilities

### New Capabilities
- `csv-case-import-export`: creating TestPulse cases in bulk from an uploaded CSV file, and exporting a project's or folder's cases back out to the same CSV shape.

### Modified Capabilities
(none — the existing JUnit-XML result-import endpoint and its `internal/junitxml` package are untouched; this is an entirely separate endpoint and code path, not an extension of it.)

## Impact

- **Affected code**: new `apps/api/internal/csvcases` package (parse/validate/map CSV rows, and the reverse case-to-row serialization), new handlers in `apps/api/internal/server`, `Service` methods for import/export, `packages/shared/openapi.yaml` (two new endpoints), new `apps/web` entry points (Library toolbar "Export", a CSV variant of the existing "+ New project"/"Import from…" menu or a Library-level "Import cases" action — exact placement decided during the Pepe UX pass).
- **Not affected**: `tools/import-connector` (no new source — this never leaves `apps/api`, there's no external vendor), `internal/junitxml`/execution-result import (untouched, separate feature).
- **Dependencies**: none new — Go's standard `encoding/csv` covers parsing/writing; no third-party CSV library needed.
- **Sample Project**: `seed.go` gets a small CSV fixture case (or the showroom simply demonstrates the "Export" action against its existing seeded cases) — unlike the vendor importers, there's no "no live external account to connect to" excuse here; a CSV round-trip is fully self-contained and seedable.
