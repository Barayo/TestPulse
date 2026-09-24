## Context

`.github/workflows/ci.yml` has jobs for `api` (build/vet/lint/test+coverage,
`apps/api` only), `web`, `e2e`, `helm`, `secrets` (gitleaks), `dco`, and
`migrations`. Three separate Go modules exist in this repo
(`apps/api/go.mod`, `tools/import-connector/go.mod`,
`tools/jira-connector/go.mod`, each `go 1.26.5`) but only `apps/api` is
built, tested, or linted anywhere in CI — confirmed by running
`golangci-lint run` and `go test ./...` locally against both connector
modules: both have real, passing test suites (never run in CI) and
`jira-connector` has 4 real, previously-undetected lint violations.

`govulncheck` (`golang.org/x/vuln/cmd/govulncheck@v1.8.0`) run locally
against all three modules found 7 reachable vulnerabilities in `apps/api`
alone (6 Go-stdlib issues — `net/url`, `crypto/tls`, `net/http`,
`encoding/xml`, `encoding/asn1` — all fixed by the Go 1.26.6 patch release,
plus `golang.org/x/image@v0.44.0`→`v0.45.0`, reachable via
`attachmentimage.ValidateUpload`), and overlapping stdlib issues in both
connectors. `actions/setup-go`'s `go-version-file` installs exactly the
version named in a `go.mod`'s `go` directive (a floor only if a separate
`toolchain` line exists, which none of these files have) — so CI would
install the vulnerable 1.26.5 toolchain unless the directive itself is
bumped. `Dockerfile`'s `golang:1.26-alpine` base image tag floats and will
likely already resolve to a patched 1.26.x on the next build regardless,
but CI's `go.mod`-driven toolchain selection needs the explicit bump to
actually run the scan against a patched toolchain.

## Goals / Non-Goals

**Goals:**
- Catch code-level vulnerability patterns (CodeQL) and known-vulnerable
  dependencies/stdlib reachable from actually-called code (`govulncheck`)
  before merge, across every first-party Go module and the web frontend.
- Ship the gate green: fix everything it currently finds, don't merge a
  known-red check.
- Give the two connector modules real CI coverage (build/vet/lint/test),
  since bolting vulnerability scanning onto code CI never even compiles
  doesn't hold together operationally, and — now discovered — they don't
  have any of that today.

**Non-Goals:**
- Not adding `npm audit` or an equivalent JS dependency-vulnerability
  scanner — issue #188 scopes JS coverage to CodeQL's pattern analysis;
  Dependabot already covers JS manifest-level CVEs the same way it does Go.
- Not adding these modules to local `make lint`/`make test` targets. The
  gap this closes is CI coverage specifically; extending local Makefile
  ergonomics for the connectors is a reasonable separate follow-up, not
  required to close the security-scanning gap.
- Not changing `Dockerfile`'s floating `golang:1.26-alpine` tag — it
  already self-updates on rebuild; the fix needed here is CI's explicit
  `go.mod`-driven toolchain selection, which the floating Docker tag
  doesn't affect either way.

## Decisions

**D1: Cover all 3 Go modules, not just `apps/api`.** (Already discussed and
confirmed with the user mid-implementation.) `govulncheck` and CodeQL's Go
analysis extend to `tools/import-connector` and `tools/jira-connector`;
CodeQL's javascript-typescript analysis covers `apps/web`. Closes the
zero-CI-coverage gap for the two connectors as a direct, tightly-scoped
consequence, not a separate initiative.

**D2: New `import-connector` and `jira-connector` CI jobs mirror the `api`
job's shape** (build → vet → lint → test → govulncheck), each
`working-directory`-scoped to its own module, gated
`if: github.event_name == 'pull_request'` matching the existing jobs'
convention (a push to `main` was already validated by the merging PR).

**D3: `govulncheck` runs as `go run golang.org/x/vuln/cmd/govulncheck@v1.8.0
./...`**, pinned to a specific released version rather than `@latest` —
matching this repo's existing GitHub Actions SHA-pinning discipline
(`ci.yml` pins every action to a full commit SHA with a version comment)
applied to the one non-Action tool this change introduces. A pinned
scanner version means a newly-disclosed vulnerability only starts failing
CI once the version is deliberately bumped, not silently on some unrelated
day — a predictable-failure trade-off matching how this repo already
treats every other pinned dependency.

**D4: CodeQL Go analysis uses `build-mode: manual`, not `autobuild`.**
Three independent `go.mod` files in subdirectories is exactly the shape
autobuild handles unreliably; a manual build step (`go build ./...` in
each of the three module directories, using one shared `actions/setup-go`
since all three currently pin the same Go version) is explicit and
predictable. javascript-typescript uses `build-mode: none` (source-only
analysis, no compilation needed).

**D5: CodeQL runs on `pull_request` plus a weekly `schedule`, not on every
push to `main`.** Matches `reduce-ci-actions-usage`'s cost-consciousness
(named/referenced in `ci.yml`'s own comments) — a push to `main` was
already scanned by its PR; the weekly schedule exists specifically to
catch a *newly-disclosed* vulnerability pattern against code that hasn't
changed, which a PR-only trigger would never re-check.

**D6: Fix what's found now, in this same change, rather than filing
follow-up issues.** The 4 `jira-connector` lint violations and the 7
`apps/api`-reachable vulnerabilities (plus overlapping connector ones) are
all small, mechanical, low-risk fixes (unchecked-error-return wraps, one
error-string capitalization, a two-part version bump) directly caused by
turning the gate on. Filing them separately would just mean merging a
red/failing gate now and a trivial fix PR five minutes later — no benefit,
extra process.

**D7: No GitHub Advanced Security — CodeQL's own SARIF output is parsed
directly to fail the job, instead of uploading to Code Scanning.**
Discovered mid-implementation: `codeql-action/analyze`'s default upload
step failed on the first real PR run with "Advanced Security must be
enabled for this repository" — this repo is private, and GHAS's Code
Security add-on is a paid per-active-committer product (confirmed ~$30/
committer/month as of 2026), out of budget for this project (free/
open-source tools only). This is the exact same constraint the `secrets`
job already documents and works around for GitHub's native secret
scanning, using gitleaks' own CLI instead — D7 applies the identical
pattern to CodeQL: `analyze` still runs the real analysis (`upload:
never`, `output: sarif-results`), a follow-up step parses the resulting
SARIF file(s) with a small inline Python script and `exit 1`s if any
`results` entries exist, and the SARIF is kept as a 30-day build artifact
(downloadable, openable with any free SARIF viewer) so a finding is still
inspectable — it's just not surfaced through GitHub's Code Scanning UI or
inline PR annotations. Confirmed via a live PR (#208) that the pre-GHAS
approach genuinely fails on the upload step even though the underlying
analysis itself succeeds — this isn't a workflow misconfiguration, it's a
product-tier gate.

A second, unrelated permission gap surfaced on the next PR re-run after
D7's fix: dropping the job-level `permissions:` block along with
`security-events: write` also dropped the implicit `actions: read` it
carried, and `codeql-action/analyze` calls the workflow-run API for an
unrelated file-coverage feature (restricted to default/protected branches
regardless) even when `upload: never` — failing both matrix jobs with
"Resource not accessible by integration" before ever reaching the
SARIF-parsing gate. Fixed by adding `actions: read` back to the
workflow-level `permissions:` block.

## Risks / Trade-offs

- **A future `govulncheck`/CodeQL-action bump could introduce new
  findings requiring their own fix work** → Expected and fine; that's the
  gate doing its job. Bumping either is a deliberate, reviewable act (D3),
  not a silent drift.
- **CodeQL analysis adds real CI minutes** (Go build across 3 modules +
  JS/TS analysis) → Mitigated by D5 (no push-to-main duplicate run) and
  `fail-fast: false` on the language matrix so one language's failure
  doesn't waste the other's already-spent minutes.
- **Bumping `golang.org/x/image` could theoretically change image-decoding
  behavior** → Low risk for a single patch version; `apps/api`'s existing
  `attachmentimage` test suite exercises decode paths and must stay green
  after the bump (verified as part of this change, not assumed).
- **Without GHAS (D7), a CodeQL finding has no inline PR annotation and no
  persistent dashboard** — a contributor has to notice the CI job failed
  and download the SARIF artifact to see what was found, rather than
  seeing it inline on the diff → Accepted given the budget constraint; the
  job still fails the PR either way, which is the actual thing that
  matters (a finding can't silently merge). If this project's budget or
  hosting model changes later (e.g. a future public-repo migration, where
  GHAS is free), revisiting D7 to re-enable upload is a small, easily
  reversible change — swap `upload: never` back to the default and drop
  the two SARIF-parsing/artifact steps.

## Migration Plan

No schema/data migration. Additive CI + two dependency-version bumps +
4 mechanical lint fixes. Rollback is reverting the commit; nothing this
change does is destructive or stateful.
