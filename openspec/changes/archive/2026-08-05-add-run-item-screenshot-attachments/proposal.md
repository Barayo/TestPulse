## Why

As a tester, when I record a Failed/Blocked verdict, I want to attach a screenshot as evidence, so that whoever triages the result later doesn't have to reproduce the bug just to see what I saw. Today `RunItemDetailPage` only carries a text comment — issue #41 asks for screenshot attachments, both attached by hand while executing and (eventually) carried in by an import. The visual solution is already validated (Pepe review, https://claude.ai/code/artifact/cbbc2767-0dc9-4ce9-b9d1-9efc96f62a11); this proposal covers the API and storage needed to back it, and states explicitly what "importers support this too" means in this pass versus later.

## What Changes

- A `Result` can carry zero or more image attachments (PNG/JPEG/WebP), added either at verdict-recording time or after the fact from the History list.
- New API surface: upload, list, serve, and delete attachments on a `Result` — `POST/GET /api/v1/results/{resultId}/attachments`, `GET/DELETE /api/v1/attachments/{attachmentId}`. This standalone surface backs the UI's staged-upload flow (paste/drop before a verdict exists yet — see below) and after-the-fact attach from History.
- **Attachments can also be created atomically with the Result itself**, for clients that already have the image bytes in hand and want one call instead of two: `POST /api/v1/items/{itemId}/results` (manual verdict recording) and `POST /api/v1/import` (JUnit) both accept an optional inline `attachments` field (base64 image data + filename + content type), stored in the same DB transaction as the Result row(s) they belong to. This is the concrete answer to "importers support this too" — a CI pipeline attaches screenshots to specific test cases in one `Import` call, keyed by the report's own case-key property, rather than importing first and attaching in a fragile follow-up step. The standalone endpoint above still exists for the UI's progressive-upload UX and for attaching evidence after a result already exists.
- Manual UI on `RunItemDetailPage`: paste (⌘V) / drag onto the Comment field, or an "attach a file" fallback link; a persistently-visible paperclip icon on each History entry for after-the-fact attach; a thumbnail strip (max 3 + "+N") opening a lightbox. Both light and dark mode.
- Attachments stored as raw bytes + content type in a new `result_attachments` table (bytea in Postgres, same storage shape as `user_avatars`, no new infrastructure) — unlike avatar uploads, screenshots are **not** center-cropped/resized; they're stored as-is (subject to a size cap) since cropping evidence images would defeat the point.
- **The JUnit XML report itself stays text-only** (**explicit scope decision, not an oversight** — see Design for why): images are never embedded inside the `<report>` XML string, since JUnit XML has no single widely-adopted attachment convention (Allure/ReportPortal/CTRF each invented their own, none shared). Instead, the `Import` request carries the report XML and its attachments as two separate fields in the same call — see "single-transaction attach" above — so a CI pipeline still only makes one request, it just doesn't need to shoehorn images into the XML itself.
- **No new "TestPulse JSON" import format is introduced.** The only import format that exists today is `junit-xml`; inventing a whole second import format is a separable, much larger initiative and is explicitly out of scope here.
- Sample Project showcase: one seeded run item result carries an attached screenshot.

## Capabilities

### New Capabilities
- `run-result-attachments`: upload, storage, listing, serving, and deletion of image attachments on a run item Result, plus the manual-attach and after-the-fact-attach UI on `RunItemDetailPage`.

### Modified Capabilities
- `test-execution`: a Result's History entry now may display attached screenshots (thumbnail strip + lightbox); no change to verdict-recording semantics themselves.
- `execution-import`: documents that imported results are attachable via the same API as manually-recorded ones, and that JUnit-XML-embedded attachments are explicitly not parsed in this change.

## Impact

- **API/service**: new `result_attachments` store + service methods; new chi routes; `openapi.yaml` additions.
- **DB**: new migration `result_attachments` table.
- **Web**: `RunItemDetailPage.tsx` (paste/drag/attach-after-the-fact, thumbnail strip, lightbox component), new `Lightbox`/`AttachmentStrip` components, dark-mode token usage only (no new tokens).
- **Docs**: `docs/api.md` (new endpoints), `docs/test-management.md` (attach UX), `docs/database.md` (new table), note in whichever doc covers execution import that JUnit attachment parsing is deferred.
- **Sample data**: `apps/api/internal/sampledata/seed.go` + `seed_test.go`.
- No breaking changes to existing endpoints or schemas.
