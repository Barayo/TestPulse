## ADDED Requirements

### Requirement: Suite detail run history is capped

The Suite Detail page's "Run history" list SHALL render with the same
bounded-DOM-rows and "Show N more" expansion behavior as every other run
list in the app (`RunSection`'s `SECTION_CAP` of 10), rather than rendering
every run for the suite unconditionally. This closes a gap specific to this
page's own list, which predates the capping behavior other run lists
already have.

#### Scenario: Run history caps at 10 with an expand control
- **WHEN** a suite has more than 10 runs
- **THEN** the Run history list shows only the 10 most recent and a "Show N more runs" control, matching the wording and behavior of the Runs page's own capped sections

#### Scenario: Expanding reveals the rest
- **WHEN** a user activates "Show N more runs" on the Suite Detail page
- **THEN** the remaining runs render inline without navigating away from the page

#### Scenario: A suite with 10 or fewer runs shows no expand control
- **WHEN** a suite has 10 or fewer runs
- **THEN** all of its runs render with no "Show more" control, since there is nothing left to reveal
