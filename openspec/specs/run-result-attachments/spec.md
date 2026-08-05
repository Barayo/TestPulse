# run-result-attachments Specification

## Purpose
TBD - created by archiving change add-run-item-screenshot-attachments. Update Purpose after archive.
## Requirements
### Requirement: Manual attachment upload
The system SHALL let an actor with `runRecordResult` permission on a run item's project upload an image (PNG, JPEG, or WebP, up to 5MB) as an attachment, either staged against the run item before any verdict has been recorded, or directly against an already-recorded result. The system SHALL NOT resize, crop, or otherwise transform an uploaded attachment image.

#### Scenario: Staging an attachment before a verdict exists
- **WHEN** an actor with `runRecordResult` permission uploads an image to a pending run item that has no recorded result yet
- **THEN** the attachment is stored and returned with an id, not yet linked to any result

#### Scenario: Attaching directly to an existing result
- **WHEN** an actor with `runRecordResult` permission uploads an image against a run item's already-recorded result
- **THEN** the attachment is stored, linked to that result immediately, and appears in the item's result history

#### Scenario: Oversized file rejected
- **WHEN** an upload exceeds 5MB
- **THEN** the request is rejected with a validation error, and no attachment is stored

#### Scenario: Unsupported file type rejected
- **WHEN** an upload is not a PNG, JPEG, or WebP image
- **THEN** the request is rejected with a validation error, and no attachment is stored

#### Scenario: A permission that doesn't include runRecordResult cannot upload an attachment
- **WHEN** an actor whose effective permissions on the project do not include `runRecordResult` attempts to upload an attachment
- **THEN** the request is rejected with `403`

### Requirement: Linking staged attachments when recording a verdict
Recording a result MAY reference previously staged attachment ids belonging to the same run item; when it does, the system SHALL link those attachments to the newly created result as part of the same request, and SHALL reject the request if any referenced attachment id was staged against a different run item.

#### Scenario: Staged attachments link to the recorded result
- **WHEN** a user stages two attachments against a pending item and then records a verdict referencing both attachment ids
- **THEN** the recorded result's history entry shows both attachments, and they are no longer unlinked

#### Scenario: A staged attachment from a different item cannot be linked
- **WHEN** a request to record a result references an attachment id that was staged against a different run item
- **THEN** the request is rejected with a validation error, and no result is recorded

### Requirement: Atomic attachment creation
Recording a result and importing test results MAY each include inline, base64-encoded image attachments in the same request. When present, the system SHALL create the result(s) and their attachments in the same transaction, so a client with attachment bytes already in hand never needs a second request to attach them, and never observes a result that exists without the evidence it was submitted with.

#### Scenario: Recording a result with inline attachments
- **WHEN** an actor records a verdict and includes one inline image attachment in the same request
- **THEN** the result and its attachment are created together, and the attachment appears in the item's result history immediately

#### Scenario: Importing with inline attachments keyed by case key
- **WHEN** an import request includes the JUnit XML report and one or more inline attachments, each naming the case key of the test it belongs to
- **THEN** every attachment whose case key matches a test that was successfully matched to an existing case is created and linked to that test's result, in the same operation as the import

#### Scenario: An unmatched test's attachments are dropped, not orphaned
- **WHEN** an import request includes an inline attachment naming a case key that has no matching case in the target project
- **THEN** the import still succeeds as usual for the matched tests, and that attachment is not stored — consistent with unmatched tests never leaving partial artifacts behind

### Requirement: Viewing attachments
A run item's result history SHALL display each result's attached images as a thumbnail strip showing up to three thumbnails plus an overflow count of any additional attachments, and SHALL open a full-size view when a thumbnail is activated, showing the image alongside the attaching actor, the result's verdict, and its timestamp. A result with no attachments SHALL display the same as it did before this capability existed — no empty gallery placeholder or broken-looking affordance.

#### Scenario: Thumbnail strip with overflow
- **WHEN** a result has six attachments
- **THEN** the history entry shows three thumbnails and an indicator of three more, rather than growing the strip indefinitely

#### Scenario: Opening the full-size view
- **WHEN** a user activates a thumbnail
- **THEN** a full-size view of that image opens, showing the attaching actor, verdict, and timestamp

#### Scenario: Navigating between a result's attachments
- **WHEN** a user is viewing one of a result's several attachments in the full-size view
- **THEN** the user can move to the next or previous attachment without closing and reopening the view

#### Scenario: A result with zero attachments looks ordinary
- **WHEN** a run item's result (including one produced by import) has no attachments
- **THEN** its history entry renders exactly as it did before this capability existed, with no placeholder or indication that something is missing

### Requirement: Serving and deleting attachments
The system SHALL let any actor with `read` permission on a run item's project retrieve an attachment's image bytes, and SHALL let an actor with `runRecordResult` permission on the project delete an attachment.

#### Scenario: Retrieving attachment bytes
- **WHEN** an actor with `read` permission requests a specific attachment
- **THEN** the image bytes and content type are returned

#### Scenario: Deleting an attachment
- **WHEN** an actor with `runRecordResult` permission deletes an attachment
- **THEN** the attachment no longer appears in its result's history and can no longer be retrieved

#### Scenario: Deleting an attachment requires permission
- **WHEN** an actor without `runRecordResult` permission attempts to delete an attachment
- **THEN** the request is rejected with `403`, and the attachment remains

