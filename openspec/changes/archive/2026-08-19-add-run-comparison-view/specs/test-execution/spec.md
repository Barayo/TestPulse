## ADDED Requirements

### Requirement: Comparing two runs
The system SHALL let a user query a categorized comparison between two closed runs
from the same project, joined by case key. A case whose verdict went from `pass` to
`failed` or `blocked` SHALL be categorized as regressed; from `failed` or `blocked` to
`pass` SHALL be categorized as improved; present in both runs with any other pairing of
statuses SHALL be categorized as unchanged; present only in the newer run SHALL be
categorized as added; present only in the older run SHALL be categorized as removed.
"Older" and "newer" SHALL be determined by each run's creation time, independent of the
order the two run keys are supplied in. Comparing an open run, or two runs from
different projects, SHALL be rejected.

#### Scenario: A case that regressed is categorized correctly
- **WHEN** a case's verdict is `pass` in the older run and `failed` (or `blocked`) in the newer run
- **THEN** the comparison lists that case under regressed

#### Scenario: A case that improved is categorized correctly
- **WHEN** a case's verdict is `failed` or `blocked` in the older run and `pass` in the newer run
- **THEN** the comparison lists that case under improved

#### Scenario: A case with the same verdict in both runs is unchanged
- **WHEN** a case has the same verdict, or any pairing other than the regressed/improved transitions, in both runs
- **THEN** the comparison lists that case under unchanged

#### Scenario: A case only in the newer run is added
- **WHEN** a case appears in the newer run's items but not the older run's
- **THEN** the comparison lists that case under added, with no older-run status

#### Scenario: A case only in the older run is removed
- **WHEN** a case appears in the older run's items but not the newer run's
- **THEN** the comparison lists that case under removed, with no newer-run status

#### Scenario: Run order in the request doesn't affect older/newer categorization
- **WHEN** a comparison request supplies the newer run's key before the older run's key
- **THEN** the response still categorizes by actual creation time, not request order

#### Scenario: Comparing an open run is rejected
- **WHEN** a comparison is requested where either run is still open
- **THEN** the request is rejected

#### Scenario: Comparing runs from different projects is rejected
- **WHEN** a comparison is requested for two runs belonging to different projects
- **THEN** the request is rejected
