## MODIFIED Requirements

### Requirement: Run open/closed lifecycle
Every run SHALL have a status, `open` or `closed`. Runs created via
`POST /runs` (an actor explicitly starting a run) are created `open`. Runs
created via bulk import are the one exception: they are created `closed`
from the start (see `execution-import`), since every item they contain
already carries a final verdict at creation time.

#### Scenario: New run starts open
- **WHEN** a run is created via `POST /runs`
- **THEN** its status is `open`

#### Scenario: New imported run starts closed
- **WHEN** a run is created via bulk import
- **THEN** its status is `closed`, per the import-specific requirement in
  `execution-import`
