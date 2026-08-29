-- +goose Up
-- add-case-authoring-formats: a case's content is authored in one of three
-- formats — structured steps (existing behavior, and the default for every
-- case created before this column existed), free text (the existing
-- description field holds the narrative, steps stay empty), or Gherkin
-- (a distinct free-form Given/When/Then source, kept separate from
-- description since the two are semantically different summaries).
ALTER TABLE test_case_versions
    ADD COLUMN format text DEFAULT 'steps'::text NOT NULL,
    ADD COLUMN gherkin_source text DEFAULT ''::text NOT NULL,
    ADD CONSTRAINT test_case_versions_format_check CHECK ((format = ANY (ARRAY['steps'::text, 'text'::text, 'gherkin'::text])));

-- +goose Down
ALTER TABLE test_case_versions
    DROP CONSTRAINT test_case_versions_format_check,
    DROP COLUMN format,
    DROP COLUMN gherkin_source;
