## Context

`add-execution-import` (#38) shipped `POST
/api/v1/projects/{projectKey}/imports`, matching `<testcase>` entries in a
JUnit XML report to existing cases by a `testpulse_case_key` `<property>`.
Issue #58 tracked installable plugins for the major JUnit-XML-producing
ecosystems; it was split into #154 (pytest, shipped), #155 (npm/Jest,
shipped), #156 (Maven, shipped), #157 (Gradle, shipped), #169 (Go, this
change).

Go's standard `testing` package has no native JUnit XML output at all, and
until recently had no annotation/decorator/`record_property()`-equivalent
mechanism either — every prior plugin either reused an existing
annotation-style hook (`@TestPulse` via reflection for Maven/Gradle,
`record_property()` for pytest) or a framework-native property hook (Jest).
Go 1.25 (Aug 2025) changed this: it added a stable, GA `t.Attr(key, value
string)` method (also `B.Attr`/`F.Attr`) to the `testing` package, which
emits a structured `attr` action in `go test -json` output (confirmed via
[go.dev/doc/go1.25](https://go.dev/doc/go1.25)). `gotestsum` — the de
facto standard tool for converting `go test -json` into JUnit XML, since
no official stdlib writer exists — added native support for converting
`t.Attr` calls into `<properties>` as of v1.13.0 (Sep 2025), confirmed by
reading gotestsum's own source (`internal/junitxml/report.go`'s
`newJUnitTestCase`/`encodeAttributes`, and `testjson/execution.go`'s
`ActionAttr` handling of `T.Attr`).

This makes the Go plugin's mechanism materially simpler than every prior
plugin: there is no reflection-based XML post-processing step, because
`gotestsum` already writes correct `<properties>` directly once `t.Attr`
is called. The plugin's job narrows to (1) a thin tagging API and (2) a
submit CLI — it does not generate or rewrite any report.

## Goals / Non-Goals

**Goals:**
- A native, zero-reflection tagging mechanism (`t.Attr` under the hood),
  taking advantage of the fact that `Case`/`Attach` receive the actual
  `*testing.T` of the currently-running test directly — no `StackWalker`
  or annotation-scanning equivalent is needed at all.
- Reuse `gotestsum`'s existing, already-correct JUnit XML writer rather
  than building a second one.
- Screenshot/file attachments in v1, matching the more recent Jest/Gradle
  plugins rather than Maven's earlier deferral.
- A `--dry-run` preview, matching the parity already established by
  `testpulse-jest`/`testpulse-gradle-plugin`.

**Non-Goals (v1):**
- Benchmarks (`*testing.B`) and fuzz targets (`*testing.F`) — regular
  `*testing.T` tests only, the same "don't chase every variant" scoping
  already applied to JUnit 4/5-only in the Java plugins.
- Support for Go versions before 1.25 — no fallback log-parsing
  convention. Adding one would reintroduce exactly the kind of hack `t.Attr`
  was built to replace, and would mean maintaining two code paths for a
  problem the standard library now solves natively.
- A build-file config tier — Go has no `pom.xml`/`build.gradle`-equivalent
  convention to hang plugin configuration off of; inventing one (e.g. a
  bespoke `.testpulse.yaml`) would be scope creep not grounded in an
  existing ecosystem convention.
- Reimplementing JUnit XML generation — always delegated to `gotestsum`.

## Decisions

### Repo & packaging
New public repo `Barayo/testpulse-go`, MIT license, Go module
`github.com/Barayo/testpulse-go`, `go.mod` declaring `go 1.25` as a hard
floor (`t.Attr` does not exist before it). No package registry — Go
modules are consumed directly via `go get`/`go install` against tagged
releases.

### Tagging API: `testpulse.Case`, backed directly by `t.Attr`
```go
func Case(t *testing.T, caseKey string, opts ...Option)

func WithPlatform(platform string) Option
func WithVersion(version string) Option
func WithTags(tags ...string) Option
```
`Case` calls `t.Attr("testpulse_case_key", caseKey)`, and
`t.Attr("testpulse_platform", ...)`/`testpulse_version`/`testpulse_tags`
only for whichever options were supplied — matching the "record only
supplied metadata" behavior already shipped in all three prior plugins.
Scoped to `*testing.T` only (not `*testing.B`/`*testing.F`). No XML
rewriting happens in this plugin at all: once `t.Attr` is called, a
`gotestsum --junitfile=...` run downstream already produces the correct
`<properties>` block — confirmed by reading gotestsum's source, not
assumed. README documents the expected user workflow explicitly:
```
gotestsum --junitfile=report.xml -- ./...
testpulse-go submit --file report.xml
```

### Attachments: no reflection needed, since `*testing.T` is already in hand
```go
func Attach(t *testing.T, caseKey string, data []byte, filename, contentType string) error
```
`caseKey` is an explicit parameter, not inferred — matching the Gradle
plugin's `attach(caseKey, bytes, filename, contentType)` shape (adapted to
Go's idiom of putting `t` first), so a test that has declared more than
one case key via `Case` can unambiguously say which attachment belongs to
which. (An earlier draft of this design omitted `caseKey` from the
signature entirely, which made the allowlist check and `submit`'s
per-case-key grouping impossible to actually implement — caught in gating
review before implementation started.)

Every prior plugin's attachment mechanism had to solve "which test is
this attachment for?" without a direct handle to the running test:
Jest derived identity from the test framework's own guaranteed-unique
test name; Gradle's reflection-only architecture (which deliberately
avoids any JUnit-version-specific hook) had to use `StackWalker` to infer
the calling class, then allowlist against that class's own annotated case
keys. Go's `Attach(t, ...)` sidesteps this class of problem entirely: the
caller already has the literal `*testing.T` of the test that's currently
running, passed as an explicit argument — there is no "currently running
test" ambiguity to resolve via reflection or stack inspection.

This still needs the same two protections Luis's Gradle-plugin review
established as necessary, adapted to the simpler mechanism, plus a third
correctness fix Luis's review of *this* design caught before
implementation:
1. **Same-test case-key allowlist, closing cross-test misattribution.**
   A package-level, process-local `map[string][]string` keyed by
   `t.Name()` is populated by each `Case(t, caseKey, ...)` call. `Attach`
   looks up the *same* `t.Name()` and rejects (returns an error) unless
   the passed `caseKey` is in that test's own declared set — the same
   protection the Gradle plugin's class-level allowlist provides, scoped
   to the individual test instead of the class, since Go has no class
   grouping to allowlist against.
2. **Invocation-unique filenames, closing a collision/race.** Table-driven
   subtests (`t.Run`) can legitimately call `Attach` multiple times under
   one case key, and Go tests can run in parallel (`t.Parallel()`) —
   the same routine-multiple-calls-under-one-key and concurrent-write-race
   conditions the Gradle plugin's `maxParallelForks` analysis found.
   Sidecar filenames are `hash(caseKey + a UUID generated fresh inside
   each Attach() call)`, never `hash(caseKey)` alone. `submit` groups
   multiple attachments per case key rather than assuming a 1:1 mapping.
3. **The allowlist map is guarded by a mutex, and subtests must
   re-declare their own case key.** `t.Parallel()` subtests genuinely run
   concurrently on separate goroutines; an unsynchronized Go map under
   concurrent writes (or a concurrent write racing a read) is not merely
   a data race but an unrecoverable process crash
   (`fatal error: concurrent map writes`), not a `panic` catchable by
   `recover()` — and this exact scenario (`t.Parallel()`) is the one
   invocation-unique filenames above were already justified by, so the
   design has to actually hold up under it. The map is a `sync.Map` (or a
   plain map behind a `sync.Mutex`), not a bare map.

   Separately: `t.Run("sub", …)` produces a *new* `*testing.T` whose
   `Name()` is `"Parent/sub"`, not `"Parent"` — a different key in the
   allowlist map. This design deliberately keeps the map's lookup as an
   **exact match on `t.Name()`**, not a `"Parent/"`-prefix walk up to an
   ancestor: prefix-matching would let a subtest reach a case key it never
   declared itself, reintroducing exactly the coarser, class-shaped
   (here, "test family"-shaped) misattribution boundary this design's
   whole premise is to close relative to Gradle's per-class allowlist. The
   consequence is explicit and must be documented in the README and
   demonstrated by a test, not left implicit: **each subtest that calls
   `Attach` must call `Case` again with its own `t`** (i.e. `Case(t,
   "LOGIN-42")` inside the `t.Run(...)` closure, using the subtest's `t`,
   not only once in the parent). A parent-declares/subtest-attaches
   pattern without that per-subtest re-declaration is expected to be
   rejected, and is covered by an explicit test (not just the
   accepting case), so this isn't discovered as a surprise after
   shipping.

Storage is a `.testpulse/` scratch directory via real disk I/O — the test
binary process (`go test`, wrapped by `gotestsum`) and the later
`testpulse-go submit` CLI invocation are separate processes, the same
cross-process boundary problem Jest and Gradle both solved with an
on-disk scratch dir. Only `image/png`, `image/jpeg`, `image/webp` content
types are accepted, validated before any write — same allow-list as every
other plugin.

### Submit CLI
Single binary `testpulse-go`, one subcommand:
```
testpulse-go submit --file <path-to-junit-xml> [--dry-run] [--fail-on-unmatched]
```
Reads the `gotestsum`-produced JUnit XML plus the `.testpulse/` scratch
directory, `POST`s to `/api/v1/projects/{projectKey}/imports`, and applies
the same 201/207/error policy validated in all three prior plugins:

| Response | Behavior |
|---|---|
| `201` all matched | exit 0; summary printed |
| `207` some unmatched | exit 0 by default (message lists unmatched keys, points at `--fail-on-unmatched`); exit nonzero if `--fail-on-unmatched` is set |
| network/auth/4xx/5xx error | always exits nonzero, unconditionally |

`--dry-run` performs a read-only `GET /api/v1/projects/{projectKey}/cases`
preview instead of submitting, matching testpulse-jest's/
testpulse-gradle-plugin's parity — never affects the exit code beyond the
preview's own success/failure to fetch.

### Config: flag, then env var — deliberately two tiers, not three
| Setting | Flag | Env var |
|---|---|---|
| API base URL | `--url` | `TESTPULSE_URL` |
| API token | `--token` | `TESTPULSE_TOKEN` |
| Project key | `--project` | `TESTPULSE_PROJECT` |
| Fail on unmatched | `--fail-on-unmatched` | `TESTPULSE_FAIL_ON_UNMATCHED` |

Flag overrides env var. There is deliberately no third, build-file-backed
tier the way Maven has `<configuration>`, Gradle has the `testpulse { }`
extension DSL, and pytest has ini-options — Go has no equivalent
convention to hang configuration off of, and a bespoke `.testpulse.yaml`
would be new surface not grounded in how Go CLIs conventionally take
config. The resolved token is never printed, at any verbosity level —
same discipline carried over from every prior plugin.

### Testing approach (TDD)
Table-driven Go unit tests (`testing` + `httptest` for HTTP mocking) cover
`Case`/`Attach`'s logic (including the same-test allowlist rejection) and
the `submit` command's config-resolution/exit-code branches in isolation
— the direct Go-ecosystem equivalent of the isolated-fixture unit testing
`maven-invoker-plugin`/Gradle TestKit/pytester provide for the other
plugins. A smaller number of real end-to-end tests shell out to an actual
`gotestsum --junitfile=...` run against small fixture Go packages under
`testdata/`, proving `t.Attr` calls genuinely flow through to
`<properties>` in gotestsum's real output — not asserting against a
hand-constructed XML string — mirroring the real TestKit-driven/
pytester-driven end-to-end tests in the Gradle/pytest designs. Includes a
real test proving `Attach` rejects a case key that belongs to a different
test, a real test proving concurrent `Case`/`Attach` calls from
`t.Parallel()` subtests don't crash the process (run under `go test
-race`, not just a plain run — a data race can pass without `-race` and
still be a real bug), and a real test proving a subtest that calls
`Attach` without first calling `Case` on its own `t` is rejected, not
silently accepted via its parent's declaration.

### CI / publishing
- GitHub Actions: `go build` + `go test -race ./...` + coverage on every
  PR — `-race` specifically to catch any regression in the allowlist
  map's concurrency safety, not just a plain `go test`.
- Release: versioning/tagging/changelog/GitHub-release only, via
  `@semantic-release/github` — no registry-publish step at all, since Go
  modules are consumed directly from tagged source via `go get`/`go
  install`. This is a genuinely simpler release pipeline than every other
  plugin this session (no npm/PyPI/Maven-Central-equivalent bootstrap or
  OIDC/API-key setup needed) — noted explicitly here as a real contrast,
  not an oversight matching the other plugins' `release.yml`.
- README: install (`go get github.com/Barayo/testpulse-go`), the `Case`/
  `Attach` API reference, the required `gotestsum --junitfile=...`
  workflow step, config-precedence table, exit-code table, dry-run, the Go
  1.25 floor stated prominently near the top.

## Risks / Trade-offs

- **Subtests must re-declare their own case key via `Case` before calling
  `Attach`, even if a parent test already declared one** — a real
  usability cost of keeping the allowlist an exact match on `t.Name()`
  rather than an ancestor-aware prefix match. Accepted deliberately (see
  Decisions above): a prefix match would let a subtest reach a case key it
  never itself declared, reopening the coarser misattribution boundary
  this design exists to close. Must be documented prominently in the
  README example, not left for users to discover via a confusing
  rejection error.
- **Hard Go 1.25+ floor excludes projects on older Go versions** — a real
  chunk of active Go codebases will lag behind for a while, since Go
  1.25 shipped Aug 2025. Accepted deliberately (see Non-Goals) rather than
  reintroducing a log-parsing fallback; a future change can reconsider
  this once the ecosystem has had more time to upgrade, but should not
  pre-emptively add the complexity of two mechanisms now.
- **Hard dependency on `gotestsum`** for anyone who wants JUnit XML at
  all — if a project already has a different `go test -json` consumer, it
  would need to add `gotestsum` alongside it. Accepted because there is no
  official alternative, and building a second JUnit XML writer would be
  the specific kind of duplication this design avoids elsewhere.
- **Process-local attachment allowlist does not survive across separate
  `go test` invocations** (e.g. running one package at a time in CI,
  each a fresh process) — each invocation's `Case`/`Attach` calls are only
  checked against that invocation's own in-memory map, which is
  correct within a single `go test` process but means the allowlist
  provides no protection across packages run as genuinely separate
  processes. This mirrors Gradle's own per-subproject scoping (each
  subproject's checks are already independent), not a new gap.
- **Coupling to gotestsum's own JUnit XML schema and `Attributes`
  behavior**, which (like Surefire's and Gradle's) has no formal
  versioned contract — mitigated by pinning a minimum `gotestsum` version
  (v1.13.0+) in documentation and targeting the long-stable subset
  (`<testcase classname name>`, `<properties><property name value>`),
  same mitigation already accepted for the other JVM-XML-producing
  plugins.

## Open Questions

None outstanding.
