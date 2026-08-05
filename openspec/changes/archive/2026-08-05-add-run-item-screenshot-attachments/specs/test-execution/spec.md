## ADDED Requirements

### Requirement: A result may carry attachments
A result MAY additionally carry zero or more image attachments (`run-result-attachments`), alongside its existing actor, verdict, comment, and execution metadata. Attachments SHALL NOT change how a verdict is recorded or how the item's current status is derived.

#### Scenario: A result with an attachment records normally
- **WHEN** a user records a verdict with one attached screenshot
- **THEN** the result is recorded exactly as it would be without the attachment, with the image additionally visible in its history entry

#### Scenario: A result without any attachment is unaffected
- **WHEN** a user records a verdict without attaching anything
- **THEN** the result behaves exactly as it did before this capability existed
