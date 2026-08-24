-- +goose Up
-- add-sso-oidc: OIDC/SSO login. Password login stays available (a user may
-- still be created by a Tenant Admin with a password), but a
-- JIT-provisioned SSO-only account never sets one.
ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users
    ADD COLUMN oidc_subject text UNIQUE;

-- SSO settings live on the same Tenant-Admin-configurable instance_settings
-- row as every other instance-wide setting (design.md D1) — no separate
-- config table, no env vars beyond TESTPULSE_ENCRYPTION_KEY/PUBLIC_URL.
-- The client secret is encrypted at rest (design.md D7); this column holds
-- opaque ciphertext, never plaintext.
ALTER TABLE instance_settings
    ADD COLUMN oidc_issuer text,
    ADD COLUMN oidc_client_id text,
    ADD COLUMN oidc_client_secret_encrypted bytea,
    ADD COLUMN oidc_group_claim text,
    ADD COLUMN oidc_admin_claim_values text[],
    ADD COLUMN oidc_only boolean NOT NULL DEFAULT false;

-- Claim-based Team mapping (design.md D10): additive-only sync of Team
-- membership from an OIDC group claim's values, re-evaluated on every login.
CREATE TABLE oidc_team_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    claim_value text NOT NULL,
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE
);
CREATE INDEX oidc_team_mappings_team_id_idx ON oidc_team_mappings(team_id);

-- +goose Down
DROP TABLE oidc_team_mappings;
ALTER TABLE instance_settings
    DROP COLUMN oidc_issuer,
    DROP COLUMN oidc_client_id,
    DROP COLUMN oidc_client_secret_encrypted,
    DROP COLUMN oidc_group_claim,
    DROP COLUMN oidc_admin_claim_values,
    DROP COLUMN oidc_only;
ALTER TABLE users
    DROP COLUMN oidc_subject;
ALTER TABLE users
    ALTER COLUMN password_hash SET NOT NULL;
