## Context

`useActiveProjectId()` (`useActiveProject.ts`) already handles this
correctly for `/projects/:projectKey` via a `/*`-suffixed `useMatch`
pattern, extending to every sub-route. The `/runs/:runKey` pattern was
never given the same suffix, so it silently broke the moment
`redesign-run-execution-view` added a real sub-route
(`/runs/:runKey/items/:caseKey`) instead of matching by coincidence.

## Goals / Non-Goals

**Goals:** the active project stays resolved on every route under
`/runs/:runKey/*`, present and future, not just the exact run URL.

**Non-Goals:** no change to how the project is resolved (still an extra
fetch of the run to read its `projectKey`) — only which routes trigger it.

## Decisions

- **Match `/runs/:runKey/*`**, mirroring `projectMatch`'s existing
  pattern, rather than special-casing the new item route specifically —
  keeps the two patterns symmetric and covers any future run sub-route
  without another fix.

## Risks / Trade-offs

None — a strict widening of what already resolves the project correctly.
