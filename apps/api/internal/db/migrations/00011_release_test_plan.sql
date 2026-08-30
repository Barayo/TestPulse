-- +goose Up
-- introduce-release-test-plan: Release (project-scoped, lifecycle status)
-- and Test Plan (execution-scope grouping of runs, scoped to a Release) as
-- new, optional entities (design.md D1) — test_runs.test_plan_id is
-- nullable, so every existing run is unaffected and a run can still be
-- created directly under a project exactly as before this migration.
CREATE TABLE releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT releases_pkey PRIMARY KEY (id),
    CONSTRAINT releases_key_key UNIQUE (key),
    CONSTRAINT releases_name_check CHECK ((name <> ''::text)),
    CONSTRAINT releases_status_check CHECK ((status = ANY (ARRAY['active'::text, 'maintained'::text, 'eol'::text]))),
    CONSTRAINT releases_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX releases_project_idx ON releases USING btree (project_id);

CREATE TABLE test_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    project_id uuid NOT NULL,
    release_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT test_plans_pkey PRIMARY KEY (id),
    CONSTRAINT test_plans_key_key UNIQUE (key),
    CONSTRAINT test_plans_name_check CHECK ((name <> ''::text)),
    CONSTRAINT test_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT test_plans_release_id_fkey FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
);

CREATE INDEX test_plans_release_idx ON test_plans USING btree (release_id);
CREATE INDEX test_plans_project_idx ON test_plans USING btree (project_id);

ALTER TABLE test_runs
    ADD COLUMN test_plan_id uuid,
    ADD CONSTRAINT test_runs_test_plan_id_fkey FOREIGN KEY (test_plan_id) REFERENCES test_plans(id) ON DELETE SET NULL;

CREATE INDEX test_runs_test_plan_idx ON test_runs USING btree (test_plan_id);

-- Extend project_key_counters (claimEntityKey) to mint Release/Test Plan
-- keys too. The create_project_defaults trigger only seeds counters at
-- project-creation time, so every already-existing project needs its
-- 'release'/'plan' counters backfilled explicitly here.
ALTER TABLE project_key_counters
    DROP CONSTRAINT project_key_counters_entity_type_check,
    ADD CONSTRAINT project_key_counters_entity_type_check CHECK ((entity_type = ANY (ARRAY['case'::text, 'run'::text, 'suite'::text, 'release'::text, 'plan'::text])));

INSERT INTO project_key_counters (project_id, entity_type, next_value)
SELECT id, 'release', 1 FROM projects
UNION ALL
SELECT id, 'plan', 1 FROM projects;

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

-- +goose Down
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION create_project_defaults() RETURNS trigger AS $$
BEGIN
    INSERT INTO test_case_folders (project_id, parent_folder_id, name)
    VALUES (NEW.id, NULL, 'Root');
    INSERT INTO project_key_counters (project_id, entity_type, next_value)
    VALUES (NEW.id, 'case', 1), (NEW.id, 'run', 1), (NEW.id, 'suite', 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DELETE FROM project_key_counters WHERE entity_type IN ('release', 'plan');

ALTER TABLE project_key_counters
    DROP CONSTRAINT project_key_counters_entity_type_check,
    ADD CONSTRAINT project_key_counters_entity_type_check CHECK ((entity_type = ANY (ARRAY['case'::text, 'run'::text, 'suite'::text])));

ALTER TABLE test_runs
    DROP CONSTRAINT test_runs_test_plan_id_fkey,
    DROP COLUMN test_plan_id;

DROP TABLE test_plans;
DROP TABLE releases;
