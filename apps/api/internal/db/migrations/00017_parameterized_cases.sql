-- +goose Up
-- add-parameterized-cases: an optional data-driven parameter table on a
-- Steps-format case version, and which row (by Name) a run item was
-- expanded from. Both nullable — every existing row is unaffected.
ALTER TABLE test_case_versions
    ADD COLUMN parameters jsonb;

ALTER TABLE test_run_items
    ADD COLUMN test_data_row_name text;

-- The baseline's blanket UNIQUE (run_id, case_id) assumed a case could
-- only ever appear once per run — a parameterized case now needs to pin
-- the SAME case_id once per data row within one run. Replaced with two
-- partial unique indexes: the original one-item-per-case-per-run
-- invariant is preserved for every ordinary (non-parameterized) item
-- (test_data_row_name IS NULL), while a parameterized item is unique per
-- (run, case, row) instead, allowing multiple rows of the same case.
ALTER TABLE test_run_items
    DROP CONSTRAINT test_run_items_run_id_case_id_key;

CREATE UNIQUE INDEX test_run_items_run_case_no_row_idx
    ON test_run_items (run_id, case_id) WHERE test_data_row_name IS NULL;

CREATE UNIQUE INDEX test_run_items_run_case_row_idx
    ON test_run_items (run_id, case_id, test_data_row_name) WHERE test_data_row_name IS NOT NULL;

-- +goose Down
DROP INDEX test_run_items_run_case_row_idx;
DROP INDEX test_run_items_run_case_no_row_idx;

ALTER TABLE test_run_items
    ADD CONSTRAINT test_run_items_run_id_case_id_key UNIQUE (run_id, case_id);

ALTER TABLE test_run_items
    DROP COLUMN test_data_row_name;

ALTER TABLE test_case_versions
    DROP COLUMN parameters;
