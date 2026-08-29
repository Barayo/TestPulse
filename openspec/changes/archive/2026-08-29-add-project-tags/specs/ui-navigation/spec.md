## MODIFIED Requirements

### Requirement: Project list with permission-ready create action
Without an active project selected, the web UI SHALL show a list of all projects, with the create-project action and the empty-state call to action kept structurally separate from the list itself. The list SHALL render in one of two view modes, expanded or compact, chosen automatically from the project count and device, with a manual override always available. Each project SHALL show a status label derived from its pass rate, alongside the existing numeric value. A non-admin user who can see exactly one project SHALL be navigated directly into it instead of landing on the list. The list SHALL be orderable by name, suite count, case count, or creation date, in either direction, with the chosen order applied consistently across both view modes and within the pinned Favorites section. A project marked as the sample project SHALL show a "Sample" badge next to its name, in both view modes. The expanded view SHALL show each project's assigned tags as chips, and the compact view SHALL offer a filter-by-tag control alongside the existing status filter chips.

#### Scenario: Listing projects
- **WHEN** a user navigates to the project list with no project selected
- **THEN** every project is shown with its suite count, case count, and latest pass rate

#### Scenario: Single visible project skips the list for non-admins
- **WHEN** a non-admin user's project list contains exactly one project
- **THEN** the user is navigated directly to that project instead of seeing the list

#### Scenario: Admins always see the list, even with one project
- **WHEN** an admin's project list contains exactly one project
- **THEN** the admin still lands on the project list, not the project directly

#### Scenario: No projects yet
- **WHEN** there are no projects at all
- **THEN** an empty-state message is shown in place of the list, with its call to action rendered separately from where the list would be

#### Scenario: Small project counts default to the expanded view
- **WHEN** a desktop user has 10 or fewer projects and has not manually overridden the view
- **THEN** the list renders in expanded mode, with a pinned "Favorites" section for any starred projects

#### Scenario: Large project counts default to the compact view
- **WHEN** a desktop user has more than 10 projects and has not manually overridden the view
- **THEN** the list renders in compact mode

#### Scenario: Mobile always renders compact
- **WHEN** the list is viewed on a mobile-width viewport
- **THEN** it renders in compact mode regardless of project count or any manual override choice made previously on desktop

#### Scenario: Manual view toggle overrides the automatic choice
- **WHEN** a desktop user toggles the view manually
- **THEN** the list renders in the chosen mode regardless of project count, until changed again

#### Scenario: Manual view choice persists across reloads
- **WHEN** a user manually toggles the view and later reloads the page in the same browser
- **THEN** the list renders in the previously chosen mode, not the automatic default

#### Scenario: Status label matches the pass-rate band
- **WHEN** a project's pass rate is 84%
- **THEN** its status label reads "Healthy", matching the same band `HealthBar` colors teal

#### Scenario: Searching filters by name
- **WHEN** a user types part of a project's name into the search field
- **THEN** only projects whose name contains that text remain visible

#### Scenario: Filtering by status
- **WHEN** a user selects the "At risk" status filter
- **THEN** only projects whose status label is "At risk" remain visible

#### Scenario: Default sort order
- **WHEN** a user opens the project list with no prior sort preference stored
- **THEN** projects are ordered by name, ascending

#### Scenario: Sorting by a numeric key uses its sensible default direction
- **WHEN** a user selects "Suites" or "Cases" as the sort key for the first time
- **THEN** the list orders with the highest count first, without the user needing to also toggle direction

#### Scenario: Toggling sort direction
- **WHEN** a user toggles the sort direction control for the current sort key
- **THEN** the list re-orders to the opposite direction for that key

#### Scenario: Sort order applies within Favorites too
- **WHEN** a user changes the sort order in expanded view with starred projects present
- **THEN** the Favorites section and the main list both reflect the new order, not just one of them

#### Scenario: Sort preference persists across reloads
- **WHEN** a user chooses a sort key and direction and later reloads the page in the same browser
- **THEN** the list renders with the previously chosen sort, not the default

#### Scenario: Sort control is available on mobile
- **WHEN** the list is viewed on a mobile-width viewport
- **THEN** the sort control remains visible and usable, unlike the view-mode toggle which is desktop-only

#### Scenario: Sample Project shows a badge
- **WHEN** the project list includes the sample project
- **THEN** its row shows a "Sample" badge next to its name, in both expanded and compact view

#### Scenario: Non-sample projects show no badge
- **WHEN** the project list includes projects that are not the sample project
- **THEN** their rows show no "Sample" badge

#### Scenario: Expanded card shows tag chips
- **WHEN** a project has one or more tags assigned and the list renders in expanded view
- **THEN** its card shows a chip for each assigned tag

#### Scenario: Untagged project shows no tag chips
- **WHEN** a project has no tags assigned
- **THEN** its card shows no tag chips, in either view mode

#### Scenario: Filtering by tag in compact view
- **WHEN** a user selects a tag from the compact view's filter-by-tag control
- **THEN** only projects with that tag assigned remain visible

#### Scenario: Tag and status filters compose
- **WHEN** a user has both a status filter and a tag filter active
- **THEN** only projects matching both filters remain visible
