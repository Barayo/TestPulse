## Why

As a C/C++ developer running Google Test (gtest) in CI, when I want to
report results into TestPulse, I want a way to attach a case key to a
test that ends up as `testpulse_case_key` (and optionally
`testpulse_platform`/`testpulse_version`/`testpulse_tags`) in a JUnit
XML report, instead of hand-rolling it.

`add-execution-import` (#38) shipped a JUnit-XML-based import endpoint;
issue #58 tracked installable plugins for the major JUnit-XML-producing
ecosystems, split into #154 (pytest, shipped), #155 (Jest, shipped),
#156 (Maven, shipped), #157 (Gradle, shipped), #169 (Go, shipped), #170
(.NET, shipped), and #171 (gtest, this change). Google Test's own
`RecordProperty()` mechanism, combined with `--gtest_output=xml`,
produces exactly the `<properties><property>` shape TestPulse's importer
already parses — confirmed against gtest's own real unittest fixture
source (its own documentation page shows a stale, incorrect example),
requiring no reflection-based post-processing at all.

## What Changes

- New public repo `Barayo/testpulse-gtest` (MIT license), a header-only
  C++ library (`testpulse::Case`/`testpulse::Attach`) distributed via
  CMake `FetchContent`, plus a separate `testpulse-gtest` submit CLI
  shipped as prebuilt release binaries.
- `testpulse::Case(caseKey, opts...)` tags a test via gtest's native
  `RecordProperty()`, writing `testpulse_case_key` and optional
  `testpulse_platform`/`testpulse_version`/`testpulse_tags` properties
  directly into the JUnit XML report `--gtest_output=xml` produces.
- `testpulse::Attach(caseKey, data, filename, contentType)` for
  screenshot/file attachments, identified via gtest's
  `current_test_info()`, matching the case-key allowlist protection
  every other plugin enforces.
- `testpulse-gtest submit` CLI: reads a JUnit XML report plus any
  collected attachments and submits them to TestPulse's import API,
  with the same config resolution (flag > env var), exit-code policy
  (201/207/error), and `--dry-run` preview already shipped identically
  across `testpulse-go`.
- This monorepo's `docs/importing-results.md` gains a "Google Test
  (gtest): `testpulse-gtest`" section.

## Capabilities

### New Capabilities
- `gtest-import-plugin`: The `testpulse-gtest` plugin's observable
  contract — the `Case`/`Attach` API's role and identification
  mechanism, the CLI's exit-code/config/dry-run behavior, and the
  property-name contract it writes into JUnit XML.

### Modified Capabilities
(none — this is a new, standalone capability; `execution-import`'s own
contract is unchanged)

## Impact

- New standalone public repo (`Barayo/testpulse-gtest`), not part of
  this monorepo's build or deploy surface.
- `docs/importing-results.md` and `docs/README.md` (index line) in this
  monorepo.
- No changes to `packages/shared/openapi.yaml`, no new API endpoints, no
  UI, no seed data — client-tooling only, consuming the existing
  `execution-import` contract as-is.
