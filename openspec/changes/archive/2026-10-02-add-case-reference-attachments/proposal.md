## Why

As a test case author, when I write a case that needs a reference screenshot, design mock, or spec document, I want to attach it directly to the case itself, so anyone executing it later has the context without hunting through a comment thread or an external link. Today TestPulse only supports attachments on run *results* (evidence of execution) — there is no way to attach reference material to a case's own definition.

## What Changes

- Add a new case-scoped attachment mechanism, independent of run-result attachments: `POST /cases/{caseKey}/attachments` (multipart upload), `GET /cases/{caseKey}/attachments` (list), `GET /case-attachments/{attachmentId}` (serve raw bytes), `DELETE /case-attachments/{attachmentId}`.
- Accept JPEG/PNG/WebP images, PDF documents, and plain-text files (.txt/.log), 5MB cap (same ceiling as run-result attachments). A new `attachmentfile` validation package extends the existing image-only `attachmentimage` validator with PDF support via magic-byte sniffing and text support via a UTF-8/no-NUL-byte heuristic (PDFs are never decoded/rendered server-side; text is never reformatted).
- Attachments belong to the case identity (`TestCase.ID`), not to a specific immutable `CaseVersion` snapshot — reference material stays attached across edits, the same way `JiraIssueKey` is identity-level metadata rather than versioned content.
- Case attachments are gated by `caseEdit`/`caseDelete` permissions for write operations and `read` for viewing/downloading, mirroring how the rest of a case's content is governed.
- Add an "Attachments" field to `CaseDetailPage.tsx`, alongside the existing Jira-link field, supporting drag/paste/click upload, image thumbnails, a file icon + filename for PDF/text files (opens in a new tab), and removal.
- Sample Project: attach at least one reference screenshot to a Sample Project case so the new field has content to show off.

## Capabilities

### New Capabilities
- `case-reference-attachments`: attaching, listing, viewing, and deleting reference files (images, PDFs) directly on a test case's identity, independent of run-result evidence attachments.

### Modified Capabilities
(none — this does not change the behavior of the existing `run-result-attachments` capability, it adds a parallel, independently-scoped mechanism)

## Impact

- **Backend**: new migration (`case_attachments` table), `domain.CaseAttachment`, new `attachmentfile` package (extends `attachmentimage`), new `CaseAttachmentRepo` (store), new `Service` methods, new handlers + routes, new `projectIDFromCaseAttachment` permission resolver.
- **API contract**: `packages/shared/openapi.yaml` — new paths and `CaseAttachment` schema; `make generate` regenerates the TS client.
- **Frontend**: new component for case-level attachments (image thumbnail + PDF file-chip variants), wired into `CaseDetailPage.tsx`.
- **Docs**: `docs/test-management.md` (case fields) gains a short section; `docs/api-reference.md` or equivalent if it enumerates attachment endpoints.
- **Sample Project**: `apps/api/internal/sampledata/seed.go` seeds one reference attachment on an existing case.
