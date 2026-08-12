## 1. Store: email/password updates + session revocation

- [x] 1.1 Write failing tests in `apps/api/internal/store/identity_test.go`: `TestUserUpdateEmail`, `TestUserUpdateEmailRejectsDuplicate` (unique constraint), `TestUserUpdatePasswordHash`, `TestSessionDeleteByUser` (creates two sessions for one user, one for another; deleting by the first user's id removes only theirs)
- [x] 1.2 Implement `UserRepo.UpdateEmail(ctx, id, email) (domain.User, error)` and `UserRepo.UpdatePasswordHash(ctx, id, hash) error` in `apps/api/internal/store/users.go`; `SessionRepo.DeleteByUser(ctx, userID) error` in `apps/api/internal/store/sessions.go`
- [x] 1.3 Verify tests pass

## 2. Service: validated update, gated

- [x] 2.1 Write failing tests in `apps/api/internal/service/identity_test.go`: `TestUpdateUserEmail`, `TestUpdateUserEmailRejectsDuplicate`, `TestUpdateUserEmailRejectsInvalid`, `TestSetUserPasswordRevokesSessions` (log in, change password, assert the prior session is gone and a fresh login with the new password succeeds), `TestSetUserPasswordRejectsWeak`, `TestNonTenantAdminCannotUpdateAnotherUsersEmail`/`Password`
- [x] 2.2 Add `Service.UpdateUserEmail` and `Service.SetUserPassword` in `apps/api/internal/service/identity.go` — Tenant-Admin-gated at the service layer (matching `DeleteUser`/`DeleteTeam`'s pattern), validating via `domain.ValidateEmail`/`domain.ValidatePassword`, hashing with bcrypt, `SetUserPassword` calling `SessionRepo.DeleteByUser`, both auditing
- [x] 2.3 Verify tests pass

## 3. HTTP: extend the existing route

- [x] 3.1 Write failing tests in `apps/api/internal/server/identity_api_test.go`: `TestScenario_TenantAdminUpdatesUserEmailOverHTTP`, `TestScenario_TenantAdminSetsNewPasswordOverHTTP` (assert a session created before the change 401s afterward), `TestScenario_NonTenantAdminCannotUpdateAnotherUsersEmailOrPasswordOverHTTP`
- [x] 3.2 Add `Email *string`/`Password *string` to `userUpdate` in `apps/api/internal/server/identity_handlers.go`, wire into `updateUser`'s existing per-field branching
- [x] 3.3 Verify tests pass

## 4. API contract

- [x] 4.1 Add `email`/`password` to `UserUpdate` schema in `packages/shared/openapi.yaml`
- [x] 4.2 Run `make generate`; confirm no drift

## 5. Web: Edit action + dialog

- [x] 5.1 Dispatch Pepe (Fable 5, ultrathink) for the Edit-user dialog's visual design, grounded in the real current `PeoplePage.tsx` — get explicit user validation before writing any component code
- [x] 5.2 Write failing tests in `apps/web/src/pages/PeoplePage.test.tsx`: Edit action opens a dialog pre-filled with the current email, password field is blank/optional ("leave blank to keep the current password"), submitting calls `PATCH /api/v1/users/{userId}` with only the changed fields, duplicate-email error surfaces inline
- [x] 5.3 Implement the Edit action + dialog in `apps/web/src/pages/PeoplePage.tsx` per the validated Pepe design
- [x] 5.4 Verify tests pass

## 5a. Web: secure password generation (Pepe follow-up, same change)

- [x] 5a.1 Write failing unit tests for `apps/web/src/lib/generatePassword.ts`: `generateSecurePassword()` returns a 20-character string drawn only from the ambiguity-excluded 58-char alphabet, two calls produce different values, `crypto.getRandomValues` is actually invoked (not `Math.random`)
- [x] 5a.2 Implement `generateSecurePassword` (rejection sampling against `crypto.getRandomValues`, per Pepe's spec)
- [x] 5a.3 Write failing tests for the Generate + reveal/copy affordance on both the Edit-user dialog's password field and the New-user form's password field: clicking Generate fills the field and shows a plaintext reveal chip with Copy, manually editing the field afterward clears the reveal
- [x] 5a.4 Implement the Generate button + reveal/copy block on both forms, reusing `TokensPage.tsx`'s "copy this now" idiom
- [x] 5a.5 Verify tests pass

## 6. E2E

- [x] 6.1 Add an E2E spec (or extend `apps/web/e2e/`) covering the `authentication` capability's new "Tenant Admin sets a new password for a user" and "Tenant Admin changes a user's email" scenarios: edit a user's email, confirm it's reflected; set a new password for a user with an active session, confirm that session no longer authenticates

## 7. Docs

- [x] 7.1 Document the extended `PATCH /api/v1/users/{userId}` behavior in `docs/api.md`

## 8. Sample Project showcase

- [x] 8.1 Assessed: no seed-data change needed — the Edit action renders on every existing user row (Julia, Sam, the seeded Tenant Admin), so a fresh instance already has real, clickable rows to demonstrate the flow. No new seeded entity required.

## 9. Spec sync

- [ ] 9.1 Sync `specs/authentication/spec.md`'s delta into `openspec/specs/` at archive time
