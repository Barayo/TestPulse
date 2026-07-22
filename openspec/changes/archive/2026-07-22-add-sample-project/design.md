## Context

`cmd/testpulse-api/main.go`'s `run()` already has a proven "seed once, on an
empty instance" pattern: `svc.BootstrapAdmin(ctx, cfg.AdminEmail,
cfg.AdminPassword)` checks `len(users) > 0` before creating anything, and
never re-seeds afterward. This change adds a second, similarly-shaped
bootstrap step for a Sample Project, gated on project count instead of user
count.

`apps/api/cmd/seed-demo/main.go` already has everything needed to build
rich example content (folders, cases, suites, runs with recorded verdicts)
for its own dev-only two-project seed, entirely through the public
`service.Service` API — the same discipline this change needs, just wired
into production startup instead of a manually-invoked CLI.

## Goals / Non-Goals

**Goals:**
- A brand-new instance has one populated, realistic project to look at
  immediately, no manual step required.
- The seed runs exactly once per instance lifetime (mirrors
  `BootstrapAdmin`); deleting the Sample Project doesn't bring it back.
- The Sample Project is visually distinguishable (a "Sample" badge) via a
  real, purpose-built field — not a name/key-matching heuristic, and not a
  dependency on the not-yet-built project-tags feature (`#28`).
- `cmd/seed-demo`'s reusable content-building primitives get a real home
  instead of living only inside a dev-only CLI's `main.go`.

**Non-Goals:**
- No env var to disable/enable it — always on for a fresh instance, per
  the confirmed design.
- No protection against deleting/archiving it — it's a normal project.
- No generic project-tagging system — out of scope, tracked separately as
  `#28`.
- No changes to `cmd/seed-demo`'s own two demo projects (Banca Móvil,
  Desktop App) beyond sourcing their shared helpers from the new package.

## Decisions

### D1: `Project.IsSample` is a dedicated boolean, not a tag or a key match
This codebase already has precedent for small, purpose-built booleans
carrying real project-level meaning: `Project.Archived`,
`ProjectSummary.IsFavorite`, `User.IsTenantAdmin`. A generic tag system
(`#28`) is unscheduled, unbuilt, and would need its own UI (create/manage/
color tags) — disproportionate scope for one badge. A client-side match on
the project's derived key was considered and rejected: it's a magic-string
heuristic that breaks the moment key-derivation rules change, versus a
real field that says exactly what it means. `is_sample boolean NOT NULL
DEFAULT false` is added to the existing `projects` table (amended in
place, `00002_core_domain.sql`, per the pre-1.0 migration policy).

### D2: Setting the flag is a separate store call, not a `Create` parameter
`ProjectRepo.Create(ctx, name, description)` is called from every normal
project-creation path (`POST /api/v1/projects`) and has meaningful
key-collision-retry logic already. Rather than thread an `isSample bool`
parameter through `Create` (and every other caller that would now need to
pass `false`), add one small, explicit `ProjectRepo.MarkSample(ctx,
projectID string) error` (`UPDATE projects SET is_sample = true WHERE id =
$1`) and a matching `Service.MarkSample`. `sampledata.Seed` calls
`CreateProject` normally, then `MarkSample` once on the result. This keeps
every existing `Create` call site untouched and the new capability
additive and obviously optional.

### D3: The seeding gate lives in a new `Service.HasAnyProject`, orchestration lives in `main.go`
Mirrors `BootstrapAdmin`'s own internal shape (`s.store.Users.List(ctx)`,
check `len() > 0`) but as its own method, since — unlike admin bootstrap,
which is pure identity logic appropriate for the `service` package — the
actual Sample Project content-building script is intentionally kept
*outside* `service`, in the new `sampledata` package, to avoid it becoming
implicit business logic. `main.go`'s `run()` calls
`svc.HasAnyProject(ctx)`, and if `false`, calls `sampledata.Seed(ctx,
svc)`. A failed seed is logged as a warning, not fatal — matches how
`CleanupExpiredSessions` errors are already handled in the same function;
a broken demo seed must never take down a real deployment's startup.

### D4: `sampledata` package — extracted helpers + one new `Seed` entry point
`apps/api/internal/sampledata` houses the generic builders currently
private to `cmd/seed-demo/main.go` (`folder`, `caseWithSteps`, `filler`,
`suite`, `runWithVerdicts`, the `actors` list, `rootFolder`), exported, plus
a new `Seed(ctx context.Context, svc *service.Service) error` building the
Sample Project's specific content. `cmd/seed-demo/main.go` is refactored to
import these instead of defining its own copies; its two demo projects'
specific content (`seedBancaMovil`, `seedDesktopApp`) stay where they are.
Both `sampledata.Seed` and `cmd/seed-demo` operate purely through
`service.Service` — no direct store access — keeping the boundary the
existing dev tool already established.

### D5: `sampledata.Seed` needs a synthetic actor in context
`service.Import` (used to seed the JUnit-XML-imported run) requires an
authenticated actor via `domain.ActorFromContext` — there's no HTTP
session at startup. `sampledata.Seed` looks up the bootstrap admin (the
one user guaranteed to exist by the time it runs, since it's called after
`BootstrapAdmin`) and wraps `ctx` with `domain.WithActor` using that user's
identity, so audit entries and the imported run's recorded results
attribute sensibly to a real user rather than an ad-hoc "system" actor.

### D6: Content composition
One project, "Sample Project": a couple of nested sections holding cases
with varied `priority`/`tags`/`platform`/`testType`/`automated`; two
suites; three runs — one open with mixed recorded verdicts, one closed
(via `CloseRun`), and one created via `Import` with a JUnit XML report
containing one intentionally-unmatched case key (so the `207`
partial-match response's real-world shape is visible in seeded data); one
case edited after creation so version history has a real diff to show.

## Risks / Trade-offs

- **[Risk] Seed failure at startup, e.g. a bug in generated content**
  → Mitigation: non-fatal (D3) — logs a warning, server still starts.
  Since it never retries (D3's "once, ever" gate is project-count, not
  success-tracked), a failed partial seed could leave an incomplete
  Sample Project sitting there. Accepted: this only affects the disposable
  demo project, not real user data, and TDD coverage on `sampledata.Seed`
  should catch content bugs before they ship.
- **[Trade-off] `is_sample` is one more boolean on `projects`** → Accepted,
  consistent with existing precedent (D1); trivial migration.

## Migration Plan

1. Amend `00002_core_domain.sql`: add `is_sample boolean NOT NULL DEFAULT
   false` to `projects`. Update the `-- +goose Down` section if it lists
   columns explicitly (check current content).
2. `domain.Project.IsSample`; `ProjectRepo.Get/List/ListForMember/Create`
   select/scan it; new `ProjectRepo.MarkSample`.
3. `Service.MarkSample`, `Service.HasAnyProject`.
4. `packages/shared/openapi.yaml`: `Project.isSample`; `make generate`.
5. Extract `sampledata` package from `cmd/seed-demo`; refactor
   `cmd/seed-demo/main.go` to use it; add `sampledata.Seed`.
6. Wire `sampledata.Seed` into `cmd/testpulse-api/main.go`'s `run()`.
7. Web: "Sample" badge on project list/landing when `isSample` is true.
8. Docs: `docs/database.md`, `docs/api.md`, `docs/getting-started.md`/
   `docs/test-management.md`.

## Open Questions

None — fully brainstormed and confirmed with the user before this
document was written.
