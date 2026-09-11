-- +goose Up
-- add-requirements-traceability: Requirement (project-scoped, flat) and its
-- many-to-many link to test cases, mirroring suite_cases' structure (design.md
-- D1). Coverage status is always computed at read time (D3) — no status
-- column here.
CREATE TABLE requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    external_ref text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT requirements_pkey PRIMARY KEY (id),
    CONSTRAINT requirements_key_key UNIQUE (key),
    CONSTRAINT requirements_name_check CHECK ((name <> ''::text)),
    CONSTRAINT requirements_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX requirements_project_idx ON requirements USING btree (project_id);

CREATE TABLE requirement_cases (
    requirement_id uuid NOT NULL,
    case_id uuid NOT NULL,
    CONSTRAINT requirement_cases_pkey PRIMARY KEY (requirement_id, case_id),
    CONSTRAINT requirement_cases_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
    CONSTRAINT requirement_cases_case_id_fkey FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE INDEX requirement_cases_case_idx ON requirement_cases USING btree (case_id);
CREATE INDEX requirement_cases_requirement_idx ON requirement_cases USING btree (requirement_id);

-- Extend project_key_counters (claimEntityKey) to mint Requirement keys too,
-- same pattern as introduce-release-test-plan's 'release'/'plan' addition.
ALTER TABLE project_key_counters
    DROP CONSTRAINT project_key_counters_entity_type_check,
    ADD CONSTRAINT project_key_counters_entity_type_check CHECK ((entity_type = ANY (ARRAY['case'::text, 'run'::text, 'suite'::text, 'release'::text, 'plan'::text, 'stepgroup'::text, 'requirement'::text])));

INSERT INTO project_key_counters (project_id, entity_type, next_value)
SELECT id, 'requirement', 1 FROM projects;

-- Carries forward 00014_folder_slugs.sql's slug-stamping root-folder insert
-- verbatim (slug column is NOT NULL) — only the counters list changes here.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION create_project_defaults() RETURNS trigger AS $$
BEGIN
    INSERT INTO test_case_folders (project_id, parent_folder_id, name, slug)
    VALUES (NEW.id, NULL, 'Root', 'root');
    INSERT INTO project_key_counters (project_id, entity_type, next_value)
    VALUES (NEW.id, 'case', 1), (NEW.id, 'run', 1), (NEW.id, 'suite', 1), (NEW.id, 'release', 1), (NEW.id, 'plan', 1), (NEW.id, 'stepgroup', 1), (NEW.id, 'requirement', 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
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

DELETE FROM project_key_counters WHERE entity_type = 'requirement';

ALTER TABLE project_key_counters
    DROP CONSTRAINT project_key_counters_entity_type_check,
    ADD CONSTRAINT project_key_counters_entity_type_check CHECK ((entity_type = ANY (ARRAY['case'::text, 'run'::text, 'suite'::text, 'release'::text, 'plan'::text, 'stepgroup'::text])));

DROP TABLE requirement_cases;
DROP TABLE requirements;
