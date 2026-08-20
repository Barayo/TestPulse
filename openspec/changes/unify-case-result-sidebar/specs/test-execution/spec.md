## MODIFIED Requirements

### Requirement: Run item detail page
The web UI SHALL provide a dedicated page per run item, reached from the
run execution board, showing the pinned case version's steps and expected
result, item properties (status, test name, platform, priority, test type,
automation status, tags, pinned version, assignee, and a link to the item's
test case), a cross-run "Results" section showing the case's recent
execution history across all runs (the same success-rate-and-bars panel
shown on the test case's own detail page), and a "This run" section listing
only the results recorded on this specific item. The assignee property
SHALL be shown as "Unassigned" when absent, and SHALL offer an "Assign
to…" control matching the one on the board. When the run is open and the
viewer has `runRecordResult` permission, the page SHALL provide controls
to record a verdict with an optional comment. When the run is closed, the
page SHALL show the item read-only instead of these controls. The page's
breadcrumb SHALL end at the run, not repeat the item's own heading. When
the run is open and the viewer has `runRecordResult` permission, the page
SHALL also support single-key verdict recording: `P` records `pass`, `F`
records `failed`, `B` records `blocked`, `S` records `skipped`, and `R`
marks the item for retest when its current status is `failed` (mirroring
the on-screen buttons' own visibility rule). Recording a verdict via a
keyboard shortcut SHALL then navigate to the next `pending` item in the
run's item order, searching forward from the current item only; if none
remains, the app SHALL navigate back to the run execution board instead.
The existing on-screen verdict buttons SHALL retain their current
behavior — recording the result and remaining on the item's page — and
SHALL NOT auto-advance. The page SHALL also support `j`/`k` (or the
equivalent arrow keys) to navigate to the previous/next item in the run's
item order regardless of status, without returning to the board first. A
persistent shortcuts hint SHALL be visible on the page, omitting the
retest key when the item isn't `failed`, and pressing `?` SHALL open an
overlay listing every available shortcut. Keyboard shortcuts SHALL be
ignored while a text input, textarea, or other editable element (including
the comment field and the actor-override field) has focus.

#### Scenario: Execute a case from its detail page
- **WHEN** a user with `runRecordResult` permission opens a pending
  item's page on an open run, reviews its steps, and records verdict
  `pass` with a comment
- **THEN** the item's status updates to `pass` and the result appears in
  the item's "This run" section

#### Scenario: Item page shows and updates the assignee
- **WHEN** a user opens an item's page and uses its "Assign to…" control
  to assign it to "ana"
- **THEN** the Properties panel shows "ana" as the assignee without a
  full page reload, the same as assigning from the board

#### Scenario: Board shows pinned content
- **WHEN** a case was edited after the run was created
- **THEN** the item's page shows the pinned (older) version's content
  with a hint that a newer version exists

#### Scenario: Pinned version renders as a labeled property
- **WHEN** a tester views a run item's page
- **THEN** the pinned version is shown as a labeled `Pinned version: v{n}`
  property in the sidebar, not as an unlabeled sentence

#### Scenario: Closed run shows the item read-only
- **WHEN** a user opens an item's page on a closed run
- **THEN** verdict-recording controls are not shown, and the item's
  content, Results, and "This run" sections are visible read-only

#### Scenario: Item page breadcrumb does not repeat the item's own heading
- **WHEN** a user opens a run item's page
- **THEN** the breadcrumb ends at the run, and the item's identifying
  content appears only in the page's own heading, not as a trailing
  breadcrumb segment

#### Scenario: Single key records a verdict
- **WHEN** a user with `runRecordResult` permission presses `F` on a
  pending item's page
- **THEN** a result with verdict `failed` is recorded, the same as
  clicking the "Failed" button

#### Scenario: Recording a verdict via keyboard auto-advances to the next pending item
- **WHEN** a user presses a verdict key on an item that has a later
  `pending` item in the run
- **THEN** the app navigates to that next pending item's page

#### Scenario: Recording the last pending item's verdict via keyboard returns to the board
- **WHEN** a user presses a verdict key on the only remaining `pending`
  item in the run
- **THEN** the app navigates back to the run execution board

#### Scenario: The on-screen verdict buttons do not auto-advance
- **WHEN** a user clicks the "Pass" (or Failed/Blocked/Skipped) button
  instead of using its keyboard shortcut
- **THEN** the result is recorded and the user remains on the item's page,
  the same as before this capability existed

#### Scenario: Retest key only fires when the item is failed
- **WHEN** a user presses `R` on an item whose current status is not
  `failed`
- **THEN** no action is taken, and the shortcuts hint does not list `R`
  for that item

#### Scenario: j/k moves between items regardless of status
- **WHEN** a user presses `k` on an item's page
- **THEN** the app navigates to the previous item in the run's item
  order, even if that item already has a recorded verdict

#### Scenario: Keyboard shortcuts are disabled while typing
- **WHEN** the comment field or the actor-override field has focus
- **THEN** pressing `P`, `F`, `B`, `S`, `R`, `J`, or `K` types into that
  field instead of recording a verdict or navigating

#### Scenario: Shortcuts overlay lists every available key
- **WHEN** a user presses `?` on the item page
- **THEN** an overlay opens listing the page's keyboard shortcuts,
  dismissible with `Escape` or `?`

#### Scenario: Item page links to its test case
- **WHEN** a user views a run item's page
- **THEN** the Properties panel shows a "Test case" property linking to
  that case's own detail page, identified by its case key

#### Scenario: Item page shows the case's cross-run Results
- **WHEN** a user views a run item's page for a case that has been
  executed in other runs before
- **THEN** the Results section shows the same success-rate-and-bars
  summary the case's own detail page shows, covering executions across
  all runs, not just this one

#### Scenario: This run section only lists this item's own results
- **WHEN** a case has execution history from other runs as well as this
  one
- **THEN** the "This run" section lists only the results recorded on this
  specific run item, while the cross-run history appears solely in the
  Results section above it
