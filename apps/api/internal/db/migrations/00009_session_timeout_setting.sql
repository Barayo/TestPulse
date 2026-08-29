-- +goose Up
-- add-session-timeout-setting: the sliding session expiry window, previously
-- a hardcoded 30-day constant (apps/api/internal/service/identity.go), is
-- now a Tenant-Admin-configurable instance setting, bounded 1-90 days at
-- the service layer. The default of 30 preserves today's behavior for any
-- instance that never touches the setting.
ALTER TABLE instance_settings
    ADD COLUMN session_timeout_days integer DEFAULT 30 NOT NULL;

-- +goose Down
ALTER TABLE instance_settings
    DROP COLUMN session_timeout_days;
