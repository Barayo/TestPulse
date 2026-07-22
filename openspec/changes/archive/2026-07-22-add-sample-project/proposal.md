## Why

A fresh TestPulse instance is an empty shell — no projects, no cases, no
runs. Anyone evaluating the product (the primary audience for an
open-source, self-hosted tool) has nothing to look at until they've
authored content themselves, so the product's actual capabilities —
versioned cases, suites, run execution, the open/closed run lifecycle,
JUnit-XML import — stay invisible on first contact. A populated, realistic
example project, present from the very first startup, turns that empty
shell into a working showroom.

## What Changes

- On first startup (when the instance has zero projects — same "only
  once, never re-seeds" gate `BootstrapAdmin` already uses), the server
  automatically creates one **Sample Project** populated with folders,
  cases (varied priority/tags/platform/testType/automated), suites, an
  open run with mixed verdicts, a closed run, and a run created via the
  JUnit-XML import endpoint (including one intentionally unmatched case,
  showing the partial-match/207 behavior).
- Every project gains an `isSample` flag (`Project.IsSample`), `false` for
  every project except this one. The web UI shows a small "Sample" badge
  next to the project's name wherever it's listed.
- The Sample Project is a normal project in every other respect —
  archivable, no special RBAC treatment, no protection against removal.
  Archive/remove it and it's gone for good, exactly like a deleted
  bootstrap admin never comes back — it's never re-seeded.
- `apps/api/cmd/seed-demo`'s content-building helpers (folder/case/suite/
  run-with-verdicts builders) are extracted into a new shared package so
  both `seed-demo` (dev-only, two dense example projects) and the new
  always-on seeding path build on the same primitives instead of
  duplicating them.

## Capabilities

### New Capabilities

- `sample-data`: automatic, one-time creation of a populated Sample
  Project on a fresh instance.

### Modified Capabilities

- `test-authoring`: the "Project management" requirement's schema gains
  the `isSample` field, `false` by default for every normally-created
  project.
- `ui-navigation`: the "Project list with permission-ready create action"
  requirement gains a scenario for the "Sample" badge.

## Impact

- **Backend**: `apps/api/internal/db/migrations/00002_core_domain.sql`
  amended in place — `projects.is_sample boolean NOT NULL DEFAULT false`
  (pre-1.0 migration policy). `domain.Project` gains `IsSample`.
  `store/projects.go` gains a way to create a project with the flag set.
  `service.Service` gains `HasAnyProject(ctx) (bool, error)`. New package
  `apps/api/internal/sampledata` (extracted helpers + `Seed(ctx, svc)
  error` for the Sample Project's specific content).
  `cmd/testpulse-api/main.go`'s `run()` calls `sampledata.Seed` right
  after `BootstrapAdmin`, non-fatally, when `HasAnyProject` is false.
- **Contract**: `packages/shared/openapi.yaml`'s `Project` schema gains
  `isSample`; `make generate`.
- **Frontend**: project list and project landing page render a "Sample"
  badge when `project.isSample` is true.
- **Dev tooling**: `apps/api/cmd/seed-demo/main.go` refactored to import
  the extracted helpers from `sampledata` instead of defining its own;
  its own two demo projects are otherwise unchanged.
- **Docs**: `docs/database.md` (new `projects.is_sample` column),
  `docs/api.md` (new `Project.isSample` field), `docs/getting-started.md`
  and/or `docs/test-management.md` (mention the Sample Project exists on
  a fresh instance).
- **No dependency on project tags** (`#28`, unscheduled backlog) — the
  badge is driven by the new `isSample` field, not a tag.
- **Sequencing**: builds on `add-human-readable-keys`, `add-execution-import`,
  and `add-run-lifecycle-status` (all already shipped) — the seeded
  content exercises their capabilities, doesn't change them.
