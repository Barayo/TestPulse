## ADDED Requirements

### Requirement: Uploading a case reference attachment
The system SHALL let an actor with `caseEdit` permission on a case's project upload a reference attachment to that case — an image (PNG, JPEG, or WebP), a PDF document, or a plain-text file (.txt or .log), up to 5MB. The attachment SHALL belong to the case's identity, not to any specific `CaseVersion` — it remains attached and visible across subsequent edits, and uploading or removing an attachment SHALL NOT create a new case version.

#### Scenario: Uploading an image to a case
- **WHEN** an actor with `caseEdit` permission uploads a PNG image to a case
- **THEN** the attachment is stored and returned with an id, associated with the case

#### Scenario: Uploading a PDF to a case
- **WHEN** an actor with `caseEdit` permission uploads a PDF document to a case
- **THEN** the attachment is stored and returned with an id, associated with the case

#### Scenario: Uploading a text or log file to a case
- **WHEN** an actor with `caseEdit` permission uploads a .txt or .log file to a case
- **THEN** the attachment is stored and returned with an id, associated with the case

#### Scenario: Attachment survives a case edit
- **WHEN** a case with an existing attachment is edited, creating a new case version
- **THEN** the attachment remains associated with the case and is still retrievable, and the case's version history shows no entry for the attachment

#### Scenario: Oversized file rejected
- **WHEN** an upload to a case exceeds 5MB
- **THEN** the request is rejected with a validation error, and no attachment is stored

#### Scenario: Unsupported file type rejected
- **WHEN** an upload to a case is not a PNG, JPEG, WebP image, a PDF document, or a plain-text file
- **THEN** the request is rejected with a validation error, and no attachment is stored

#### Scenario: A permission that doesn't include caseEdit cannot upload a case attachment
- **WHEN** an actor whose effective permissions on the project do not include `caseEdit` attempts to upload a case attachment
- **THEN** the request is rejected with `403`

### Requirement: Listing, viewing, and deleting case attachments
The system SHALL let any actor with `read` permission on a case's project list that case's attachments and retrieve an attachment's bytes, and SHALL let an actor with `caseEdit` permission delete a case attachment.

#### Scenario: Listing a case's attachments
- **WHEN** an actor with `read` permission requests a case's attachment list
- **THEN** every attachment uploaded to that case is returned, each with its id, filename, and content type

#### Scenario: Retrieving case attachment bytes
- **WHEN** an actor with `read` permission requests a specific case attachment
- **THEN** the file bytes and content type are returned, with a PDF served so the browser renders it inline rather than forcing a download

#### Scenario: Deleting a case attachment
- **WHEN** an actor with `caseEdit` permission deletes a case attachment
- **THEN** the attachment no longer appears in the case's attachment list and can no longer be retrieved, and the deletion is recorded in the project's activity log

#### Scenario: Deleting a case attachment requires permission
- **WHEN** an actor without `caseEdit` permission attempts to delete a case attachment
- **THEN** the request is rejected with `403`, and the attachment remains

### Requirement: Viewing attachments on the case detail page
A case's detail page SHALL display its reference attachments alongside the case's other identity-level fields (such as its Jira link), showing image attachments as thumbnails and every non-image attachment (PDF, .txt, .log) as a filename with a file-type indicator, opening in a new tab when activated. A case with no attachments SHALL display the same as it did before this capability existed.

#### Scenario: Case with image, PDF, and text attachments
- **WHEN** a user views a case that has one image attachment, one PDF attachment, and one .log attachment
- **THEN** the image renders as a thumbnail, and the PDF and .log files each render as a labeled file chip, all in the case's Attachments field

#### Scenario: A case with zero attachments looks ordinary
- **WHEN** a user views a case with no attachments
- **THEN** the case detail page renders exactly as it did before this capability existed, with no placeholder or indication that something is missing

### Requirement: Case attachments are visible on public projects
For a project with public access enabled, the system SHALL let an unauthenticated visitor list that project's cases' attachments and retrieve an attachment's bytes, the same read-only visibility already granted to a case's content, version history, and execution history. Upload and delete SHALL remain unavailable on the public API regardless of project visibility.

#### Scenario: Anonymous visitor views a public case's attachments
- **WHEN** an unauthenticated visitor requests a case's attachment list or a specific attachment's bytes on a project with public access enabled
- **THEN** the attachments are returned, the same as for an authenticated actor with `read` permission

#### Scenario: Public API never exposes upload or delete
- **WHEN** an unauthenticated visitor attempts to upload or delete a case attachment on a public project
- **THEN** the request is rejected, since no such route exists on the public API
