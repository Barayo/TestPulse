## Why

As a test case author, when several cases share a common setup or sub-flow
(e.g. "log in as admin"), I want to define it once and reference it from
every case that needs it, so updating that shared flow doesn't mean
editing a dozen cases by hand (issue #132). Every case's steps are defined
inline today with no reuse mechanism — `domain.Step`/`CaseContent.Steps`
is a plain array — so common flows drift out of sync as each case is
edited independently. Surfaced during a Senior QA Architect gap assessment
(2026-08-20) evaluating TestPulse against TestRail/Qase/Zephyr, both of
which support shared/reusable step blocks.

## What Changes

- Add a new project-scoped `StepGroup` entity (name + an ordered list of
  steps), managed like `CustomField`/`Folder` — mutable in place, not
  itself versioned, soft-deletable. New REST routes:
  `GET/POST /projects/{projectKey}/step-groups`,
  `GET/PUT/DELETE /step-groups/{groupId}` — write requires `manageProject`.
- **BREAKING**: `Step` (in `CaseContent.Steps`, `packages/shared/openapi.yaml`)
  gains an optional `groupRef` field. A step entry carrying `groupRef`
  expands to the referenced group's *entire* step sequence at that
  position — a block, not a single step. Case create/edit resolves and
  snapshots any `groupRef` entries into the saved version's `Steps`
  server-side, at save time — case versions remain fully immutable exactly
  as today; a run pinned to a version never changes later even if the
  source group is subsequently edited. The server always re-resolves
  server-side and never trusts a client-sent snapshot.
- Add `SnapshotUpdatedAt` staleness tracking: while *editing* (not viewing
  a past version of) a case, a group-reference block whose source group
  has changed since this case's snapshot shows an explicit "update
  available" affordance with a one-click refresh — never silent/automatic
  propagation. A block whose source group was deleted offers "detach"
  (keep the already-snapshotted steps as plain inline steps) instead.
- Add MCP tool `upsert_step_group(projectKey, key?, name, steps)`,
  matching `upsert_test_case`'s upsert-by-key pattern. Extend
  `upsert_test_case`'s `steps` input to accept the same `groupRef` (by
  `groupKey`) per entry, resolved server-side via the same shared
  resolution path as REST.
- Web UI: a new project-scoped "Shared Steps" admin page (same pattern as
  the existing Custom Fields settings page); the case editor gains
  "Insert shared group" (alongside "Add step") and "Extract as shared
  group" (from a selected run of existing steps) actions, a read-only
  bordered block rendering for referenced steps with a "Detach" action,
  and the staleness/refresh and deleted-group/detach affordances above. A
  read-only case view shows a "from shared group: `<name>`" badge linking
  to the group.
- `docs/test-management.md`, `docs/mcp-server.md`, and `docs/api.md` gain
  coverage of the new entity, tool, and routes.
- The Sample Project seed grows a shared step group referenced by 2+
  cases so the feature is demonstrable, not just tested.

**Explicitly out of scope**:
- No dedicated REST "extract" endpoint — extraction is client-side
  composition of the existing create-group + update-case calls.
- No new permission flag for *referencing* a group while authoring a case
  (existing `canCaseCreate`/`canCaseEdit` cover it) — only group
  create/edit/delete requires `manageProject`, matching the existing
  custom-fields precedent.
- No per-group access control finer than project-level `manageProject`.

## Capabilities

### New Capabilities
- `reusable-steps`: the `StepGroup` entity, its REST CRUD surface, the
  snapshot-at-save/staleness/refresh/detach contract for `groupRef` step
  entries, and the permission rules governing group management vs. group
  reference.

### Modified Capabilities
- `test-authoring`: "Immutable test case versioning" gains the rule that
  `groupRef` step entries are resolved and snapshotted server-side at
  save time, and that a saved version's content is unaffected by later
  edits to the source group.
- `mcp-server`: "upsert_test_case tool" gains `groupRef` support in its
  `steps` input; a new "upsert_step_group tool" requirement is added.

## Impact

- **API**: `packages/shared/openapi.yaml` gains the `step-groups` routes,
  response schemas, and the `groupRef` addition to `Step`; `make generate`
  regenerates the TS client (CI fails on drift).
- **Backend**: a new `apps/api/internal/store/step_groups.go` repo +
  `apps/api/internal/service` methods; `CaseContent` validation/save-path
  in `apps/api/internal/service/service.go` gains server-side `groupRef`
  resolution, shared by the REST case-write path and the MCP
  `upsert_test_case`/new `upsert_step_group` tools
  (`apps/api/internal/mcp/`).
- **Frontend**: a new Shared Steps admin page; `CreateCasePage.tsx` /
  `CaseDetailPage.tsx`'s step editor gains insert/extract/detach/refresh
  UI.
- **Docs**: `docs/test-management.md`, `docs/mcp-server.md`, `docs/api.md`.
- **Sample data**: `apps/api/internal/sampledata/seed.go` and
  `seed_test.go`.
- No changes to existing `List`/unbounded read paths; no interaction with
  `add-cursor-pagination`'s pagination contract beyond the new
  `step-groups` list endpoint following the same convention as every
  other project-scoped list (out of scope to actually paginate here,
  since step-group counts per project are expected to stay small —
  revisit if that assumption breaks).
