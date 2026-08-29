## MODIFIED Requirements

### Requirement: Sample Project content demonstrates core capabilities
The Sample Project SHALL contain, at creation: at least five sections with test cases carrying varied classification fields (priority spanning all four levels, tags, platform, testType, automated); at least four suites; an open run with recorded verdicts; a closed run; a run created via JUnit-XML import including at least one unmatched case; and at least one case with more than one version. The chronologically last-created run SHALL have a pass rate of at least 85%, so the project's health indicator shows its healthy state. The Sample Project itself SHALL carry at least one project-level tag, so the project-tags feature is visible without any manual setup.

#### Scenario: Sample Project has an open and a closed run
- **WHEN** the Sample Project is seeded
- **THEN** it contains at least one run with status `open` and at least one with status `closed`

#### Scenario: Sample Project demonstrates JUnit-XML import
- **WHEN** the Sample Project is seeded
- **THEN** it contains a run created via import, and the import's response included at least one unmatched case key

#### Scenario: Sample Project demonstrates case versioning
- **WHEN** the Sample Project is seeded
- **THEN** at least one of its cases has a current version greater than 1

#### Scenario: Sample Project has enough sections, cases, and suites to look real
- **WHEN** the Sample Project is seeded
- **THEN** it contains at least five sections, at least four suites, and enough cases to populate them with varied classification fields covering every priority level

#### Scenario: The most recent run shows a healthy pass rate
- **WHEN** the Sample Project is seeded
- **THEN** the chronologically last-created run has a pass rate of at least 85%

#### Scenario: Sample Project demonstrates project-level tags
- **WHEN** the Sample Project is seeded
- **THEN** it has at least one project-level tag assigned, visible on the project list
