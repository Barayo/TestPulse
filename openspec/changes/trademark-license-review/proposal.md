## Why

TestPulse now ships six vendor importers (TestRail, Qase, Zephyr Scale, Kiwi
TCMS, Tuskr, Xray) plus the Jira connector, each introducing third-party
trademark surface and new dependencies. Issue #195 (raised during the
TestRail importer's design) found this risk was being handled ad hoc:
five of the six importers now carry a proper non-affiliation disclaimer and
a vendor-agnostic tool name, but the Jira connector — the project's first
and oldest integration — was never given the same treatment, no dependency
license audit has been repeated since the original one-off scan, no
NOTICE/THIRD-PARTY-LICENSES file exists despite MIT/BSD/Apache-2.0 all
requiring one, and nothing in CI would catch a newly-added GPL-2.0-only or
other AGPL-3.0-incompatible dependency before merge. As more vendor
integrations are planned, this needs to become a repeatable, reviewed, and
automated practice rather than a one-time check.

## What Changes

- Add the missing Idera/Atlassian-style non-affiliation disclaimer to the
  Jira connector section of `docs/integrations.md`, matching the format
  already used by the six importer sections, worded against Atlassian's
  actual published trademark policy (fetched live, not assumed).
- Generate and commit a `THIRD-PARTY-LICENSES` file from a fresh scan of the
  full current dependency tree (npm workspace + all three Go modules:
  `apps/api`, `tools/jira-connector`, `tools/import-connector`).
- **New capability-equivalent**: add an automated license-check CI job
  (`license-checker` for the npm workspace, `go-licenses` for each Go
  module) that fails the build on a disallowed-license hit (GPL-2.0-only,
  LGPL family, BSL, SSPL, Elastic, and other source-available/restrictive
  licenses), matching the existing CodeQL/govulncheck gate shape documented
  in the `ci-security-scanning` capability.
- Add a new advisory-only reviewer persona, **David**, to `.claude/agents/`
  — trademark/dependency-license review, structured like the existing
  Luis/Jose/Pepe/Paco personas (never edits product code, never files
  issues, reports back to whoever dispatched it).
- Document "check the vendor's own published trademark policy and add a
  `docs/integrations.md` disclaimer" as an explicit standing step for future
  vendor-importer changes, since it has been de facto practice for six
  importers running but was never written down anywhere.

## Capabilities

### New Capabilities

(none — the trademark disclaimer text, the `THIRD-PARTY-LICENSES` file, the
David persona, and the standing-practice documentation are compliance and
process artifacts, not product behavior; they fall outside what OpenSpec
capability specs describe. Only the CI license gate is a true behavioral
requirement, and it extends an existing capability — see below.)

### Modified Capabilities

- `ci-security-scanning`: add a requirement that every pull request's
  dependency tree (npm workspace and each first-party Go module) is
  license-scanned, and that the corresponding CI job fails on a
  disallowed-license hit — the same shape as the existing CodeQL and
  govulncheck requirements in this capability.

## Impact

- `docs/integrations.md` (Jira connector section) — add disclaimer.
- `THIRD-PARTY-LICENSES` (new file, repo root) — generated attribution file.
- `.github/workflows/ci.yml` — new license-check job(s).
- `.claude/agents/david.md` (new file) — new advisory persona.
- No production Go/TypeScript source changes, no migrations, no API
  surface changes. No Sample Project showcase task needed — this is
  internal/compliance tooling with no new user-visible product surface
  (confirmed explicitly in design.md per CLAUDE.md's standing rule, not
  silently skipped).
