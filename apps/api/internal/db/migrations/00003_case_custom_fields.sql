-- +goose Up
-- add-case-custom-fields: project-scoped custom field definitions
-- (text/select) on test cases, plus their values on versioned case
-- content.
CREATE TABLE case_custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (name <> ''),
    field_type text NOT NULL CHECK (field_type IN ('text', 'select')),
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_custom_fields_project_id_idx ON case_custom_fields(project_id);

CREATE TABLE case_custom_field_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    field_id uuid NOT NULL REFERENCES case_custom_fields(id) ON DELETE CASCADE,
    value text NOT NULL CHECK (value <> ''),
    position integer NOT NULL DEFAULT 0
);
CREATE INDEX case_custom_field_options_field_id_idx ON case_custom_field_options(field_id);

ALTER TABLE test_case_versions
    ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE test_case_versions
    DROP COLUMN custom_fields;
DROP TABLE case_custom_field_options;
DROP TABLE case_custom_fields;
