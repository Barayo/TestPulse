-- +goose Up
-- add-folder-slug-urls: folders gain a routing slug (derived from name,
-- used to build a human-readable browser URL, e.g. /library/authentication/
-- two-factor) and a single-hop "previous identity" pair, so a bookmark
-- survives one move before falling back to a clean not-found. See
-- openspec/changes/add-folder-slug-urls/design.md for the full rationale.
--
-- previous_parent_folder_id has ON DELETE SET NULL for FK correctness, but
-- this app never hard-deletes folders (DeleteFolder only sets `deleted`),
-- so in practice this branch is unreachable.
ALTER TABLE test_case_folders
    ADD COLUMN slug text,
    ADD COLUMN previous_slug text,
    ADD COLUMN previous_parent_folder_id uuid REFERENCES test_case_folders(id) ON DELETE SET NULL;

-- One-shot backfill: compute every existing folder's slug and disambiguate
-- duplicates. Partitioned by (project_id, parent_folder_id, base_slug) --
-- critically INCLUDING project_id, not parent_folder_id alone. Every
-- project's root folder shares parent_folder_id IS NULL and the identical
-- hardcoded name "Root" (create_project_defaults trigger) -- partitioning
-- without project_id would treat every project's root folder in the whole
-- instance as one giant duplicate group and rewrite most of them.
--
-- base_slug mirrors (not byte-for-byte, but in spirit) the Go slugify
-- helper added alongside this migration: NFKC-normalize, lowercase, strip
-- non-alphanumerics, collapse repeated hyphens, trim leading/trailing
-- hyphens. A name with no slugifiable characters (emoji/punctuation-only)
-- falls back to the literal string 'folder' for this one-time backfill only
-- -- going forward, ValidateFolderName rejects such a name outright, so
-- this fallback only ever applies to legacy data that predates that check.
-- Oldest folder (by created_at, id as a deterministic tiebreak) within each
-- group keeps the clean name/slug; later duplicates get a numeric suffix
-- appended to both.
-- +goose StatementBegin
WITH base AS (
    SELECT
        id,
        project_id,
        parent_folder_id,
        name,
        created_at,
        COALESCE(
            NULLIF(
                regexp_replace(
                    regexp_replace(lower(normalize(trim(name), nfkc)), '[^a-z0-9]+', '-', 'g'),
                    '(^-+)|(-+$)', '', 'g'
                ),
                ''
            ),
            'folder'
        ) AS base_slug
    FROM test_case_folders
),
ranked AS (
    SELECT
        id,
        name,
        base_slug,
        ROW_NUMBER() OVER (
            PARTITION BY project_id, parent_folder_id, base_slug
            ORDER BY created_at, id
        ) AS rnk
    FROM base
)
UPDATE test_case_folders t
SET
    name = CASE WHEN r.rnk = 1 THEN t.name ELSE t.name || '-' || r.rnk END,
    slug = CASE WHEN r.rnk = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rnk END
FROM ranked r
WHERE t.id = r.id;
-- +goose StatementEnd

-- Now safe: every folder has a slug, and disambiguation above guarantees
-- no pre-existing collision within a (project_id, parent_folder_id) group.
ALTER TABLE test_case_folders
    ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX test_case_folders_project_parent_slug_idx
    ON test_case_folders (project_id, parent_folder_id, slug)
    WHERE (NOT deleted);

-- create_project_defaults (00013_step_groups.sql) inserts every new
-- project's root folder directly -- it also needs to stamp slug now that
-- the column is NOT NULL, or every future CreateProject call fails.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION create_project_defaults() RETURNS trigger AS $$
BEGIN
    INSERT INTO test_case_folders (project_id, parent_folder_id, name, slug)
    VALUES (NEW.id, NULL, 'Root', 'root');
    INSERT INTO project_key_counters (project_id, entity_type, next_value)
    VALUES (NEW.id, 'case', 1), (NEW.id, 'run', 1), (NEW.id, 'suite', 1), (NEW.id, 'release', 1), (NEW.id, 'plan', 1), (NEW.id, 'stepgroup', 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
DROP INDEX test_case_folders_project_parent_slug_idx;

ALTER TABLE test_case_folders
    DROP COLUMN slug,
    DROP COLUMN previous_slug,
    DROP COLUMN previous_parent_folder_id;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION create_project_defaults() RETURNS trigger AS $$
BEGIN
    INSERT INTO test_case_folders (project_id, parent_folder_id, name)
    VALUES (NEW.id, NULL, 'Root');
    INSERT INTO project_key_counters (project_id, entity_type, next_value)
    VALUES (NEW.id, 'case', 1), (NEW.id, 'run', 1), (NEW.id, 'suite', 1), (NEW.id, 'release', 1), (NEW.id, 'plan', 1), (NEW.id, 'stepgroup', 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
