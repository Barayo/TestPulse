## ADDED Requirements

### Requirement: The instance has a Tenant-Admin-configurable default landing view
The system SHALL provide an instance-wide default landing view setting, one of "dashboard", "library", "suites", "runs", or "reports", defaulting to "dashboard". Only a Tenant Admin SHALL be able to change it.

#### Scenario: A Tenant Admin changes the instance default
- **WHEN** a Tenant Admin sets the instance's default landing view to "library" via Instance Settings
- **THEN** the setting is saved and any project without its own override now effectively lands on Library

#### Scenario: A non-Tenant-Admin cannot change the instance default
- **WHEN** a user who is not a Tenant Admin attempts to change the instance default landing view
- **THEN** the system rejects the change

### Requirement: A project may override the instance default landing view
The system SHALL allow a project to have its own landing view, one of "dashboard", "library", "suites", "runs", "reports", or unset (meaning it inherits the instance-wide default). A user with Project Admin permission (manageProject) on that project SHALL be able to set or clear it.

#### Scenario: A Project Admin sets a per-project override
- **WHEN** a Project Admin sets a project's landing view to "suites"
- **THEN** that project effectively lands on Suites regardless of the instance-wide default

#### Scenario: A project with no override inherits the instance default
- **WHEN** a project has no landing view override set
- **AND** the instance-wide default landing view is "reports"
- **THEN** that project effectively lands on Reports

#### Scenario: A user without Project Admin permission cannot change a project's override
- **WHEN** a user without manageProject permission on a project attempts to set its landing view override
- **THEN** the system rejects the change

### Requirement: Opening a project navigates to its effective landing view
The system SHALL resolve a project's effective landing view (its own override if set, else the instance-wide default) when its root project page is opened, and SHALL navigate to the corresponding view: the existing dashboard for "dashboard", or the Library, Suites, Runs, or Reports page for the other values. This resolution applies identically to project members, anonymous visitors, and public visitors.

#### Scenario: A project configured for Dashboard renders the existing dashboard
- **WHEN** a project's effective landing view is "dashboard"
- **THEN** opening that project renders the existing multi-panel dashboard, unchanged from today's behavior

#### Scenario: A project configured for a non-Dashboard view redirects there
- **WHEN** a project's effective landing view is "library", "suites", "runs", or "reports"
- **THEN** opening that project navigates to that view's own existing route, rendering the same page a direct visit to that route would
