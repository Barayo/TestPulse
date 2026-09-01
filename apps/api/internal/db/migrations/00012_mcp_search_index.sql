-- +goose Up
-- add-mcp-server: cross-entity full-text search backing the MCP `search`
-- tool (design.md: "Postgres tsvector + GIN index, not ILIKE" — built for
-- DB scale from day one, per the standing aggregation-performance rule).
-- Each generated column only ever reads columns already present on its own
-- row, so no trigger is needed. Cases are indexed on their CURRENT version's
-- content only (title/expected result/description) via test_case_versions,
-- since that's the only version search should ever surface.
ALTER TABLE test_case_versions ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', title), 'A') ||
        setweight(to_tsvector('english', coalesce(expected_result, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED;
CREATE INDEX test_case_versions_search_idx ON test_case_versions USING GIN (search_vector);

ALTER TABLE test_suites ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', name)) STORED;
CREATE INDEX test_suites_search_idx ON test_suites USING GIN (search_vector);

ALTER TABLE test_runs ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', name)) STORED;
CREATE INDEX test_runs_search_idx ON test_runs USING GIN (search_vector);

ALTER TABLE projects ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;
CREATE INDEX projects_search_idx ON projects USING GIN (search_vector);

ALTER TABLE releases ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;
CREATE INDEX releases_search_idx ON releases USING GIN (search_vector);

ALTER TABLE test_plans ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;
CREATE INDEX test_plans_search_idx ON test_plans USING GIN (search_vector);

-- +goose Down
DROP INDEX IF EXISTS test_plans_search_idx;
ALTER TABLE test_plans DROP COLUMN search_vector;

DROP INDEX IF EXISTS releases_search_idx;
ALTER TABLE releases DROP COLUMN search_vector;

DROP INDEX IF EXISTS projects_search_idx;
ALTER TABLE projects DROP COLUMN search_vector;

DROP INDEX IF EXISTS test_runs_search_idx;
ALTER TABLE test_runs DROP COLUMN search_vector;

DROP INDEX IF EXISTS test_suites_search_idx;
ALTER TABLE test_suites DROP COLUMN search_vector;

DROP INDEX IF EXISTS test_case_versions_search_idx;
ALTER TABLE test_case_versions DROP COLUMN search_vector;
