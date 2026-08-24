## 1. Dependencies (done, carried over)

- [x] 1.1 `github.com/coreos/go-oidc/v3` and `golang.org/x/oauth2` added to
      `apps/api/go.mod`.

## 2. Migration

- [x] 2.1 `users.password_hash` nullable, `users.oidc_subject` unique
      column (done, carried over from the env-var draft — unaffected by
      the config-model rework).
- [x] 2.2 Extend `00004_sso_oidc.sql` (not yet applied anywhere, safe to
      keep editing the same file): `ALTER TABLE instance_settings ADD
      COLUMN oidc_issuer text, ADD COLUMN oidc_client_id text, ADD COLUMN
      oidc_client_secret_encrypted bytea, ADD COLUMN oidc_group_claim
      text, ADD COLUMN oidc_admin_claim_values text[], ADD COLUMN
      oidc_only boolean NOT NULL DEFAULT false`.
- [x] 2.3 In the same migration: `CREATE TABLE oidc_team_mappings (id uuid
      DEFAULT gen_random_uuid() PRIMARY KEY, claim_value text NOT NULL,
      team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE)` plus
      an index on `team_id`. Symmetric goose Down for both.

## 3. Config and encryption

- [x] 3.1 Remove `OIDCIssuer`/`OIDCClientID`/`OIDCClientSecret`/
      `OIDCAdminClaim`/`OIDCAdminClaimValues`/`OIDCOnlyRaw` and
      `OIDCEnabled()`/`OIDCOnly()` from `config.go` — config no longer
      carries any OIDC value. Remove/update their tests in
      `config_test.go` accordingly.
- [x] 3.2 Add `EncryptionKey string` (`TESTPULSE_ENCRYPTION_KEY`, optional)
      to `Config`/`Load` with a test confirming it's blank by default and
      read when set. Update the doc-comment block.
- [x] 3.3 Write a failing test for an `encryptSecret(key, plaintext)
      ([]byte, error)` / `decryptSecret(key, ciphertext) (string, error)`
      pair (AES-256-GCM, key = `sha256.Sum256([]byte(key))`) in a new
      `apps/api/internal/service/oidc_secret.go`: round-trips correctly,
      and a wrong key fails to decrypt (auth tag mismatch) rather than
      silently returning garbage.

## 4. Domain

- [x] 4.1 Extend `domain.InstanceSettings` with `OIDCIssuer string`,
      `OIDCClientID string`, `OIDCClientSecretSet bool` (computed,
      never the raw secret), `OIDCGroupClaim string`,
      `OIDCAdminClaimValues []string`, `OIDCOnly bool`.
- [x] 4.2 Extend `domain.InstanceSettingsUpdate` with `OIDCIssuer *string`,
      `OIDCClientID *string`, `OIDCClientSecret *string` (write-only;
      nil = leave current secret untouched), `OIDCGroupClaim *string`,
      `OIDCAdminClaimValues *[]string`, `OIDCOnly *bool`, and a dedicated
      `DisableOIDC *bool` (true clears every `oidc_*` field/column at
      once — avoids the empty-string-as-sentinel trap `ClearAvatarKey`
      already exists to avoid).
- [x] 4.3 Add `domain.OIDCTeamMapping{ID, ClaimValue, TeamID string}`.
- [x] 4.4 `domain.OIDCSubject *string` on `User` (done, carried over).

## 5. Store

- [x] 5.1 Write a failing test extending `instance_settings_test.go`:
      `Get`/`Update` round-trip the new OIDC columns (issuer/clientID/
      group claim/admin values/only), and `OIDCClientSecretSet` reflects
      whether `oidc_client_secret_encrypted` is non-null without ever
      scanning the encrypted bytes into the returned struct's public
      shape. Extend `store/instance_settings.go`'s queries.
- [x] 5.2 Write a failing test: `Update` with `DisableOIDC: true` clears
      every `oidc_*` column regardless of what else is in the same
      update. Implement (a dedicated SQL branch, not COALESCE, since
      COALESCE can't express "set to NULL").
- [x] 5.3 Write a failing test: `Update`'s `OIDCClientSecret` field, when
      provided, replaces `oidc_client_secret_encrypted`; when nil, leaves
      it untouched. (The store takes pre-encrypted bytes — encryption
      itself is a service-layer concern, tested in 3.3.)
- [x] 5.4 New `apps/api/internal/store/oidc_team_mappings.go` +
      `_test.go`: `Create(ctx, claimValue, teamID) (OIDCTeamMapping,
      error)`, `List(ctx) ([]OIDCTeamMapping, error)`, `Delete(ctx, id)
      error` (`ErrNotFound` on unknown id), cascading delete when the
      referenced `Team` is deleted (covered by the existing FK).
- [x] 5.5 Confirm (or add if missing) `store.Teams` has an idempotent
      "add member if not already one" — check `AddTeamMember`'s existing
      behavior with a test; adjust only if it errors on a duplicate add
      rather than no-op.

## 6. Service: settings, validation, encryption

- [x] 6.1 Write a failing test: `UpdateInstanceSettings` rejects a request
      that sets `OIDCClientSecret` while `Config.EncryptionKey` is empty,
      naming `TESTPULSE_ENCRYPTION_KEY` in the error. Implement (Service
      needs the encryption key — thread it through via a `WithEncryption
      Key(key string) *Service` builder, the same shape `WithMailer`
      already uses for an optional dependency).
- [x] 6.2 Write a failing test: `UpdateInstanceSettings` with a client
      secret encrypts it (assert the stored bytes differ from the
      plaintext by reading the raw column via the test's own DB
      connection) before persisting, and `InstanceSettings(ctx)` never
      exposes the plaintext or ciphertext, only `OIDCClientSecretSet`.
- [x] 6.3 Write a failing test: `UpdateInstanceSettings` with
      `DisableOIDC: true` clears every OIDC field, confirmed via a
      follow-up `InstanceSettings(ctx)` read.
- [x] 6.4 Add `Service.DecryptedOIDCClientSecret(ctx) (string, bool,
      error)` — used only by the server layer to build an
      `OIDCAuthenticator`; returns `ok=false` when nothing is configured.
      Write a failing test round-tripping through `UpdateInstanceSettings`
      then this method.

## 7. Service: OIDC login (mostly carried over, config source changes)

- [x] 7.1 Remove `Service.WithOIDC` and the `oidcAdminClaimValues`/
      `oidcOnly` fields — replace every read of them (`Login`,
      `ForgotPassword`, `ResetPassword`, `OIDCLogin`'s admin-claim check)
      with a live `s.store.InstanceSettings.Get(ctx)` call. Existing tests
      that called `.WithOIDC(...)` are rewritten to instead call
      `UpdateInstanceSettings` (or a store-level helper) to arrange the
      same state; behavior asserted is unchanged (SSO-only rejects
      password login; admin-claim grants/revokes `IsTenantAdmin`).
- [x] 7.2 Write a failing test: `OIDCLogin`, after resolving the user and
      applying admin-claim mapping, adds the user to every `Team` whose
      configured claim value is present in `OIDCClaims.GroupClaimValues`
      (rename `AdminClaimValues` → `GroupClaimValues` on the struct, since
      it now feeds two different mappings from the same claim) and they
      aren't already a member; implement via `store.Teams`+
      `store.OIDCTeamMappings.List`.
- [x] 7.3 Write a failing test: a claim value present on a previous login
      but absent on a later one does NOT remove existing Team membership
      (D10) — confirms the additive-only behavior explicitly, not just by
      omission.
- [x] 7.4 Write a failing test: multiple matching claim values add
      membership to multiple Teams in one login.
- [x] 7.5 State signing/verification (`signOIDCState`/`verifyOIDCState`,
      done, carried over) — re-key from the old
      `Config.OIDCClientSecret` to `Config.EncryptionKey` (D2's revision:
      the client secret is now runtime-editable, so state-signing needs
      the one value that's still stable). Update its tests' fixture key
      name only; the crypto itself is unchanged.
- [x] 7.6 Account-matching/JIT-provisioning logic (`resolveOIDCUser`,
      done, carried over) — unaffected by the config-source change.

## 8. Server: live-reloadable authenticator

- [x] 8.1 Add `server.OIDCManager` — `atomic.Pointer[OIDCAuthenticator]`
      behind `Get() *OIDCAuthenticator` / `Set(*OIDCAuthenticator)`. `api`
      struct holds `*OIDCManager` instead of a fixed `*OIDCAuthenticator`;
      `oidcLogin`/`oidcCallback`/`handleMeta` read through
      `h.oidcManager.Get()`. Write a failing test: swapping the manager's
      authenticator mid-test changes what the next request sees (e.g.
      `/auth/oidc/login` 404s before `Set`, 302s after).
- [x] 8.2 `PATCH /api/v1/instance-settings`: when the request changes any
      OIDC field, first attempt `NewOIDCAuthenticator` against the
      *proposed* merged values (requires resolving what the plaintext
      client secret would be — either the newly-submitted one, or the
      currently-decrypted one if omitted) — a discovery failure rejects
      the request with `400` before anything is persisted. On success,
      persist via `Service.UpdateInstanceSettings`, then `Set` the new
      authenticator on `OIDCManager`. Write a failing test for both the
      reject-before-persist and persist-then-swap paths, using the fake
      IdP harness from `oidc_fake_idp_test.go`.
- [x] 8.3 `disableSso: true` clears the manager (`Set(nil)`) after the
      service-layer clear succeeds.
- [x] 8.4 `main.go`: at boot, read `InstanceSettings`; if OIDC is
      configured, attempt `NewOIDCAuthenticator` the same way — log a
      warning and start with SSO disabled (not a fatal startup error) on
      failure, since this is now a runtime admin setting rather than
      deploy-time infra config (D8). No test for `main.go` itself
      (untested today, matches existing convention); covered indirectly
      by 8.2's server-level tests exercising the same construction path.

## 9. Server: Team-mapping CRUD

- [x] 9.1 Write a failing test: `GET /api/v1/sso/team-mappings`
      (Tenant-Admin-only, `403` otherwise) lists configured mappings.
- [x] 9.2 Write a failing test: `POST /api/v1/sso/team-mappings`
      `{claimValue, teamId}` creates one, `400` for an unknown `teamId`.
- [x] 9.3 Write a failing test: `DELETE /api/v1/sso/team-mappings/{id}`
      removes one, `404` for an unknown id.

## 10. OpenAPI contract

- [x] 10.1 Extend `InstanceSettings`/`InstanceSettingsUpdate` schemas with
      the new fields (`oidcIssuer`, `oidcClientId`, `oidcClientSecretSet`,
      `oidcGroupClaim`, `oidcAdminClaimValues`, `oidcOnly`,
      write-only `oidcClientSecret`, `disableSso`).
- [x] 10.2 Add `OIDCTeamMapping` schema and the three
      `/api/v1/sso/team-mappings` paths.
- [x] 10.3 `GET /auth/oidc/login`/`callback` and `ssoEnabled`/`ssoOnly` on
      `Meta` (done, carried over — unaffected by the config-source
      change).
- [x] 10.4 Run `make generate`; confirm a clean `api.ts` diff.

## 11. Web

- [x] 11.1 Write a failing `InstanceSettingsPage.test.tsx` case: a
      "Single sign-on" card renders issuer/client ID/client secret
      (masked, "•••• Replace" affordance)/group-claim/admin-values/
      SSO-only fields, a Save action, and a Disable action; implement.
- [x] 11.2 Write a failing test: saving surfaces a server-side validation
      error (e.g. unreachable issuer) inline rather than a silent
      failure.
- [x] 11.3 Write a failing test: the card never renders the actual client
      secret value, only whether one is set.
- [x] 11.4 Add a claim→Team mapping sub-list to the same card: existing
      mappings (claim value + Team name) with a remove action, and an
      add-row (text input + Team picker, reusing the existing Team list
      from `GET /api/v1/teams`). Write failing tests for list/add/remove.
- [x] 11.5 `LoginPage.tsx`'s SSO rendering (done, carried over — reads
      `ssoEnabled`/`ssoOnly` from `/api/v1/meta`, whose shape is
      unchanged by the config-source rework).
- [x] 11.6 Write a failing `SetupPage.test.tsx` case: the success step
      includes a pointer/link to Instance Settings mentioning SSO;
      implement the one line of copy.

## 12. Docs

- [x] 12.1 Rewrite `docs/deployment.md`'s SSO section: remove the
      `TESTPULSE_OIDC_*` config-reference rows (replaced by
      `TESTPULSE_ENCRYPTION_KEY`), describe the Settings-page card flow,
      the validate-before-save behavior, claim→Team mapping, and the
      encryption-key loss caveat (design.md D7's risk note).
- [x] 12.2 Update `docs/api.md`: `instance-settings` fields, the new
      `sso/team-mappings` endpoints; `/auth/oidc/*` routes and `meta`
      fields (already documented, confirm still accurate).

## 13. Sample Project showcase

- [x] 13.1 Per `CLAUDE.md`'s standing rule: no `seed.go` task — SSO
      requires a real external IdP and cannot be meaningfully faked in
      seeded data (unchanged by this rework).

## 14. Security fix: OIDC login-CSRF (found by automated review)

- [x] 14.1 Write a failing test: `oidcLogin`'s response sets exactly one
      `HttpOnly` `oidc_state` cookie carrying the same value as the `state`
      query param.
- [x] 14.2 Write a failing test: `oidcCallback` rejects (`401`) a validly-
      signed, unexpired `state` when no matching `oidc_state` cookie is
      presented — the login-CSRF regression test (design.md D2 revision).
      Configured with ID-token claims that would otherwise complete login
      successfully, so the test actually exercises the cookie check, not
      an incidental nonce/claims mismatch.
- [x] 14.3 Write a failing test: `oidcCallback` rejects a `state`/cookie
      value mismatch the same way.
- [x] 14.4 Implement: set the cookie in `oidcLogin`; check it via
      `hmac.Equal` in `oidcCallback` before the token exchange, clearing it
      immediately after (single-use). Update every existing login→callback
      test to carry the cookie forward, the way a real browser would.
