# parameterized-cases

## Purpose

Data-driven test cases: a Steps-format case can define a parameter table
(a required `Name` column plus any number of author-defined columns and
rows) instead of hand-duplicating near-identical cases for every data
variation. Step text may reference `{columnName}` placeholders, validated
at save time; adding a parameterized case to a run expands it into one Run
Item per row, with placeholders substituted server-side.

## Requirements

### Requirement: A Steps-format case may define a parameter table
A Steps-format `CaseContent` MAY carry a `Parameters` table: a required
first column literally named `Name`, plus any number of author-defined
columns, and any number of rows (each row a value per column). A case with
no rows (the default) behaves exactly as a case without this capability at
all — no validation applies, and no step text is substituted. Row `Name`
values MUST be unique within a case's parameter table.

#### Scenario: A case with no rows is unaffected
- **WHEN** a Steps-format case is created or edited with no parameter rows
- **THEN** the case behaves exactly as it did before this capability existed

#### Scenario: Adding the first row makes a case parameterized
- **WHEN** a user with `caseEdit` permission adds one row to a case's parameter table
- **THEN** the case is saved with that row, with no separate flag or toggle required

#### Scenario: Duplicate row names are rejected
- **WHEN** a user attempts to save a case whose parameter table has two rows sharing the same `Name` value
- **THEN** the request is rejected with a validation error

#### Scenario: Parameters are rejected on non-Steps formats
- **WHEN** a user attempts to save a case with `format` other than `steps` and a non-empty parameter table
- **THEN** the request is rejected with a validation error

### Requirement: Step text may reference parameter columns, validated at save time
A step's `action` or `expected` text MAY contain `{columnName}` placeholders
referencing the case's parameter table columns. Whenever the case's
parameter table has at least one row, every placeholder used in any step
MUST match a real column name, or the save is rejected naming the
unmatched placeholder. A case with zero parameter rows is exempt from this
validation — literal `{...}` text in its steps is inert.

#### Scenario: A placeholder matching a real column is accepted
- **WHEN** a user saves a case whose parameter table has a `username` column and a step reading "Enter {username}"
- **THEN** the case is saved successfully

#### Scenario: A placeholder with no matching column is rejected
- **WHEN** a user saves a case whose parameter table has no `username` column but a step reads "Enter {username}"
- **THEN** the request is rejected with a validation error naming `username`

#### Scenario: Literal braces are inert on a non-parameterized case
- **WHEN** a user saves a case with no parameter rows and step text containing `{anything}`
- **THEN** the case is saved successfully, with the text stored and displayed exactly as written

### Requirement: Adding a parameterized case to a run expands to one Run Item per row
Adding a parameterized case (one with at least one parameter row) to a run
— via an explicit case list, a suite, or adding a single case to an
already-open run — SHALL create one Run Item per row, each pinning the same
case version. Each such Run Item's `testName` SHALL be set to that row's
`Name` value. Each such Run Item's step `action`/`expected` text SHALL be
substituted with that row's values, and its `testDataRow` SHALL carry that
row's values (excluding `Name`). A case with zero parameter rows continues
to produce exactly one Run Item, exactly as before this capability existed.

#### Scenario: A 3-row parameterized case creates 3 run items
- **WHEN** a case with 3 parameter rows is added to a run
- **THEN** 3 Run Items are created, each pinning that case version, each with a distinct `testName` matching its row's `Name`

#### Scenario: A non-parameterized case still creates exactly one run item
- **WHEN** a case with no parameter rows is added to a run
- **THEN** exactly one Run Item is created, with no `testDataRow` and `testName` empty, unchanged from today's behavior

#### Scenario: A run item's steps are substituted with its row's values
- **WHEN** a run item was created from a parameterized case's row where `username` = `admin@example.com`
- **THEN** any step reading "Enter {username}" is shown as "Enter admin@example.com" on that run item, and the pinned case's own detail page still shows the unsubstituted `{username}` template

#### Scenario: A run item exposes its row's data
- **WHEN** a run item was created from a parameterized case's row with columns beyond `Name`
- **THEN** the run item's `testDataRow` contains those columns' values for that row
