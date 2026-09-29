-- +goose Up
-- add-mcp-idempotency-keys: a client-supplied idempotency key lets an
-- agent retry a create-style MCP tool call (create_test_run,
-- bulk_add_cases, upsert_test_case's create path) after a timeout without
-- double-creating (design.md D1). DB-backed, not in-memory — this app is
-- documented as safe to scale to multiple replicas sharing one Postgres,
-- so an in-process cache would silently miss a retry landing on a
-- different pod.
CREATE TABLE mcp_idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id text NOT NULL,
    tool_name text NOT NULL,
    idempotency_key text NOT NULL,
    result_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT mcp_idempotency_keys_pkey PRIMARY KEY (id),
    CONSTRAINT mcp_idempotency_keys_scope_key UNIQUE (actor_id, tool_name, idempotency_key)
);

-- +goose Down
DROP TABLE mcp_idempotency_keys;
