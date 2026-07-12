-- +goose Up
-- Core test management domain (add-core-domain).
-- Design decisions D1–D3: immutable case versioning, version pinning on run
-- items, append-only result log with materialized current_status.
-- D8: project-level case folders, orthogonal to suites.

CREATE TABLE projects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL CHECK (name <> ''),
    archived    boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Self-referencing folder tree per project (D8). Exactly one row per project
-- has parent_folder_id IS NULL — that is the project's root folder, created
-- automatically by the trigger below. All other folders must have a parent.
CREATE TABLE test_case_folders (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        uuid NOT NULL REFERENCES projects (id),
    parent_folder_id  uuid REFERENCES test_case_folders (id),
    name              text NOT NULL CHECK (name <> ''),
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_case_folders_project_idx ON test_case_folders (project_id);
CREATE INDEX test_case_folders_parent_idx ON test_case_folders (parent_folder_id);
-- At most one root (NULL-parent) folder per project.
CREATE UNIQUE INDEX test_case_folders_one_root_idx
    ON test_case_folders (project_id) WHERE parent_folder_id IS NULL;

-- +goose StatementBegin
CREATE FUNCTION create_project_root_folder() RETURNS trigger AS $$
BEGIN
    INSERT INTO test_case_folders (project_id, parent_folder_id, name)
    VALUES (NEW.id, NULL, 'Root');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER projects_create_root_folder
    AFTER INSERT ON projects
    FOR EACH ROW EXECUTE FUNCTION create_project_root_folder();

CREATE TABLE test_cases (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects (id),
    folder_id       uuid NOT NULL REFERENCES test_case_folders (id),
    current_version integer NOT NULL DEFAULT 1,
    deleted         boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_cases_project_idx ON test_cases (project_id) WHERE NOT deleted;
CREATE INDEX test_cases_folder_idx ON test_cases (folder_id) WHERE NOT deleted;

-- Immutable content rows: one per version, never updated (D1).
CREATE TABLE test_case_versions (
    case_id         uuid NOT NULL REFERENCES test_cases (id),
    version         integer NOT NULL CHECK (version >= 1),
    title           text NOT NULL CHECK (title <> ''),
    description     text NOT NULL DEFAULT '',
    steps           jsonb NOT NULL DEFAULT '[]',
    expected_result text NOT NULL DEFAULT '',
    priority        text NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    tags            text[] NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, version)
);

CREATE TABLE test_suites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects (id),
    name        text NOT NULL CHECK (name <> ''),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_suites_project_idx ON test_suites (project_id);

CREATE TABLE suite_cases (
    suite_id  uuid NOT NULL REFERENCES test_suites (id) ON DELETE CASCADE,
    case_id   uuid NOT NULL REFERENCES test_cases (id),
    PRIMARY KEY (suite_id, case_id)
);

CREATE TABLE test_runs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects (id),
    name        text NOT NULL CHECK (name <> ''),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_runs_project_idx ON test_runs (project_id);

-- Run items pin an exact case version at insert time (D2).
CREATE TABLE test_run_items (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id         uuid NOT NULL REFERENCES test_runs (id) ON DELETE CASCADE,
    case_id        uuid NOT NULL,
    case_version   integer NOT NULL,
    assignee       text NOT NULL DEFAULT '',
    current_status text NOT NULL DEFAULT 'pending'
                   CHECK (current_status IN
                          ('pending', 'pass', 'failed', 'skipped', 'blocked', 'retest')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, case_id),
    FOREIGN KEY (case_id, case_version)
        REFERENCES test_case_versions (case_id, version)
);
CREATE INDEX test_run_items_run_idx ON test_run_items (run_id);

-- Append-only: application code only ever INSERTs here (D3).
CREATE TABLE test_run_results (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_item_id  uuid NOT NULL REFERENCES test_run_items (id) ON DELETE CASCADE,
    actor        text NOT NULL CHECK (actor <> ''),
    verdict      text NOT NULL
                 CHECK (verdict IN ('pass', 'failed', 'skipped', 'blocked')),
    comment      text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_run_results_item_idx ON test_run_results (run_item_id, created_at);

-- +goose Down
DROP TABLE test_run_results;
DROP TABLE test_run_items;
DROP TABLE test_runs;
DROP TABLE suite_cases;
DROP TABLE test_suites;
DROP TABLE test_case_versions;
DROP TABLE test_cases;
DROP TRIGGER projects_create_root_folder ON projects;
DROP FUNCTION create_project_root_folder();
DROP TABLE test_case_folders;
DROP TABLE projects;
