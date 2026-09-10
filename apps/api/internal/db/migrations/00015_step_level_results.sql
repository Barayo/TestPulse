-- +goose Up
-- add-step-level-results: per-step pass/fail marking on a run item,
-- independent of its overall verdict (design.md). Two tables, matching
-- the existing test_run_results/result_attachments precedent of
-- separating "live" from "historical" state:
--   - test_run_item_step_states: the mutable, carry-forward "current"
--     mark per step. Scoped to run_item_id (not case_id), so a fresh run
--     of the same case always starts unmarked.
--   - test_run_result_steps: an immutable snapshot of step verdicts,
--     written once per Result at the moment it's recorded, never updated
--     afterward — keeping "past results never change" a schema-level
--     fact rather than an application-level promise.
-- Steps have no stable ID of their own; a run item's pinned content.steps
-- never changes after creation, so the step's own array index is a
-- stable, sufficient identifier (design.md).
CREATE TABLE test_run_item_step_states (
    run_item_id uuid NOT NULL,
    step_index integer NOT NULL,
    verdict text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT test_run_item_step_states_pkey PRIMARY KEY (run_item_id, step_index),
    CONSTRAINT test_run_item_step_states_run_item_id_fkey FOREIGN KEY (run_item_id) REFERENCES test_run_items(id) ON DELETE CASCADE,
    CONSTRAINT test_run_item_step_states_step_index_check CHECK ((step_index >= 0)),
    CONSTRAINT test_run_item_step_states_verdict_check CHECK ((verdict = ANY (ARRAY['pass'::text, 'failed'::text, 'skipped'::text, 'blocked'::text])))
);

CREATE TABLE test_run_result_steps (
    result_id uuid NOT NULL,
    step_index integer NOT NULL,
    verdict text NOT NULL,
    CONSTRAINT test_run_result_steps_pkey PRIMARY KEY (result_id, step_index),
    CONSTRAINT test_run_result_steps_result_id_fkey FOREIGN KEY (result_id) REFERENCES test_run_results(id) ON DELETE CASCADE,
    CONSTRAINT test_run_result_steps_step_index_check CHECK ((step_index >= 0)),
    CONSTRAINT test_run_result_steps_verdict_check CHECK ((verdict = ANY (ARRAY['pass'::text, 'failed'::text, 'skipped'::text, 'blocked'::text])))
);

-- +goose Down
DROP TABLE test_run_result_steps;
DROP TABLE test_run_item_step_states;
