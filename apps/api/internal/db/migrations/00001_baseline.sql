-- +goose Up
-- Baseline migration: establishes the migration harness itself.
-- The first real schema arrives with the add-core-domain change.
SELECT 1;

-- +goose Down
SELECT 1;
