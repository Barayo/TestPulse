## Context

Issue #195 found two separate risk areas while brainstorming the TestRail
importer: (1) trademark/naming risk when a tool or doc names a third-party
vendor, and (2) dependency license compatibility with TestPulse's own
AGPL-3.0-only license. A same-session, one-off check at the time found no
disallowed licenses and designed the TestRail fix (generic tool name +
disclaimer), but explicitly flagged this as "not the kind of systematic,
periodic review a growing set of third-party integrations warrants."

Re-checking the current repo (not trusting the issue's point-in-time
findings) shows the practice born from that TestRail fix was in fact
applied consistently to every importer shipped since: TestRail, Qase,
Zephyr Scale, Kiwi TCMS, Tuskr, and Xray (`docs/integrations.md`) all carry
a non-affiliation disclaimer and live inside the vendor-agnostic
`tools/import-connector` binary. The one exception is the Jira connector —
the project's first integration, shipped before this pattern existed, and
never revisited. Its *public* artifact names already lead with `testpulse-`
(Docker image `ghcr.io/barayo/testpulse-jira-connector`, Helm chart
`repository: ghcr.io/barayo/testpulse-jira-connector`), which already
satisfies Atlassian's "OurBrand for Jira" ordering requirement (confirmed
against Atlassian's live, published trademark policy via WebFetch) — only
the disclaimer text is actually missing, not a renaming.

A fresh `find` across the repo confirms no `NOTICE` or
`THIRD-PARTY-LICENSES` file exists, and reading `.github/workflows/ci.yml`
confirms there is no license-scanning step today — only CodeQL and
govulncheck, documented in the `ci-security-scanning` capability.

## Goals / Non-Goals

**Goals:**
- Close the one remaining trademark-disclaimer gap (Jira connector).
- Produce a real, current `THIRD-PARTY-LICENSES` file from the full
  present-day dependency tree, not a stale copy of the original scan.
- Make license compatibility a CI-enforced gate, not a manual habit,
  matching the existing CodeQL/govulncheck pattern.
- Stand up a dedicated advisory persona (David) for this review lane,
  matching the Luis/Jose/Pepe/Paco roster shape, and make the
  vendor-trademark-check step explicit for future importers instead of
  implicit tribal knowledge.

**Non-Goals:**
- Renaming any existing tool, image, chart value, or binary — the audit
  found no renaming is actually required (TestRail already generic, Jira
  connector's public names already `testpulse`-prefixed).
- Legal review of TestPulse's own AGPL-3.0 licensing choice, or of
  contributor licensing (CLA/DCO) — out of scope, unrelated risk area.
- Building a general-purpose "any new dependency is reviewed by a human"
  workflow beyond the automated CI gate — the CI gate plus David's
  per-vendor-integration dispatch is the full scope.
- Any product code change. No migration, no API surface change, no UI
  change — confirmed by reading the full scope list below.

## Decisions

### D1: Jira disclaimer wording, sourced from Atlassian's actual policy

Fetched `https://www.atlassian.com/legal/trademark` live (not reused from
the issue's paraphrase) and confirmed: approved pattern is "X for Jira®" /
"X plugin for Jira®" (never "Jira for X"), Atlassian's mark must never be
*more prominent* than the rest of the product name, and independence must
be clearly disclaimed. This matches the existing six disclaimers' tone, so
the Jira disclaimer reuses their exact structure:

> Independent, unofficial integration — not affiliated with, endorsed by,
> or sponsored by Atlassian. "Jira" is a trademark of Atlassian Corporation
> Plc. No Jira logo is used anywhere in TestPulse's docs or UI.

Inserted directly under the `## Jira connector` heading in
`docs/integrations.md`, in the same position every other disclaimer
occupies in its own section (immediately after the heading, before the
first paragraph).

**Alternative considered**: rename `tools/jira-connector` → something like
`tools/testpulse-jira-connector`. Rejected — the source directory and
docker-compose service/profile name are internal implementation details
never shown to an end user as a product name; every externally-visible
name (Docker image, Helm `repository` value) already leads with
`testpulse-`, which is the actual compliance surface Atlassian's policy
cares about. Renaming the internal directory would be pure churn (import
paths, CI job names, docs cross-references) for no compliance benefit.

### D2: `THIRD-PARTY-LICENSES` generation — scripted, not hand-maintained

**Revised during implementation** (see tasks.md task 2.1 for the full
account): `license-checker` and its maintained `license-checker-rseidelsohn`
fork both failed outright ("No packages found in this path") against this
repo's npm-workspaces layout — both predate/mishandle npm's native
workspace hoisting. Replaced with a small committed script,
`scripts/license-report.mjs`, that gets the same result a different way:
it flattens `npm ls --all --omit=dev --json` (npm's own workspace-aware
resolver — the one tool guaranteed to get this right) and reads each
resolved package's `package.json` `license` field directly, skipping
graph entries with no resolved version (optional peer dependencies never
actually installed on this platform — e.g. Vite's unused `esbuild`/`sass`
alternatives — which are not real dependencies of this build and were
previously mis-reported as "UNKNOWN license" before this fix). For Go, it
shells out to `go-licenses report ./... --ignore github.com/Barayo/TestPulse`
per module, with a small inline override table correcting the one known
false-unknown: `go-licenses` can't detect a license for a package whose
directory holds only assembly (`.s`) files (several `github.com/segmentio/asm`
sub-packages), even though that module's real `LICENSE` file (MIT, verified
by inspection) sits one directory up.

A `make license-report` target runs this script and writes
`THIRD-PARTY-LICENSES` at the repo root, grouped by ecosystem and sorted
by package name. This is the same file the new CI job (D3) checks —
regenerating it is how a contributor fixes a CI failure caused by a new
dependency, rather than hand-editing the file.

**Alternative considered**: a one-time hand-written file, regenerated only
when someone remembers to. Rejected — this is exactly the "periodic manual
review" pattern the issue says doesn't scale; a `make` target costs little
and keeps the file mechanically honest.

### D3: CI license gate shape — mirrors `ci-security-scanning`'s existing jobs

**Revised during implementation**, following directly from D2: since
`go-licenses check`'s own `--disallowed_types=...,unknown` flag can't see
the override table in `scripts/license-report.mjs` (it does its own
independent detection), using it directly would immediately false-positive
on the `segmentio/asm` sub-packages — a real, already-shipped, genuinely
MIT dependency. Rather than running a second, differently-configured tool
in CI, the `license-check` job in `.github/workflows/ci.yml` reuses the
exact same `scripts/license-report.mjs` script as D2 (structured like the
existing `govulncheck` steps — run on every pull request):
1. Run `node scripts/license-report.mjs > /tmp/license-report.txt`.
2. `diff THIRD-PARTY-LICENSES /tmp/license-report.txt` — any difference
   fails the job (this is the drift check from the spec's second
   requirement) with a message naming `make license-report` as the fix.
3. Grep the fresh report for any disallowed or unrecognized license
   (GPL-2.0-only, the LGPL family, BSL-1.1, SSPL-1.0, Elastic-2.0, or the
   literal string `UNKNOWN`) — a hit fails the job and prints the
   offending package line(s). `UNKNOWN` failing closed is intentional: by
   the time the script runs, every legitimately-unresolvable case has
   already been corrected by its override table, so a fresh `UNKNOWN` can
   only mean a genuinely new, unreviewed license situation.
- The job also diffs its fresh scan output against the committed
  `THIRD-PARTY-LICENSES` file and fails if they've drifted — this is what
  actually forces D2's file to stay current, not goodwill.

**Alternative considered**: only gate on disallowed licenses, don't check
`THIRD-PARTY-LICENSES` for drift. Rejected — without the drift check, the
attribution file silently rots the same way the issue found it had already
rotted once.

### D4: David persona — scoped narrowly, modeled on Jose's structure

`.claude/agents/david.md`, frontmatter matching Jose's shape
(`name`, `description`, `tools: Read, Grep, Glob, Bash, Write`, `model:
sonnet`). Scope: (a) review a design.md for any change that names a
third-party vendor or adds a dependency, fetching that vendor's actual
published trademark policy live rather than assuming one; (b) on request,
run the `make license-report` scan against the full tree and flag any
license drift or new disallowed hit. Same constraints as the existing
roster: never edits product code or docs (no `Edit` tool), never files
issues, reports back to whoever dispatched it. Not given `Artifact` (no
product reason for David to publish a rendered page) or browser tools (no
UI surface to inspect).

**Alternative considered**: fold this scope into Jose (architecture)
instead of a new persona. Rejected per the user's explicit choice — trademark
and licensing review is a distinct legal/compliance lens, not an
architectural one, and conflating them would make Jose's one clear job
(architectural soundness) fuzzier.

### D5: Standing-practice note lives in `docs/integrations.md`, not CLAUDE.md

A short "Adding a new vendor integration" note near the top of
`docs/integrations.md` (before the first `## <Vendor> connector/importer`
section), stating: before shipping a new vendor integration, fetch that
vendor's current published trademark policy, add a disclaimer in this
file matching the existing pattern, and dispatch David against the
design.md as a gating review step — the same checkpoint Luis/Jose/Pepe
already sit at for security/architecture/UX.

**Alternative considered**: add this to `CLAUDE.md`'s standing-rules
section instead. Rejected — `CLAUDE.md` states project-wide process rules
(TDD, docs-with-every-change, board workflow); this is a narrower,
integration-specific convention that only matters to someone adding vendor
importer #7, and `docs/integrations.md` is exactly where that person is
already looking. Keeping it there avoids growing `CLAUDE.md` with
narrowly-scoped rules that belong closer to their subject matter.

## Risks / Trade-offs

- **[Risk]** `go-licenses` may not be cached/pinned consistently across CI
  runs → **Mitigation**: pinned to `@v1.6.0` in `scripts/license-report.mjs`
  (matching `govulncheck`'s existing `go run ...@v1.8.0` pinned-version
  pattern in `.github/workflows/ci.yml`), not `@latest`.
- **[Risk]** A legitimate but unrecognized/custom license on some
  transitive dependency could false-positive the CI gate (this already
  happened once, during this change's own implementation, with
  `segmentio/asm`'s assembly-only sub-packages) → **Mitigation**:
  fail-closed is the intended behavior (an unreviewable license should
  block merge, not pass silently); a real false positive is resolved by
  adding that one package to `scripts/license-report.mjs`'s
  `GO_LICENSE_OVERRIDES` table with a comment explaining why, after a
  human verifies the real license by inspecting the module's actual
  `LICENSE` file — not by weakening the general rule.
- **[Risk]** The `THIRD-PARTY-LICENSES` drift check (D3) could be noisy if
  contributors forget to regenerate it after adding any dependency →
  **Mitigation**: the CI failure message should name the exact `make`
  command to run locally, same spirit as `make generate`'s openapi-drift
  check already does for contract drift.

## Migration Plan

No data migration. Deployment-order-sensitive steps: none — this is docs,
a new file, a new CI job, and a new agent persona file, all additive and
independently mergeable. No rollback concerns beyond reverting the commit.

## Open Questions

None — all decisions above were either already settled by the user
(David persona name and scope, CI gate: yes) or resolved by reading the
actual current repo state and Atlassian's live policy during this design
pass.
