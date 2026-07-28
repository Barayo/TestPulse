## ADDED Requirements

### Requirement: Entity icon vocabulary is applied consistently
Where the app already pairs an entity type with an icon (Section: folder,
Test Case: file-text, Suite: layers, Run: circle-play), every reference to
that entity type SHALL use the same icon — a page SHALL NOT show a
different entity's icon next to a label naming this one.

#### Scenario: A run's suite link uses the Suite icon
- **WHEN** a user views a run's detail page for a run created from a suite
- **THEN** the "From suite: …" link shows the Suite (layers) icon, not the Section (folder) icon

#### Scenario: Suites list rows show the Suite icon
- **WHEN** a user views the Suites index
- **THEN** each suite row shows the Suite (layers) icon, matching the icon treatment already used on Library rows

#### Scenario: The onboarding checklist's case step uses the Case icon
- **WHEN** a user views an empty project's getting-started checklist
- **THEN** the "Add your first test case" step shows the Test Case (file-text) icon, not the Section (folder) icon
