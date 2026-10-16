-- +goose Up
-- add-unit-test-inventory (#34): a lean, auto-discovered record of
-- externally-run unit tests, distinct from the curated, versioned
-- TestCase/RunItem model. Identity is (project_id, class_name, name) —
-- the JUnit <testcase classname="..." name="..."> pair read directly off
-- a native report, no TestPulse-specific property required. unit_tests
-- caches the most recent result's fields so listing every test's current
-- status never joins against unit_test_results (design.md D2) — cardinality
-- here is explicitly high (tens of thousands per project), unlike
-- TestCase's low-cardinality curated library.
CREATE TABLE unit_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    class_name text NOT NULL,
    name text NOT NULL,
    first_seen_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    last_verdict text NOT NULL,
    last_duration_ms integer,
    last_occurred_at timestamp with time zone NOT NULL,
    CONSTRAINT unit_tests_pkey PRIMARY KEY (id),
    CONSTRAINT unit_tests_project_class_name_key UNIQUE (project_id, class_name, name),
    CONSTRAINT unit_tests_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- unit_test_results is per-reported-result history, bounded to the most
-- recent N rows per unit_test_id (pruned inline on write by the store
-- layer — design.md D4, no background worker). import_ref is a plain
-- free-text provenance marker: this capability never creates a Run, so
-- there is no FK target to point at.
CREATE TABLE unit_test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_test_id uuid NOT NULL,
    verdict text NOT NULL,
    duration_ms integer,
    occurred_at timestamp with time zone NOT NULL,
    import_ref text,
    CONSTRAINT unit_test_results_pkey PRIMARY KEY (id),
    CONSTRAINT unit_test_results_unit_test_id_fkey FOREIGN KEY (unit_test_id) REFERENCES unit_tests(id) ON DELETE CASCADE
);

CREATE INDEX unit_test_results_test_time_idx ON unit_test_results USING btree (unit_test_id, occurred_at);

-- +goose Down
DROP TABLE unit_test_results;
DROP TABLE unit_tests;
