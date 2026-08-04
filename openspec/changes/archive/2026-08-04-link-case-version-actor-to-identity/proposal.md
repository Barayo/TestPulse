## Why

As a tester reviewing a case's version history, when I see "v2 — Steps
changed," I want to know who changed it, so I can ask them directly
instead of guessing or digging through the audit log. This mirrors two
already-shipped changes — `link-run-item-assignee-to-identity` and
`link-result-actor-to-identity` — but `test_case_versions` is the one
identity-touching entity in the app that still records no actor at
all: `domain.CaseVersion` has only `CaseID, Version, Content,
CreatedAt`.

Showing a name on the row only works if users actually have one:
today `display_name` stays `NULL` forever unless someone visits the
Profile page (`add-user-profile`), so most accounts would show nothing
useful. This change also makes `display_name` non-empty from the
moment an account is created, defaulting to a name derived from the
email address — the same self-service field, just no longer
permanently blank by default.

## What Changes

- `test_case_versions` gains `actor_kind` (`user`/`agent`/`unknown`,
  default `unknown`) and `actor_ref_id` (nullable, no FK — survives
  the actor being deleted later), populated from the authenticated
  caller on both case creation and every edit. Mirrors
  `test_run_results.actor_kind`/`actor_ref_id` exactly — same
  reasoning, same shape.
- `CreateUser` (admin-created accounts) and self-registration-adjacent
  flows now default `display_name` to a name derived from the email's
  local-part when none is given — e.g. `jane.doe@x.com` → "Jane Doe",
  `rgriffiths@x.com` → "Rgriffiths" — instead of leaving it `NULL`.
  `BootstrapAdmin`'s existing hardcoded "Admin" display name is
  unchanged (a deliberate, friendlier choice for the one bootstrap
  account, not something this default should override).
- Version History rows (`CaseDetailPage.tsx`) show the editing actor's
  `Avatar` (`size-4`) and first name **folded into the existing
  change-signal line** (`[avatar] Miguel · Steps changed`) — not a new
  third line — per Pepe design review (`version-history-actor-design.html`
  mock). Full name is available via a `title` tooltip. Versions
  recorded before this change (`actorKind: "unknown"`) show no
  avatar — absent, never a broken placeholder. The actor is not
  repeated in the expanded diff panel.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-authoring`: "Immutable test case versioning" gains actor
  tracking on every version, mirroring how `test-execution` already
  tracks a result's actor.
- `ui-navigation`: "Editing a test case creates a new version" gains
  the actor-on-row display requirement.
- `authentication`: "Local user accounts" gains a default-display-name
  scenario for newly created accounts.

## Impact

- **DB**: new migration adding `actor_kind`/`actor_ref_id` to
  `test_case_versions` — additive, no existing column changes.
- **API**: `CaseVersion` response gains `actorKind`/`actorRefId`
  fields; no new endpoints. `packages/shared/openapi.yaml` updated,
  `make generate` re-run.
- **Backend**: `Cases.Create`/`Cases.Edit` (store) take the
  authenticated actor and record it alongside the new version, the
  same way `RecordResult` already does. `CreateUser` computes a
  default `display_name` when none is supplied.
- **Frontend**: `CaseDetailPage.tsx`'s Version History row layout
  changes (avatar + first name folded into the signal line); no other
  pages change, since `Avatar.tsx` is already the shared rendering
  path.
- **Sample Project**: the Sample Project's seeded case versions
  predate this change and will show `actorKind: "unknown"` (no
  avatar) — acceptable and consistent with how seeded/pre-migration
  result history already behaves; not backfilled.
