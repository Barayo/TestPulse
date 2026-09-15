## ADDED Requirements

### Requirement: A user with caseCreate permission can import cases from a CSV file into a target folder
The system SHALL let a user with `caseCreate` permission on a project upload a CSV file (`POST /projects/{projectKey}/cases/import-csv`) naming a target `folderId`, creating one TestPulse case per valid data row in that folder. A row that fails validation (missing required `Title`, or an invalid `Priority`/`Automated` value) SHALL NOT be imported and SHALL NOT abort the rest of the file — every other valid row in the same file SHALL still be imported.

#### Scenario: A CSV with all valid rows imports every row
- **WHEN** a user with `caseCreate` permission uploads a CSV where every row has a non-empty `Title`
- **THEN** one TestPulse case is created per row, in the specified target folder

#### Scenario: An invalid row is skipped without aborting the rest of the file
- **WHEN** a CSV file has one row with an empty `Title` among otherwise-valid rows
- **THEN** every valid row is imported and the invalid row is not, and the response reports the invalid row's number and reason

#### Scenario: A user without caseCreate cannot import
- **WHEN** a user whose effective permissions on a project do not include `caseCreate` attempts to import a CSV
- **THEN** the request is rejected with `403`

### Requirement: Every unimportable CSV row is named individually in the import response, never silently dropped
The import response SHALL name every row that was not imported, by its row number (the header row counts as row 1, matching what a spreadsheet tool itself would show) and the specific reason it failed, alongside the count of rows that were successfully created. Failed rows SHALL never be omitted, truncated, or collapsed into a summary count.

#### Scenario: The import response names every failed row explicitly
- **WHEN** a CSV import completes with some rows imported and others failed
- **THEN** the response includes the created count and, for every failed row, its row number and failure reason — none omitted

### Requirement: An unrecognized CSV column is created as a text-type project custom field on first encounter
A CSV header that does not match one of the fixed core columns (`Title`, `Description`, `Expected Result`, `Priority`, `Tags`, `Platform`, `Test Type`, `Automated`) SHALL be treated as a project custom field. If no custom field with that name already exists on the project, one SHALL be created as `text` type before any row is imported. If a custom field with that name already exists, its existing type and options govern validation of that column's values — a value that doesn't match an existing `select` field's options SHALL fail that row, not silently create a new option.

#### Scenario: A new column becomes a text custom field
- **WHEN** a CSV includes a column header that doesn't match any fixed core column or existing project custom field
- **THEN** a new `text`-type custom field is created with that column's header as its name, and its values are populated on the imported cases

#### Scenario: A column matching an existing select field validates against its options
- **WHEN** a CSV column's header matches an existing `select`-type custom field, and a row's value for that column doesn't match any of that field's defined options
- **THEN** that row fails import and is named in the response, and no new option is silently added to the field

### Requirement: A user with read permission can export a project's or folder's cases to CSV
The system SHALL let a user with read permission on a project download its cases as a CSV file (`GET /projects/{projectKey}/cases/export-csv`), optionally scoped to one folder via a `folderId` query parameter. The exported file SHALL use the same fixed core columns as import accepts, followed by one column per the project's defined custom fields in their existing display order.

#### Scenario: Exporting a whole project
- **WHEN** a user with read permission requests an export with no `folderId`
- **THEN** every case in the project is included in the resulting CSV

#### Scenario: Exporting a single folder
- **WHEN** a user with read permission requests an export with a `folderId`
- **THEN** only cases in that folder are included in the resulting CSV

#### Scenario: Export and re-import round-trips
- **WHEN** a project's cases are exported to CSV and that unmodified file is re-imported into a new folder
- **THEN** the same number of cases is created, each with the same title, description, expected result, priority, tags, platform, test type, automation flag, and custom field values as the originally exported case
