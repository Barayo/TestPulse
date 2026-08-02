-- +goose Up
-- fix-run-item-ordering: test_run_items.created_at defaulted to now(),
-- which is frozen for the whole transaction — every item pinned in one
-- run.Create() call (a single transaction) got byte-identical timestamps,
-- leaving `ORDER BY created_at` undefined among them. clock_timestamp()
-- advances on every call, even within one transaction, so items created
-- together still sort in insertion order.
ALTER TABLE test_run_items
    ALTER COLUMN created_at SET DEFAULT clock_timestamp();

-- +goose Down
ALTER TABLE test_run_items
    ALTER COLUMN created_at SET DEFAULT now();
