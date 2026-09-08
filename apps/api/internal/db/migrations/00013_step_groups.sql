-- +goose Up
-- add-reusable-steps: a project-scoped, named, ordered list of steps a
-- test case's content may reference. Mutable in place (not itself
-- versioned, like Folder/CustomField) — its edit history is the generic
-- audit log. Soft-deletable via `deleted`, matching test_case_folders'
-- convention, so an already-saved case version's resolved content (which
-- never references this table at read time — see design.md) is
-- unaffected by a later group deletion.
CREATE TABLE step_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT step_groups_pkey PRIMARY KEY (id),
    CONSTRAINT step_groups_key_key UNIQUE (key),
    CONSTRAINT step_groups_name_check CHECK ((name <> ''::text)),
    CONSTRAINT step_groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX step_groups_project_idx ON step_groups USING btree (project_id) WHERE (NOT deleted);

-- Extend project_key_counters (claimEntityKey) to mint StepGroup keys too.
-- The create_project_defaults trigger only seeds counters at
-- project-creation time, so every already-existing project needs its
-- 'stepgroup' counter backfilled explicitly here.
ALTER TABLE project_key_counters
    DROP CONSTRAINT project_key_counters_entity_type_check,
    ADD CONSTRAINT project_key_counters_entity_type_check CHECK ((entity_type = ANY (ARRAY['case'::text, 'run'::text, 'suite'::text, 'release'::text, 'plan'::text, 'stepgroup'::text])));

INSERT INTO project_key_counters (project_id, entity_type, next_value)
SELECT id, 'stepgroup', 1 FROM projects;

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

-- +goose Down
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION create_project_defaults() RETURNS trigger AS $$
BEGIN
    INSERT INTO test_case_folders (project_id, parent_folder_id, name)
    VALUES (NEW.id, NULL, 'Root');
    INSERT INTO project_key_counters (project_id, entity_type, next_value)
    VALUES (NEW.id, 'case', 1), (NEW.id, 'run', 1), (NEW.id, 'suite', 1), (NEW.id, 'release', 1), (NEW.id, 'plan', 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DELETE FROM project_key_counters WHERE entity_type = 'stepgroup';

ALTER TABLE project_key_counters
    DROP CONSTRAINT project_key_counters_entity_type_check,
    ADD CONSTRAINT project_key_counters_entity_type_check CHECK ((entity_type = ANY (ARRAY['case'::text, 'run'::text, 'suite'::text, 'release'::text, 'plan'::text])));

DROP TABLE step_groups;
