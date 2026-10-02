## 1. Migration and domain model

- [x] 1.1 Add migration `apps/api/internal/db/migrations/00025_case_attachments.sql` creating `case_attachments (id uuid default gen_random_uuid(), case_id uuid not null, filename text not null, content_type text not null, image bytea not null, created_at timestamptz default now() not null)` with a primary key and an FK to `test_cases(id)`.
- [x] 1.2 Add `domain.CaseAttachment` struct (`ID`, `CaseID`, `Filename`, `ContentType`, `CreatedAt`) to `apps/api/internal/domain/domain.go`.

## 2. attachmentfile validation package

- [x] 2.1 Write failing test in `apps/api/internal/attachmentfile/validate_test.go`: a valid PNG passes and returns `image/png` (delegates to `attachmentimage`); a valid PDF (bytes starting `%PDF-`) passes and returns `application/pdf`; a valid `.txt`/`.log` (UTF-8 text, no NUL byte) passes and returns `text/plain`; an oversized file (>5MB) is rejected with `ErrTooLarge`; truly unsupported binary garbage is rejected with `ErrUnsupportedFormat`.
- [x] 2.2 Run the test, confirm it fails (package doesn't exist yet).
- [x] 2.3 Implement `apps/api/internal/attachmentfile/validate.go`: `MaxUploadBytes = 5 * 1024 * 1024`, `ErrTooLarge`/`ErrUnsupportedFormat`, `ValidateUpload(data []byte) (string, error)` — size check first, then try `attachmentimage.ValidateUpload`, then a `bytes.HasPrefix(data, []byte("%PDF-"))` check returning `"application/pdf"`, then a `looksLikeText` (valid UTF-8, no NUL byte) check returning `"text/plain"`.
- [x] 2.4 Run the test, confirm it passes.

## 3. Store layer

- [x] 3.1 Write failing test in `apps/api/internal/store/case_attachments_test.go` (DB-integration, gated on `TESTPULSE_TEST_DATABASE_URL`): `CaseAttachmentRepo.Create` stores an attachment against a case and returns it with an id; `ByCase` lists a case's attachments ordered by `created_at, id`; `Get` returns metadata + bytes; `Delete` removes a row and returns `store.ErrNotFound` for an unknown id; `ProjectID` resolves the owning project via `case_attachments -> test_cases -> projects`.
- [x] 3.2 Run the test, confirm it fails (repo doesn't exist yet).
- [x] 3.3 Implement `apps/api/internal/store/case_attachments.go`: `CaseAttachmentRepo` with `Create(ctx, caseID, filename, contentType string, data []byte) (domain.CaseAttachment, error)`, `ByCase(ctx, caseID string) ([]domain.CaseAttachment, error)`, `Get(ctx, id string) (domain.CaseAttachment, []byte, error)`, `Delete(ctx, id string) error`, `ProjectID(ctx, id string) (string, error)` — mirror `AttachmentRepo`'s shape in `apps/api/internal/store/attachments.go`.
- [x] 3.4 Register `CaseAttachments *CaseAttachmentRepo` on the `Store` struct and its constructor in `apps/api/internal/store/store.go`.
- [x] 3.5 Run the test, confirm it passes.

## 4. Service layer

- [x] 4.1 Write failing tests in `apps/api/internal/service/case_attachments_test.go`: `AttachCaseFile` validates via `attachmentfile.ValidateUpload`, rejects an oversized/unsupported upload with a `*ValidationError` and stores nothing, stores and audits (`attach_case_file`) a valid upload; `ListCaseAttachments` returns a case's attachments; `GetCaseAttachment` returns bytes + metadata; `DeleteCaseAttachment` removes and audits (`delete_case_attachment`).
- [x] 4.2 Run the tests, confirm they fail.
- [x] 4.3 Implement `apps/api/internal/service/case_attachments.go` with those four methods on `*Service`, following the shape of `apps/api/internal/service/attachments.go`.
- [x] 4.4 Run the tests, confirm they pass.

## 5. HTTP layer

- [x] 5.1 Write failing scenario tests in `apps/api/internal/server/case_attachment_api_test.go` covering: upload succeeds for `caseEdit` (201) for image/PDF/text, upload rejected for an actor without `caseEdit` (403), upload rejected for an oversized/truly-unsupported file (400), list returns a case's attachments for `read`, get serves bytes with correct `Content-Type` and (for a PDF) `Content-Disposition: inline`, delete succeeds for `caseEdit` and fails with 403 without it, get/delete on an unknown id returns 404.
- [x] 5.2 Run the tests, confirm they fail (routes/handlers don't exist yet).
- [x] 5.3 Implement `apps/api/internal/server/case_attachment_handlers.go`: `listCaseAttachments`, `uploadCaseAttachment` (reusing the `readAttachmentUpload`-style multipart helper, bounded by `attachmentfile.MaxUploadBytes+multipartOverhead`), `getCaseAttachment` (ETag/Cache-Control like `getAttachment`, plus `Content-Disposition: inline; filename="..."` for `application/pdf`), `deleteCaseAttachment`.
- [x] 5.4 Add `projectIDFromCaseAttachment` resolver to `apps/api/internal/server/middleware.go` (calls `h.svc.ProjectIDForCaseAttachment`).
- [x] 5.5 Add `ProjectIDForCaseAttachment` to `apps/api/internal/service/project_rbac.go` (alongside the other `ProjectIDFor*` resolvers), delegating to `store.CaseAttachments.ProjectID`.
- [x] 5.6 Register routes in `apps/api/internal/server/handlers.go`: `GET/POST /cases/{caseKey}/attachments` inside the existing `/cases/{caseKey}` route group (`caseEdit` for POST, `read` for GET), and a new `r.Route("/case-attachments/{attachmentID}", ...)` block (`read` for GET, `caseEdit` for DELETE).
- [x] 5.7 Run the tests, confirm they pass.
- [x] 5.8 Security hardening: write a failing test asserting `GET /case-attachments/{id}` for a PDF sets a sandboxed `Content-Security-Policy`, then set `Content-Security-Policy: sandbox; default-src 'none'` on that response in `getCaseAttachment` — defense-in-depth against a PDF carrying active content, since it renders inline on the API origin via the browser's own PDF viewer. Run the test, confirm it passes.

## 6. Public API exposure

- [x] 6.1 Add `GET /api/v1/public/cases/{caseKey}/attachments` and `GET /api/v1/public/case-attachments/{attachmentID}` to `mountPublicAPI` in `apps/api/internal/server/public_handlers.go`, reusing the exact same `listCaseAttachments`/`getCaseAttachment` handlers with `h.requirePublicProject` in place of `h.requirePermission` — matching the existing `getCase`/`listCaseVersions`/`listCaseExecutions` pattern. No write routes (upload/delete) are added to the public API.
- [x] 6.2 Write failing scenario tests in `apps/api/internal/server/public_project_access_api_test.go` (matching the existing public-route test file convention): an anonymous request to a public project's case attachment list/bytes succeeds; no public POST/DELETE route exists for case attachments.
- [x] 6.3 Run the tests, confirm they fail, then pass after 6.1.

## 7. API contract

- [x] 7.1 Add `CaseAttachment` schema and the `POST/GET /cases/{caseKey}/attachments`, `GET/DELETE /case-attachments/{attachmentId}` paths (image/PDF/text content types) to `packages/shared/openapi.yaml`, matching the existing `Attachment`/attachment-path shapes.
- [x] 7.2 Add the two public paths from task 6.1 to `packages/shared/openapi.yaml` under the existing `/public/...` path group.
- [x] 7.3 Run `make generate`, confirm the generated TS client compiles with no diff drift against committed output.

## 8. Frontend design (Pepe)

- [x] 8.1 Dispatch Pepe (Fable 5 subagent) with: the case detail page's existing Jira-link field placement, `AttachmentField.tsx`'s drag/paste/click interaction pattern, and the requirement to show image thumbnails and a filename+icon chip (for PDF/text/log alike — no thumbnails for non-image files, confirmed with the user) in one field. Get a published mockup + exact component structure.
- [x] 8.2 Present Pepe's mockup to the user and get explicit sign-off before writing any component code. (User approved the icon+filename chip treatment; declined PDF thumbnail generation as out of scope — see design.md Non-Goals.)

## 9. Frontend implementation

- [x] 9.1 Write failing tests in `apps/web/src/components/CaseAttachmentField.test.tsx` per Pepe's approved design (adapted per final user direction: icon+filename chip for every non-image type, no thumbnail distinction between PDF/text/log): renders image thumbnails, renders file chips (filename + icon) for PDF/text/log alike, upload/remove call the right handlers, canEdit gating, empty-state variants.
- [x] 9.2 Run the tests, confirm they fail (component doesn't exist).
- [x] 9.3 Implement `apps/web/src/components/CaseAttachmentField.tsx` per the approved mockup, accepting `image/png,image/jpeg,image/webp,application/pdf,text/plain` (plus `.txt,.log` in the `accept` attribute, since browsers don't reliably map `.log` to a MIME type).
- [x] 9.4 Run the tests, confirm they pass.
- [x] 9.5 Add an optional `basePath` prop to `apps/web/src/components/Lightbox.tsx` (default `/api/v1/attachments`), replacing its two hardcoded `/api/v1/attachments/${id}` strings — needed so the case attachment field can point it at `/api/v1/case-attachments` for image attachments without affecting any existing call site (default param keeps them unchanged).
- [x] 9.6 Write failing test(s) in `apps/web/src/pages/CaseDetailPage.test.tsx` covering the Attachments field appearing on the case detail page, wired to the new endpoints.
- [x] 9.7 Run the tests, confirm they fail.
- [x] 9.8 Wire `CaseAttachmentField` into `apps/web/src/pages/CaseDetailPage.tsx` alongside the Jira field, using the generated API client for list/upload/delete, and `Lightbox` with `basePath="/api/v1/case-attachments"` for image attachments.
- [x] 9.9 Run the tests, confirm they pass.

## 10. Docs and Sample Project

- [x] 10.1 Update `docs/test-management.md`'s case fields section to describe case reference attachments (images, PDF, .txt/.log; identity-level not versioned; visible on public projects).
- [x] 10.2 Update `apps/api/internal/sampledata/seed.go` to attach one reference image to an existing Sample Project case, and its test `apps/api/internal/sampledata/seed_test.go` to assert the attachment exists.

## 11. Verification

- [x] 11.1 Run `make lint-api lint-web coverage-api coverage-web` and confirm all pass with coverage ≥80% on both sides.
- [x] 11.2 Rebuild and redeploy via `make compose-up` (with a wiped DB volume, so the Sample Project actually re-seeds), manually upload an image (seeded), a PDF, and a .log file to a Sample Project case through the browser, confirm the thumbnail/file-chip render, confirm download/open works (PDF opened inline in Chrome's native viewer with the sandboxed CSP applied), confirm removal works and persists server-side, confirm an oversized file and a truly-unsupported file (.exe) are each rejected client-side with a clear message, confirm the attachments are visible when viewing the same case as an anonymous visitor via the public project route (Sample Project is public by default).
