## ADDED Requirements

### Requirement: Import request may carry attachments keyed by case key
An import request MAY include image attachments alongside the JUnit XML report, each naming the case key of the test it belongs to (see `run-result-attachments`). The system SHALL NOT parse the JUnit XML report itself for embedded attachments — the report stays a plain text field, and attachments MUST travel as a separate field in the same request.

#### Scenario: An import's attachments are not read from the report XML
- **WHEN** a JUnit XML report contains data resembling an attachment convention from another tool (e.g. base64 image data in `<system-out>`)
- **THEN** it is ignored — only the request's separate attachments field is used to create attachments
