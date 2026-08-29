## Context

`ProjectRepo.ListSummaries` (`apps/api/internal/store/projects.go`) already builds the batched `GET /api/v1/projects/summaries` response as a handful of grouped queries — one for the base project rows, one for suite/case counts, one for latest-run pass rate, one for the caller's favorited project IDs (`project_favorites`, a `(user_id, project_id)` join table with no surrogate key) — then assembles them in Go, rather than one query per project. `project-favorites` is the closest precedent for "a per-project, per-something relationship surfaced in the batched summary": same permission bar (`read` or Tenant Admin), same join-table shape, same "included in summaries, no extra request" requirement.

Tags differ from favorites in one way that matters: favorites are scoped to `(user, project)` and never shared; tags are a shared vocabulary — the string "mobile" typed once must be the same tag everywhere it's used, so the compact-view filter control can offer a fixed, deduplicated list rather than free text scraped from every project.

## Goals / Non-Goals

**Goals:**
- One shared, deduplicated tag vocabulary, reusable across projects.
- Tag state included in `GET /api/v1/projects/summaries` at no extra request cost.
- Assign/remove tags at the same permission bar as starring a project.
- Filter the project list by tag in compact view.

**Non-Goals:**
- Tag management UI (rename/delete/merge a tag, color-coding tags) — out of scope; a tag is created implicitly the first time it's typed, per the picker's free-entry-that-becomes-a-shared-value pattern below.
- Tags on any entity other than a project (cases already have their own, unrelated tag-like classification fields from `case-custom-fields` — not touched here).
- Tag-based permissions or automation (e.g. "tag X restricts visibility") — just organization/filtering.

## Decisions

**D1 — Vocabulary table + join table, not a free-text column or array column.**
`tags (id, name UNIQUE, created_at)` + `project_tags (project_id, tag_id, created_at)`, PK `(project_id, tag_id)` — mirrors `project_favorites`'s `(user_id, project_id)` PK shape. A `text[]` column on `projects` was considered and rejected: it can't enforce consistent naming (case/whitespace drift produces near-duplicate tags), can't be indexed for exact-match filtering as cleanly as a join, and can't cheaply answer "what are all the tags in use" for the filter control's option list.

**D2 — Tag creation is implicit, via assignment, not a separate "manage tags" screen.**
`PUT /api/v1/projects/{key}/tags/{tagName}`-style assignment (exact route decided in tasks) creates the `tags` row if it doesn't already exist (case-insensitive match, stored normalized-lowercase, displayed as typed... resolved to: store and match lowercase, since displaying inconsistent casing for the same tag across projects would undermine the "shared vocabulary" goal). This keeps the feature additive-only for v1, consistent with the Non-Goal on tag management UI. Removing the last project's assignment of a tag leaves the now-unused `tags` row in place rather than garbage-collecting it — cheap to keep, and it means the tag stays offered in the filter/picker for reuse.

**D3 — Tags join the summaries assembly as a fifth grouped query, same shape as favorites.**
`SELECT project_id, tags.name FROM project_tags JOIN tags ...` for all non-archived projects in one query, grouped into a `map[projectID][]string` in Go, same as the existing favorites-ID-set pattern at `projects.go:393`. No N+1, no change to the query count contract `project-stats` establishes.

**D4 — Permission bar matches `project-favorites` exactly: `read` or Tenant Admin, not project-admin-only.**
Tags are organizational, not a project-configuration concern; requiring a higher bar than starring (a comparable "personal organization" action) would be inconsistent for no real security reason. Removing a tag a *different* user assigned is allowed at this same bar (tags are shared state, not per-user like favorites) — the risk is nuisance re-tagging, not data exposure, and mirrors how any Contributor+ can already edit shared project metadata.

## Risks / Trade-offs

- **[Risk]** Case/whitespace variants ("Mobile" vs "mobile ") silently create the intended single tag due to normalization, which could surprise a user who typed exact casing expecting it preserved. → **Mitigation**: document the normalization in the tag picker's placeholder/help text; not worth a settings toggle for v1.
- **[Risk]** Unused tags accumulate in the vocabulary table over time (D2's no-garbage-collection choice). → **Mitigation**: acceptable at expected scale (tens to low hundreds of tags); a "manage tags" cleanup screen is a natural, separate future backlog item if it ever matters.
- **[Trade-off]** No tag colors or descriptions in v1 — chips render as plain neutral-styled labels, consistent with the "organization, not decoration" scope in the Why.

## Migration Plan

New migration `00008_project_tags.sql` (next after `00007_jira_link_fields.sql`), additive-only: two new tables, no changes to existing ones. No backfill needed — an empty vocabulary is a valid starting state (no projects tagged). Rollback is drop-the-two-tables, but per the project's standing migration policy this file is never edited in place once merged; a future change would add a new migration to undo it if ever needed.

## Open Questions

- Exact tag-assignment route shape (`PUT/DELETE /api/v1/projects/{key}/tags/{tagName}` vs a body-based `PATCH` with a full tag list) — resolved during `tasks.md`/implementation to whichever reads more consistently with existing project-scoped routes in `handlers.go`.
