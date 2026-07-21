## ADDED Requirements

### Requirement: Project key generation
Every project SHALL be assigned a `key` at creation time: a short, uppercase, alphanumeric identifier auto-derived from the project's name, unique across all projects, and never editable afterward — renaming a project MUST NOT change its key.

#### Scenario: Key is derived from a multi-word name
- **WHEN** a project is created with a multi-word name such as "Customer Payments Api"
- **THEN** its key is formed from the initial letters of each word, uppercased (e.g. "CPA")

#### Scenario: Key is derived from a single-word name
- **WHEN** a project is created with a single-word name such as "Checkout"
- **THEN** its key is formed from the first letters of that word, uppercased, capped at a short fixed length

#### Scenario: Key collisions are disambiguated
- **WHEN** a project is created whose derived key already belongs to another project
- **THEN** a numeric suffix is appended until the key is unique, and the project is created successfully

#### Scenario: Renaming a project does not change its key
- **WHEN** an existing project is renamed
- **THEN** its key remains exactly as it was assigned at creation

### Requirement: Case, run, and suite key generation
Every test case, run, and suite SHALL be assigned a `key` at creation time, scoped to its project: a per-project, per-entity-type sequential number rendered with its owning project's key as a prefix — bare (`{projectKey}-{n}`) for cases, with an `R` infix (`{projectKey}-R{n}`) for runs, and with an `S` infix (`{projectKey}-S{n}`) for suites. Keys are never editable and never reused.

#### Scenario: First case in a project
- **WHEN** the first test case is created in a project whose key is "LOGIN"
- **THEN** the case's key is "LOGIN-1"

#### Scenario: Sequential numbering within a project
- **WHEN** a second test case is created in the same project
- **THEN** its key is "LOGIN-2", regardless of how many cases exist in other projects

#### Scenario: Runs and suites use their own counters
- **WHEN** a project has one existing case and no runs or suites yet, and a run is then created
- **THEN** the run's key is "LOGIN-R1", not "LOGIN-2" — each entity type counts independently within the project

#### Scenario: Concurrent creation yields distinct keys
- **WHEN** two test cases are created in the same project at nearly the same time
- **THEN** each receives a distinct, sequential key — neither is skipped or duplicated

### Requirement: Entity responses expose both id and key
API responses for a project, test case, run, or suite SHALL include both `id` (the stable internal identifier) and `key` (the human-readable identifier). Nothing that currently relies on `id` SHALL be affected by the presence of `key`.

#### Scenario: Both identifiers are present
- **WHEN** a client requests a test case
- **THEN** the response includes both its `id` and its `key`

### Requirement: API resources are addressed by key at the boundary
Path parameters identifying a project, test case, run, or suite in the API SHALL accept that resource's `key`, not its internal `id`. A key that does not match any existing resource of that type SHALL respond as not-found, the same as an unrecognized id would today. Folder identifiers are unaffected by this requirement and remain addressed by their internal id.

#### Scenario: Fetching a resource by its key
- **WHEN** a client requests a test case using its key in the path
- **THEN** the matching case is returned, resolved internally to its underlying id

#### Scenario: Unknown key is not found
- **WHEN** a client requests a resource using a key that does not exist
- **THEN** the response is a not-found error, the same as for any other unresolved identifier
