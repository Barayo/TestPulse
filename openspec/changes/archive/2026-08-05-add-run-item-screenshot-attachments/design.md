## Context

`RunItemDetailPage.tsx` records verdicts (Pass/Failed/Blocked/Skipped/Retest) against a `Result` row (`test_run_results`), with a text `comment` and a History list of past Results. There is no attachment concept anywhere in the domain model today.

Two existing precedents this design deliberately reuses:
- **Avatar upload** (`user_avatars` table: `user_id pk, image bytea, content_type text, updated_at`; `apps/api/internal/service/user_avatars.go`; `apps/api/internal/avatarimage`): bytes stored directly in Postgres, no filesystem/object storage, a dedicated table kept separate from the parent row so ordinary reads never pull image bytes along. Screenshots reuse the storage shape but **not** the crop/resize pipeline — evidence images must not be silently cropped.
- **Transactional store methods**: every multi-statement store method (`RunRepo.AppendResult`, `RunRepo.Import`, `CaseRepo.Create`, …) already wraps its work in a single `pool.Begin(ctx)` / `tx.Commit(ctx)`. Adding attachment rows to these transactions is a natural extension, not a new pattern.

The `Import` service (`apps/api/internal/service/execution_import.go`) only accepts `{format: "junit-xml", name, report}` — a single XML text string — and `junitxml.Parse` has no attachment concept. There is no second import format.

## Goals / Non-Goals

**Goals:**
- A `Result` can carry N image attachments (PNG/JPEG/WebP), added manually (paste/drag/file, at record-time or after) or atomically by an API client (manual `recordResult` call or `importResults` call) in a single request/transaction.
- Imported results are attachable exactly like manually-recorded ones — same storage, same serving endpoint, same UI treatment.
- Both light and dark mode.

**Non-Goals:**
- Non-image attachments (logs, video, arbitrary files).
- Parsing images embedded inside JUnit XML itself — no such standard exists, and it isn't necessary now that `importResults` accepts attachments as a sibling field to `report` (see Decision 3).
- A new "TestPulse JSON" test-report import format — the only import format remains `junit-xml`; attachments ride alongside it as a separate field, not as a new report format.
- Automatic cleanup of attachments a user stages (pastes) but never links to a recorded verdict — see Risks.

## Decisions

**1. Storage: a new `result_attachments` table, bytea, no resizing.**
```
result_attachments (
  id            uuid primary key default gen_random_uuid(),
  run_item_id   uuid not null references test_run_items(id) on delete cascade,
  result_id     uuid references test_run_results(id) on delete cascade,  -- nullable, see Decision 2
  filename      text not null,
  content_type  text not null,
  image         bytea not null,
  created_at    timestamptz not null default now()
)
```
`run_item_id` is set on every row (even before a `result_id` exists) so a staged-but-not-yet-linked attachment is still scoped to the right item for authorization and cleanup. Validation (type sniff via `http.DetectContentType`, `image.DecodeConfig` to reject corrupt files, a size cap) lives in a new minimal package, not `avatarimage` — avatar validation is bundled with the crop/resize pipeline this feature must not run. Cap: **5MB per attachment**, matching the illustrative limit already shown in the validated mock's error copy.

*Alternative considered:* object storage (S3-compatible). Rejected for the same reason avatars rejected it — it's a new stack dependency the `establish-architecture` constraints don't currently require, and Postgres bytea is proven at this scale by the avatar feature already.

**2. Two attach paths, reconciled through one nullable `result_id`:**
- **Staged (UI paste/drag before a verdict is recorded):** `POST /api/v1/items/{itemId}/attachments` (multipart, mirrors the avatar-upload handler shape) inserts a row with `result_id = NULL`. Returns the created attachment (id, filename, contentType, createdAt — never the bytes). The UI holds these ids in local state until a verdict is recorded.
- **Linking at record-time:** `POST /api/v1/items/{itemId}/results` (`NewResult`) gains two optional fields: `attachmentIds: string[]` (staged ids from the step above — the store `UPDATE`s their `result_id` inside the same transaction that inserts the Result) and `attachments: NewAttachment[]` (inline base64 `{filename, contentType, data}` — inserted directly with `result_id` set, in the same transaction). The inline form is what an API client with bytes already in hand uses to do it all in one call; the id-linking form is what the UI uses after a progressive paste-upload. Both can be used together.
- **After-the-fact (History entry already exists):** `POST /api/v1/results/{resultId}/attachments` (multipart) inserts directly with `result_id` set — no staging needed since a Result already exists to attach to.
- **Import:** `POST /api/v1/projects/{projectKey}/imports` (`ImportRequest`) gains an optional `attachments: {caseKey, filename, contentType, data}[]`. `execution_import.go` groups these by `caseKey` before building `store.ImportItem`s; `RunRepo.Import` inserts each matched item's attachments in the same transaction as its item/result rows. Attachments whose `caseKey` doesn't match anything are dropped along with the rest of that unmatched test's data — consistent with the existing "match-only, no partial artifacts for unmatched tests" rule.

This means the "single transaction" requirement is satisfied for both stated use cases (JUnit import, other API clients) via the inline `attachments` field — no client is ever required to make two calls to get an atomic result.

**3. Why not embed images in the JUnit XML report string?** No shared convention exists across the ecosystem (Allure/ReportPortal/CTRF each invented their own, typically base64-in-`<system-out>` with a proprietary marker). Rather than adopting one tool's private convention and calling it "JUnit support," attachments travel as a sibling JSON field on the same `importResults` request — still one HTTP call, still one transaction, but without pretending JUnit XML itself carries a standard it doesn't have.

**4. Serving:** `GET /api/v1/attachments/{attachmentId}` streams raw bytes with `Content-Type` and an `ETag`/`Cache-Control: private, max-age=3600` header, identical to `getUserAvatar`. `GET /api/v1/results/{resultId}/attachments` and `GET /api/v1/items/{itemId}/attachments` (staged-only, `result_id IS NULL`) list metadata only.

**5. Authorization:** reuses the existing `runRecordResult` project capability that already gates result creation — attaching evidence is part of recording a result, not a separate permission.

**6. Frontend:** two new components — `AttachmentStrip` (thumbnails, "+N" overflow) and `Lightbox` (prev/next, filmstrip, caption) — plus paste/drag handlers on `RunItemDetailPage`'s Comment textarea and a persistently-visible paperclip icon per History entry. Both read exclusively through the existing CSS custom properties (`--card`, `--border`, `--destructive`, etc.) already wired for dark mode; no new tokens.

## Risks / Trade-offs

- **Orphaned staged attachments** (pasted, never linked because the user navigates away before recording a verdict) → accumulate as `result_id IS NULL` rows forever. Mitigation: out of scope for this change; flagged for `add-data-retention` (already an in-progress OpenSpec change) to sweep unlinked rows older than N days. Not a correctness risk (they're invisible — nothing renders `result_id IS NULL` rows outside the pasting session), only a storage-growth one.
- **Base64 inflation on the inline path** (~33% larger than raw bytes) → bound the request body the same way avatar upload bounds multipart overhead (`http.MaxBytesReader` sized for the 5MB cap plus base64/JSON overhead), reject early rather than after full decode.
- **Import attachments keyed by `caseKey`, but `caseKey` isn't guaranteed unique within a single report** → if a report lists the same case key twice (e.g., parameterized tests without distinct keys), attachments keyed to that case key attach to whichever matching item the importer processes — document this as a known limitation rather than silently guessing intent.

## Migration Plan

One additive migration (new table, no changes to existing tables/columns) — no backfill, no down-time. `goose` applies it automatically at startup per existing policy. Rollback is the standard `goose down` for this table only; no other schema is touched.

## Open Questions

- Exact per-attachment size cap (5MB proposed, matches the validated mock's illustrative copy) and any cap on attachment *count* per Result — left as an implementation-time judgment call within "generous enough for a real screenshot, small enough to bound abuse," not architecturally significant either way.
