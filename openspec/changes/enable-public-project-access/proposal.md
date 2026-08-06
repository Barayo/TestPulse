## Why

As an evaluator, when I run `docker compose up` and open TestPulse for the
first time, I want to see the populated Sample Project immediately, without
creating an account — but today I can't: `RequireAuth` wraps every route
including `/`, and no bootstrap credential is shown anywhere in
`docs/getting-started.md` (only in `docs/deployment.md`). The quickstart's
own promise — "open the app and see a populated example project" — is
currently broken for a first-time, unauthenticated visitor. This is also
the shape of a real, recurring team need (GitHub issue #61): sharing a
project's test documentation, suites, or run results with someone outside
the instance — a stakeholder, a client, a contributor without an account —
who should be able to view it without being invited as a member.

## What Changes

- A Project Admin can flip a per-project **Public access** toggle in Project
  Settings, exposing that project's cases, folders, suites, runs, results,
  and attachments read-only at a stable, unauthenticated URL
  (`/public/{projectKey}`) — off by default.
- A Tenant Admin can flip an **instance-wide kill switch** (Administration →
  Instance, a new page) that gates whether *any* project can ever be public
  on this instance, regardless of each project's own setting — on by
  default, anticipating future multi-tenant hosting where an operator may
  want to disable the capability entirely.
- The Sample Project is marked public by default, so a fresh instance is
  genuinely link-shareable and login-free out of the box, and
  `docs/getting-started.md` is corrected to point at that link.
- No anonymous write access of any kind. No new actor concept — anonymous
  reads are served by the existing read handlers, unmodified, outside any
  `Actor` context. The existing authenticated RBAC model (`authorization`
  capability, "no membership → no access") is untouched; this is an
  additive, parallel, unauthenticated route group, not a bypass of it.

## Capabilities

### New Capabilities
- `public-project-access`: opt-in, per-project, read-only unauthenticated
  access via a stable project-key URL, gated by both a per-project toggle
  and an instance-wide Tenant-Admin kill switch.

### Modified Capabilities
(none — the existing `authorization` capability's requirements, including
"no membership → no access, including read," are unchanged; anonymous
access is served through a separate, additive route group rather than a
change to how authenticated permission checks work.)

## Impact

- **Backend**: new `instance_settings` table + migration; new
  `domain.InstanceSettings`; new `store/instance_settings.go`,
  `service/instance_settings.go`; new `server/instance_settings_handlers.go`
  (`PATCH /api/v1/instance-settings`, Tenant-Admin-only); `projects` table
  gains `public_access boolean`; new `requirePublicProject` middleware and
  an unauthenticated route group mounted in `server.go` reusing existing
  read handlers under `/api/v1/public/{projectKey}/...`; `GET /api/v1/meta`
  gains `publicProjectsEnabled`.
- **Frontend**: new `/public/:projectKey` route tree outside `RequireAuth`
  reusing existing project page components with permissions forced to
  all-false; new anonymous-viewer banner; new "Public access" toggle in
  Project Settings; new `InstanceSettingsPage.tsx` and `AdminMenu.tsx` entry.
- **Docs**: `docs/getting-started.md`, `docs/deployment.md`, `docs/api.md`,
  and a new or existing authorization-adjacent doc page.
- **Sample Project**: `sampledata/seed.go` marks the Sample Project public.
