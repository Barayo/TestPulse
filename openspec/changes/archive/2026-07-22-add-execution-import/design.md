## Context

This is the first of a planned family of importer epics (JUnit-XML now;
a pytest plugin, Maven/Gradle, Go, npm/Jest later — see the session's
design discussion for the full sequencing rationale). Scoped tightly here:
match-only import of one format, no auto-creation, no plugin yet.

## Goals / Non-Goals

**Goals:**
- A CI job can report real results against pre-existing TestPulse cases
  without any manual UI interaction.
- An unmatched test never blocks the import and never silently creates
  case-library data — it's reported back, not acted on.
- The transport (JUnit XML) covers pytest, Maven Surefire, Gradle, and
  Jest-via-`jest-junit` from a single parser.

**Non-Goals (deliberately deferred):**
- Auto-creating cases from unmatched tests — see backlog #34; a
  different product surface, not a flag on this one.
- A pytest plugin — V1 ships as a `conftest.py` snippet using pytest's
  own `record_property()` + `--junitxml`; no new package to build,
  publish, or version yet.
- Any format other than JUnit XML.
- Retry/flaky-test semantics, re-running, or de-duplicating repeated CI
  runs of the same suite — every import is a new run, same as a human
  clicking "New run" today.

## Decisions

**Match by the case's existing `key`, not a new `externalId` field.** An
earlier draft of this design added a dedicated `externalId` field to
`TestCase` so a human had *something* typeable to paste into
`record_property()` — pre-keys, the only stable identifier was a raw
UUID, unfit for hand-editing pytest source. `add-human-readable-keys`
shipped first specifically to close that gap: every case already carries
an immutable, human-readable `key` (e.g. `LOGIN-42`), scoped to its
project (see `resource-keys`). Reusing it here means one fewer field to
add, nothing new for a user to set or keep in sync with the case it
identifies, and no possibility of an `externalId` drifting out of sync
with the case it's meant to point at — the `key` is already guaranteed
present, unique per project, and immutable for every case.

**Case-key transport: JUnit XML's `<properties>` element, not the
test name.** pytest's `record_property(key, value)` serializes into
`<testcase>`'s `<properties><property name="key" value="value"/></properties>`
when combined with `--junitxml`. The importer reads
`property[name="testpulse_case_key"]` per `<testcase>` and matches its
value against `TestCase.Key` within the target project. This is why no
custom pytest plugin is needed for V1 — `record_property` and
`--junitxml` are both pytest built-ins; only a few lines of `conftest.py`
(reading a custom marker, calling `record_property`) are needed, which
ships as documentation, not a package.

**Request shape: JSON envelope wrapping the report, not raw XML body.**
`POST /api/v1/projects/{projectKey}/imports` with
`{ format: "junit-xml", name?: string, report: string }`. Every other
endpoint in this API is JSON; keeping the request `Content-Type` uniform
avoids new body-parsing middleware and keeps `format` available as an
extension point for future transports (native JSON, TAP, …) without a
new endpoint. `name` is optional — defaults to the XML's own
`<testsuites>`/`<testsuite name="…">` if present, else
`"Imported run — <timestamp>"`.

**Verdict mapping from JUnit XML:**
| JUnit XML | TestPulse verdict | Rationale |
|---|---|---|
| no child element (passed) | `pass` | |
| `<failure>` | `failed` | assertion failed |
| `<error>` | `blocked` | something prevented normal execution, not the assertion itself |
| `<skipped>` | `skipped` | |

**Match-only, atomic per import.** The whole import (parse → match →
create run → add items → record results) happens in one transaction.
Partial failure inside that pipeline (not "some tests unmatched," but a
genuine error — malformed XML, project not found) is a `400`, same as
every other validation error in this API. "Some tests unmatched" is not
a failure mode at all — it's the expected `207` path.

**Response contract:**
| Outcome | Status | Body |
|---|---|---|
| Every `<testcase>` matched an existing case | `201 Created` | `{ run: {...} }` — identical shape to the existing `createRun` response |
| Some or all unmatched, run still created with whatever matched | `207 Multi-Status` | `{ run: {...}, message: "Success but unmatched cases ignored", matched: N, unmatched: [{ caseKey, verdict }] }` |
| Malformed report / project not found | `400` | existing `ValidationError` shape |

`207` was chosen deliberately over inventing a non-standard code: it's a
real, standardized status (RFC 4918, batch/bulk-operation precedent in
APIs like Elasticsearch's bulk endpoint) that stays in the 2xx range, so
naive tooling checking `response.ok`/`status < 300` still treats it as
success without special-casing, while still being distinguishable from a
clean `201` for tooling that wants to surface the warning.

**No extra uniqueness enforcement needed for matching** — a case `key` is
already guaranteed unique per project at the database level (see
`resource-keys`), so unlike the earlier `externalId` draft there's no new
"two cases could claim the same identifier" case to reason about at
import time.

**Execution metadata: `RunItem` gains `testName`; `Result` gains
`startTime`, `endTime`, `platform`, `version`, `tags` — all optional.**
These describe a specific *execution instance*, not the case being
tested, so they live on the append-only `Result` log (where a retry
naturally gets its own timing/platform/version) except `testName`, which
is stable per match and belongs on `RunItem` instead:
- `testName` (RunItem) — the literal name the external runner reported
  (e.g. pytest's node id, `tests/test_foo.py::test_bar`), kept alongside
  the matched case's curated title rather than replacing it. Useful when
  a case's title has been renamed/cleaned up by a human but you still
  want to see exactly what the runner called it, and essential once
  parametrized tests are in play (many runner-level names could map to
  one case).
- `startTime`/`endTime` (Result) — derived from JUnit XML's own
  `timestamp` (on `<testsuite>`) and `time` (duration, on `<testcase>`)
  attributes, not a custom property. Best-effort: precision depends on
  whether the reporting tool actually populates per-suite timestamps: if
  it does, per-test start time is the running cumulative offset; if not,
  both fields are omitted rather than guessed.
- `platform`, `version`, `tags` (Result) — extend the same
  `<properties>` mechanism as the case key: `testpulse_platform`,
  `testpulse_version`, `testpulse_tags` custom properties, written by
  the same `conftest.py` snippet via `record_property()`. All optional;
  a report without them just omits those fields on the created result.
- `NewResult`'s schema (already used by the existing manual
  "record a verdict" UI action) gains these same optional fields rather
  than introducing an import-only schema — a human recording a manual
  result can also note platform/version if they want to, for free.

Case-level classification fields (Platform, Test Type, Automated) are
explicitly out of scope here — see the companion change
`add-case-classification-fields` (separate proposal): they describe how
a case is authored, independent of any particular execution or import.

## Risks / Trade-offs

- **Every unmatched test on every CI run generates a `207` with a full
  unmatched list** until a team's suite is fully annotated — noisy at
  first, but that noise is the point (visible, not silently dropped).
- **JUnit XML's `<properties>` mechanism is pytest-specific in how it
  gets populated**, even though the XML format itself is shared — Maven/
  Gradle will need their own answer for "how does the case key get into
  the XML" when those land (Surefire doesn't have an equivalent to
  `record_property` out of the box); flagged for whichever change tackles
  Maven, not solved here.

## Open Questions

None outstanding — this was worked through in full before writing this
document.
