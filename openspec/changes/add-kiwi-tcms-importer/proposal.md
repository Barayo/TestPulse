## Why

As a QA lead migrating off Kiwi TCMS — an open-source test management tool, a natural adjacent audience to an open-source TestPulse — when I have an existing product with a test plan tree and cases, I want to import it into TestPulse in one operation, so I don't have to manually recreate existing test content by hand. TestPulse has no import path from Kiwi TCMS today — only JUnit-XML result import and, as of `add-testrail-importer`/`add-qase-importer`/`add-zephyr-scale-importer`, importers for three REST-API vendors. This change (GitHub issue #192) is the first importer against a genuinely different integration shape: Kiwi TCMS exposes an **XML-RPC** API, not REST, so — unlike Qase and Zephyr Scale, which reused the TestRail importer's job/route/report contract *and* its "hand-rolled REST client, no SDK" pattern — this change reuses only the former; the client layer is new work.

## What Changes

- Add `kiwi-tcms` as a fourth `source` value for the existing import-job machinery (`import_jobs` table, `POST/GET /projects/{projectKey}/import-jobs`, agent-facing claim/patch endpoints) — no schema or route changes, since both are already source-opaque.
- Add a `kiwitcmsclient` package to `tools/import-connector`: a minimal, hand-rolled XML-RPC codec (`encoding/xml` only, no third-party dependency — see design.md D-K1 for why) covering exactly the RPC calls this importer needs (`Auth.login`, `Product.filter`, `TestPlan.filter`, `TestCase.filter`), with session-cookie handling via `net/http/cookiejar` (Kiwi TCMS's `Auth.login` sets a Django `sessionid` cookie that every subsequent call must carry).
- Add Kiwi TCMS-specific mapping logic (`internal/importer`): a product's nested `TestPlan` tree (`parent`-linked, with a `TestPlan.tree()`-shaped hierarchy) maps to a nested TestPulse Folder tree; a `TestCase`'s freeform `text` field (Kiwi TCMS has no structured step concept at all — confirmed against the actual RPC field list) is preserved in the case's description, matching the precedent `add-zephyr-scale-importer` set for a vendor with no discrete steps; a case linked to more than one test plan within the imported scope (a real many-to-many relationship via Kiwi TCMS's `TestCasePlan` join, unlike every prior importer's one-case-one-container assumption) is created once, in the first plan encountered during the walk, with every multi-plan case named individually in the report rather than silently deduped or duplicated; a case's arbitrary key-value `properties` (Kiwi TCMS has no typed/structured custom-field concept — just free-form properties) map directly to TestPulse `text` custom fields, since there's no type ambiguity to resolve.
- Add "Import from Kiwi TCMS" as a fourth entry in the existing data-driven source list on `ProjectsPage.tsx`'s entry-point menu, navigating to `/projects/import/kiwi-tcms` (the existing `/projects/import/:source` route, unchanged).
- Add a Connect screen for Kiwi TCMS's credential shape (site URL + username + password — a self-hosted, open-source product with no fixed vendor endpoint, closer to TestRail's always-required site URL than Qase/Zephyr Scale's fixed hosted endpoint).
- Extend `docs/integrations.md` with a Kiwi TCMS importer section, sibling to the other three, including a trademark disclaimer footnote (no published Kiwi TCMS trademark policy found; defaulting to the same conservative pattern used for Qase/Zephyr Scale).

## Capabilities

### New Capabilities
- `kiwi-tcms-import`: importing a Kiwi TCMS product's test plan tree, cases, and their properties into a TestPulse project via the existing import-job machinery, with a mandatory dry-run preview.

### Modified Capabilities
(none — `testrail-import`'s, `qase-import`'s, and `zephyr-scale-import`'s requirements are unchanged; this change reuses the same underlying `import_jobs`/route contract without altering its documented behavior.)

## Impact

- **Affected code**: `tools/import-connector/` (new `internal/kiwitcmsclient` — the first non-REST, hand-rolled-codec client in this tool — `internal/importer` gains a `kiwi-tcms` mapping branch), `apps/web/src/pages/ProjectsPage.tsx` (source list entry), `apps/web/src/pages/ImportProjectPage.tsx` (Kiwi TCMS Connect-screen credential fields), `docs/integrations.md`.
- **Not affected**: `apps/api` (no schema/route/handler changes), `packages/shared/openapi.yaml` (no new endpoints).
- **Dependencies**: none new — the XML-RPC codec is hand-rolled against `encoding/xml`, deliberately avoiding a third-party XML-RPC library (design.md D-K1 explains the trade-off).
- **Deployment**: `deploy/compose/docker-compose.yml` and the Helm chart's `import-connector` templates gain a Kiwi TCMS-flavored example (`--source=kiwi-tcms`), reusing the same off-by-default profile mechanism as the other three importers.
