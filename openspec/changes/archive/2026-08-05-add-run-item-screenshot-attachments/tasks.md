## 1. Storage foundation

- [x] 1.1 Migration `apps/api/internal/db/migrations/000XX_add_result_attachments.sql`: new `result_attachments` table (`id uuid pk`, `run_item_id uuid not null references test_run_items(id) on delete cascade`, `result_id uuid references test_run_results(id) on delete cascade`, `filename text not null`, `content_type text not null`, `image bytea not null`, `created_at timestamptz not null default now()`). New migration file only — never edit an existing one.
- [x] 1.2 New `apps/api/internal/attachmentimage` package: `ValidateUpload(data []byte) (contentType string, err error)` — sniffs type via `http.DetectContentType`, decodes config to reject corrupt files, enforces the 5MB cap, returns `ErrTooLarge`/`ErrUnsupportedFormat` (mirroring `avatarimage`'s error shape) — no crop/resize. Write failing tests first (oversized input, unsupported format, each of png/jpeg/webp accepted) using real testdata fixtures, then implement.

## 2. Store layer

- [x] 2.1 Failing tests, then implement `AttachmentRepo` (or extend `RunRepo`) methods: `StageForItem(ctx, itemID, filename, contentType, data) (domain.Attachment, error)` (inserts with `result_id NULL`), `AttachToResult(ctx, resultID, filename, contentType, data) (domain.Attachment, error)` (inserts with `result_id` set), `LinkStaged(ctx tx, itemID string, resultID string, attachmentIDs []string) error` (UPDATEs `result_id`, rejects ids not scoped to `itemID`), `ByResult(ctx, resultID) ([]domain.Attachment, error)`, `Get(ctx, id) (domain.Attachment, []byte, error)`, `Delete(ctx, id) error`.
- [x] 2.2 Failing tests, then extend `RunRepo.AppendResult` to accept `attachmentIDs []string` and `inline []domain.NewAttachment`, linking/inserting both inside the existing transaction (spec: "Linking staged attachments when recording a verdict", "Recording a result with inline attachments").
- [x] 2.3 Failing tests, then extend `RunRepo.Import`'s `ImportItem` to carry `Attachments []domain.NewAttachment`, inserted (with `result_id` set) inside the same transaction as each matched item/result; attachments for unmatched case keys are simply never passed in, not stored (spec: "Importing with inline attachments keyed by case key", "An unmatched test's attachments are dropped, not orphaned").

## 3. Service layer

- [x] 3.1 Failing tests, then implement `Service.StageAttachment`, `Service.AttachToResult`, `Service.GetAttachment`, `Service.DeleteAttachment` — permission checks reuse the existing `runRecordResult`/`read` capability checks already used by result recording (spec: permission-denied scenarios).
- [x] 3.2 Failing tests, then extend `Service` result-recording path to accept and validate `attachmentIds`/inline `attachments` on `NewResult`, rejecting ids staged against a different item (spec: "A staged attachment from a different item cannot be linked").
- [x] 3.3 Failing tests, then extend `execution_import.go`'s `Import` to accept an `attachments []{CaseKey, Filename, ContentType, Data}` input, group by `caseKey`, and attach to `store.ImportItem` for matched tests only.

## 4. API surface

- [x] 4.1 `packages/shared/openapi.yaml`: add `Attachment`, `NewAttachment` schemas; add `attachmentIds`/`attachments` optional fields to `NewResult` and `ImportRequest`; add paths `POST/GET /api/v1/items/{itemId}/attachments`, `POST/GET /api/v1/results/{resultId}/attachments`, `GET/DELETE /api/v1/attachments/{attachmentId}`. Run `make generate`, verify no drift.
- [x] 4.2 Failing API-level tests (`internal/server/*_api_test.go`), then implement the chi handlers — multipart upload mirroring `updateCurrentUserAvatar`'s `MaxBytesReader`/`ParseMultipartForm` pattern, byte-serving mirroring `getUserAvatar`'s `ETag`/`Cache-Control` handling.
- [x] 4.3 Failing tests, then wire the `attachmentIds`/`attachments` fields through the existing `recordResult` and `importResults` handlers into the service calls from 3.2/3.3.

## 5. Web: manual attach + display

- [x] 5.1 Failing component tests, then build `AttachmentStrip` (thumbnails, max 3 + "+N" overflow tile) and `Lightbox` (prev/next, filmstrip, actor/verdict/timestamp caption) components, styled from existing CSS custom properties only (no new tokens) — verify against both light and dark per Pepe's validated mock (https://claude.ai/code/artifact/cbbc2767-0dc9-4ce9-b9d1-9efc96f62a11).
- [x] 5.2 Failing tests, then wire `RunItemDetailPage.tsx`: paste (⌘V)/drag-and-drop on the Comment textarea calls the staging endpoint immediately and shows upload/error states; an "attach a file" fallback link opens a file picker; staged attachment ids are included when a verdict is recorded.
- [x] 5.3 Failing tests, then add the persistently-visible paperclip icon to each History entry, wired to the direct-attach-to-result endpoint, and render `AttachmentStrip`/`Lightbox` for each history entry that has attachments.
- [x] 5.4 New `apps/web/e2e/run-item-attachments.spec.ts`, titled after the spec scenarios (`run-result-attachments`'s "Attaching directly to an existing result" and "Opening the full-size view"): attach a screenshot to a recorded result and confirm it renders and opens in the lightbox.

## 6. Docs

- [x] 6.1 `docs/api.md`: document the new endpoints and the `attachmentIds`/`attachments` fields on `recordResult`/`importResults`.
- [x] 6.2 `docs/database.md`: document the `result_attachments` table.
- [x] 6.3 `docs/test-management.md` (or wherever execution import is documented): document the attach UX, and explicitly note that JUnit XML itself is not parsed for embedded attachments — attachments travel as a separate request field.

## 7. Sample Project showcase

- [x] 7.1 Failing test in `seed_test.go` asserting at least one seeded run item result has an attachment, then update `seed.go` to attach a screenshot to one of the existing seeded results (e.g. one of the failed sessionTimeout results already used for the version-history/actor showcase) — use a small bundled placeholder PNG, not a network fetch.

## 8. Manual verification

- [x] 8.1 Visually verify the thumbnail strip and lightbox in both light and dark mode against the live app (contrast, spacing) — not unit-testable, call out as done here rather than a fabricated automated test.
- [x] 8.2 Full `make test` / `make coverage-api` / `make coverage-web` pass; run the new `ui-theming`-adjacent or `test-execution` e2e scenario for attachments if one was added; confirm no regression in the existing (previously-confirmed-flaky-but-unrelated) e2e suite.
