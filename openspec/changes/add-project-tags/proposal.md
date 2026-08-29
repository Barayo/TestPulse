## Why

As a user managing many projects, when I look at the project list, I want to group and filter projects by a label I chose (e.g. "mobile", "internal", "client-x") — instead every project reads identically apart from name and health, so finding a subset means scanning the whole list by eye. This was scoped out of `enrich-project-list`'s card redesign as a real, separate feature (GH #28), not a card-decoration tweak.

## What Changes

- A shared, instance-wide tag vocabulary: any tag name assigned to one project is reusable on others (not per-project free text), so the same tag filters consistently across the list.
- Any user with `read` permission on a project, or a Tenant Admin, can assign/remove tags on that project — same permission bar as starring it (`project-favorites`).
- Tags are returned in the already-batched `GET /api/v1/projects/summaries` response — no new per-project request.
- Project list UI: tag chips on the expanded card, a tag picker on the create/edit form, and a filter-by-tag control next to the existing status filter chips in compact view.
- Sample Project showcases at least one tag so the feature is visible without any manual setup.

## Capabilities

### New Capabilities
- `project-tags`: a shared tag vocabulary, per-project tag assignment, and tag state surfaced in the project summaries response.

### Modified Capabilities
- `ui-navigation`: the "Project list with permission-ready create action" requirement gains tag chips on the expanded card and a filter-by-tag control in compact view.
- `sample-data`: the "Sample Project content demonstrates core capabilities" requirement gains a scenario showing the Sample Project carries at least one tag.

## Impact

- **Domain/DB**: new `tags` vocabulary table + `project_tags` many-to-many join (mirrors `project_favorites`'s shape), new migration file.
- **API**: new endpoints to create/list tags and assign/remove a tag on a project; `GET /api/v1/projects/summaries` response gains a `tags` field per project.
- **Web**: `ProjectsPage` (card tag chips, filter-by-tag control), project create/edit form (tag picker).
- **Docs**: `docs/*` project-management page(s) documenting tags; `ROADMAP.md` backlog entry.
- **Sample data**: `apps/api/internal/sampledata/seed.go` assigns a tag to the Sample Project.
