## Why

As a tester, when I record a failed or blocked verdict, I want the right
person to be notified automatically, so a failure doesn't sit silently
until someone happens to check the run. TestPulse today has no
notification mechanism at all — no webhooks, no Slack hooks, no in-app
alerts — every mainstream competitor in this category (TestRail, Qase,
Zephyr) supports at least one. Split from GitHub issue #130, which
originally bundled this with per-Result Jira linking; that half is now
tracked separately as issue #206 since case-level and run-item-level Jira
linking already ship.

## What Changes

- A project (Project Admin or Tenant Admin) can configure one or more
  outbound webhook destinations, each a plain HTTPS URL.
- A webhook fires on two events: a result recorded as `failed` or
  `blocked`, and a run closing — the two moments the underlying issue
  names as the actual pain point.
- Delivery is fire-and-forget from the service layer: a webhook endpoint
  being down or returning a non-2xx response never blocks or fails the
  triggering write (recording a result, closing a run), mirroring how
  `audit()` already tolerates its own failures without blocking the
  write it's recording.
- A Slack destination is supported as the same generic HTTPS webhook
  mechanism — Slack's incoming-webhook format is itself a JSON POST, so
  no separate integration path is needed for v1.
- Native email/SMTP-triggered notifications are explicitly out of scope
  for this change (see design.md non-goals).
- Sample Project showcase: a webhook destination seeded against a
  documented placeholder URL, demonstrating the configuration UI —
  without claiming to demonstrate live delivery, since no real
  externally-reachable destination exists in a seeded demo.

## Capabilities

### New Capabilities
- `run-notifications`: project-scoped webhook destinations, delivery on
  a failed/blocked result and on run close, fire-and-forget with no
  blocking of the triggering write.

### Modified Capabilities
(none — the trigger points hook into existing `RecordResult`/`CloseRun`
service methods as an additional side effect; no existing requirement's
behavior changes)

## Impact

- New migration: a project-scoped webhook-destinations table (goose,
  incremental, per CLAUDE.md's permanent migration policy).
- `apps/api/internal/service/*.go`: new webhook-dispatch logic hooked
  into `RecordResult` and `CloseRun`.
- `packages/shared/openapi.yaml` + regenerated `api.ts`: new
  webhook-destination CRUD endpoints, project-scoped.
- New web UI: a webhook-destinations settings panel (likely on Project
  Settings, alongside where per-project config already lives).
- `docs/integrations.md`: new section alongside the Jira connector.
- `apps/api/internal/sampledata/seed.go` + `seed_test.go`: showcase
  webhook.
