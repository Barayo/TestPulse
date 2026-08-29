## 1. Domain & migration

- [x] 1.1 Add migration `00009_session_timeout_setting.sql`: `instance_settings.session_timeout_days integer DEFAULT 30 NOT NULL`.
- [x] 1.2 Add `SessionTimeoutDays int` to `domain.InstanceSettings` and `SessionTimeoutDays *int` to `domain.InstanceSettingsUpdate`.

## 2. Store layer (TDD)

- [x] 2.1 Write failing tests: `InstanceSettingsRepo.Get` returns `sessionTimeoutDays` (defaulting to 30 on a fresh instance); `Update` round-trips a new value.
- [x] 2.2 Update `instance_settings.go`'s `Get`/`Update` SQL and scan to pass. Confirm green.

## 3. Service layer (TDD)

- [x] 3.1 Write failing tests: `UpdateInstanceSettings` rejects `sessionTimeoutDays < 1` or `> 90` with a validation error; accepts values in range.
- [x] 3.2 Implement the bound check in `service/instance_settings.go` to pass. Confirm green.
- [x] 3.3 Write failing tests: `Login`/`createSession` sets a new session's expiry using the currently-configured `sessionTimeoutDays`, not the old hardcoded 30; the sliding-window extension path (session validation on an authenticated request) does the same.
- [x] 3.4 Replace the `sessionLifetime` constant in `identity.go` with a per-call read of `instance_settings.session_timeout_days` at both call sites (session creation, session extension). Confirm green.

## 4. API layer (TDD) + contract

- [x] 4.1 Add `sessionTimeoutDays` to `InstanceSettings`/`InstanceSettingsUpdate` schemas in `packages/shared/openapi.yaml`. Run `make generate`.
- [x] 4.2 Write failing HTTP-level tests: `PATCH /api/v1/instance-settings` round-trips `sessionTimeoutDays`; rejects out-of-bounds values with `400`.
- [x] 4.3 Update `instance_settings_handlers.go`'s input struct and `toInstanceSettingsUpdate()` to pass. Confirm green.

## 5. Design mock (Pepe, before web code)

- [x] 5.1 Dispatched Pepe (Fable 5); mock at https://claude.ai/code/artifact/cfab3a76-9a79-4b8a-b44b-bd7461c1ce5d. Decided: plain bounded number input + Save (Jira card's idiom, not `RetentionPillSelector`), placed above `SSOSettingsCard` in the Authentication section, live client-side validation, no red-ring card treatment (unlike Run retention — every legal value here is normal operation). User approved.

## 6. Web implementation (TDD)

- [x] 6.1 Write failing tests for the new "Session timeout" card: renders the current value, saves a new value via `PATCH`, shows a validation message for out-of-bounds input.
- [x] 6.2 Implement the card per the approved Pepe mock. Confirm green.

## 7. Sample Project / seed showcase

- [x] 7.1 Confirmed: purely an instance-wide setting with a sensible default (30, unchanged from today's hardcoded behavior) — no Sample Project content change needed. It's a Tenant-Admin config knob visible on `InstanceSettingsPage.tsx`, not case/suite/run content the Sample Project showcases.

## 8. Docs

- [x] 8.1 Documented `sessionTimeoutDays` in `docs/api.md` (login route + instance-settings GET/PATCH field lists) and `docs/database.md` (`instance_settings` table). Fixed the one stale "30-day sliding expiry" mention on the login route.

## 9. Validate

- [x] 9.1 Run `make lint test coverage-api coverage-web` and fix any failures. Go: 80.9% (min 80%). Web: 92.22%/84.58%/90.26%/94.63% (min 80% all). `go vet`/`golangci-lint`/`oxlint`: 0 new issues. `tsc -b`: clean.
- [x] 9.2 Local deploy + manual click-through confirmed the card end-to-end (save, persist across reload, live validation with red border/disabled Save). Added `apps/web/e2e/session-timeout-setting.spec.ts` (2 new scenarios, serial mode + afterAll reset — mirrors `ui-theming.spec.ts`'s handling of the sibling `colorTheme` instance-wide setting) — both pass, plus `session-expiry.spec.ts` and `ui-theming.spec.ts` re-run together to confirm no cross-file interference (10/10 passed).
- [x] 9.3 `openspec validate --all --strict` — 27 passed, 0 failed.
