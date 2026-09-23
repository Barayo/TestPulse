-- +goose Up
-- add-run-notifications: project-scoped outbound webhook destinations, a
-- generic HTTPS URL fired on a failed/blocked result or a run close
-- (design.md D1-D3) — no per-destination event-type filtering in v1,
-- every configured destination on a project receives every event.
CREATE TABLE webhook_destinations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_destinations_pkey PRIMARY KEY (id),
    CONSTRAINT webhook_destinations_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX webhook_destinations_project_id_idx ON webhook_destinations USING btree (project_id);

-- +goose Down
DROP TABLE webhook_destinations;
