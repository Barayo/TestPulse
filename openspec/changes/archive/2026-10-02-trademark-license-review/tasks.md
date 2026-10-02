## 1. Jira trademark disclaimer

- [x] 1.1 Add the Atlassian non-affiliation disclaimer (design.md D1) to
  `docs/integrations.md`'s `## Jira connector` section, in the same
  position (immediately after the heading) as the other six disclaimers.

## 2. THIRD-PARTY-LICENSES generation

- [x] 2.1 Add a `license-report` target to the root `Makefile` that runs
  `scripts/license-report.mjs` (a workspace-aware generator — see note
  below) over the npm workspace and `go-licenses report ./...` from each
  of `apps/api`, `tools/jira-connector`, `tools/import-connector`,
  concatenating the output into `THIRD-PARTY-LICENSES` at the repo root
  (design.md D2).

  **Deviation from design.md**: the `license-checker` CLI (and its
  maintained `license-checker-rseidelsohn` fork) cannot resolve npm
  workspace dependency trees — both rely on legacy single-tree assumptions
  and report "No packages found" against this repo's hoisted root
  `node_modules`, confirmed by direct testing. Replaced with
  `scripts/license-report.mjs`, which flattens `npm ls --all --omit=dev
  --json` (npm's own workspace-aware resolver) and reads each resolved
  package's own `package.json` `license` field — same inputs, same output
  shape, no flaky third-party CLI dependency. Also excludes dependency-graph
  entries with no `version` (optional peer deps never actually installed
  on this platform, e.g. Vite's unused `esbuild`/`sass`/`terser`
  alternatives) rather than mis-reporting them as "UNKNOWN license".
  `go-licenses`'s own per-package detection failure on
  `github.com/segmentio/asm`'s assembly-only sub-packages (a real MIT
  module, verified by inspecting its module-root `LICENSE` file) is
  corrected via a small override table in the script, documented inline.
- [x] 2.2 Run `make license-report` and commit the generated
  `THIRD-PARTY-LICENSES` file.
- [x] 2.3 No standalone test file added — covered by task 3.1's CI step,
  matching this repo's existing precedent for drift-style checks (the
  `web` job's "Contract types are current"/"API docs embed is current"
  steps also have no separate unit test, just a `git diff --exit-code`
  CI assertion). The `license-check` job's `diff THIRD-PARTY-LICENSES
  /tmp/license-report.txt` step fails closed if the file is missing,
  empty, or stale — the same guarantee a presence/non-empty test would
  give, without a redundant second mechanism.

## 3. CI license gate

- [x] 3.1 Add a `license-check` job to `.github/workflows/ci.yml` (design.md
  D3, revised during implementation — see task 2.1's deviation note): run
  `node scripts/license-report.mjs > /tmp/license-report.txt`, then `diff
  THIRD-PARTY-LICENSES /tmp/license-report.txt` (fails the job on drift,
  naming `make license-report` as the fix), then grep the fresh report
  for any disallowed license (GPL-2.0-only, LGPL family, BSL-1.1,
  SSPL-1.0, Elastic-2.0) or the literal string `UNKNOWN` (fails closed on
  anything unreviewed), printing the offending line(s).
- [x] 3.2 Covered by 3.1 (the single job does both the drift check and the
  disallowed-license check via the same script run).
- [x] 3.3 Verified locally: `node scripts/license-report.mjs` diffed
  against the committed `THIRD-PARTY-LICENSES` with zero drift, and the
  grep found no disallowed/unknown license (clean dependency tree).
- [x] 3.4 Verified both failure modes locally by simulating the job's exact
  commands: (a) appending a bogus line to a scratch copy of
  `THIRD-PARTY-LICENSES` and confirming `diff` reports drift; (b)
  appending a `GPL-2.0-only` line to a scratch copy of the generated
  report and confirming the grep matches and would fail the job. Both
  fired as expected before being reverted — the red/green verification for
  this CI gate.

## 4. David persona

- [x] 4.1 Create `.claude/agents/david.md` — frontmatter modeled on
  `.claude/agents/jose.md`'s structure (`name: david`, `description`
  covering the two jobs from design.md D4, `tools: Read, Grep, Glob, Bash,
  Write`, `model: sonnet`), body covering: grounding in this project's
  actual AGPL-3.0 license and the `ci-security-scanning`/`THIRD-PARTY-LICENSES`
  machinery from this change, the two jobs (gating review of a new
  vendor-integration design.md; on-request full-tree license scan via
  `make license-report`), and the same "never edits product code, never
  files issues, reports back to whoever dispatched it" constraints as the
  rest of the roster.

## 5. Standing-practice documentation

- [x] 5.1 Add an "Adding a new vendor integration" note near the top of
  `docs/integrations.md` (design.md D5): before the first `## <Vendor>`
  section, stating the standing steps — fetch the vendor's current
  published trademark policy, add a disclaimer matching the established
  pattern, dispatch David against the design.md as a gating review step.

## 6. Verification

- [x] 6.1 Ran `make lint` — exit 0. All warnings present are pre-existing
  web lint warnings unrelated to this change (verified by content —
  react-hooks/fast-refresh warnings in files this change never touched).
- [x] 6.2 Confirmed via `git status --short`: only `docs/integrations.md`,
  `Makefile`, `.github/workflows/ci.yml` modified, plus new files
  `THIRD-PARTY-LICENSES`, `scripts/license-report.mjs`, and
  `.claude/agents/david.md` — no production Go/TypeScript source changed.
  (`scripts/license-report.mjs` is an addition beyond the original
  design.md plan — see task 2.1's deviation note — but is tooling, not
  product source.)
- [x] 6.3 Confirmed: internal/compliance tooling with no new user-visible
  product surface, already reasoned explicitly in design.md's Non-Goals;
  no `seed.go` change needed.
