-- +goose Up
-- add-testrail-importer: a generic, source-opaque job the importer polls
-- and reports progress on (design.md D1/D2) — apps/api owns this table and
-- never parses source-specific meaning from `source` or `credentials`;
-- that's exclusively the importing tool's job. Reused by every future
-- vendor importer (#190-193) via the same `source` column, not a new table
-- per vendor.
CREATE TABLE import_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    source text NOT NULL,
    mode text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    -- Encrypted at rest via the existing encryptSecret/decryptSecret
    -- mechanism (service/oidc_secret.go) — never stored or read as
    -- plaintext. Scrubbed (set NULL) once a job reaches a terminal status
    -- (design.md D2).
    credentials bytea,
    report jsonb,
    progress_current integer DEFAULT 0 NOT NULL,
    progress_total integer DEFAULT 0 NOT NULL,
    error text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    CONSTRAINT import_jobs_pkey PRIMARY KEY (id),
    CONSTRAINT import_jobs_source_check CHECK ((source <> ''::text)),
    CONSTRAINT import_jobs_mode_check CHECK ((mode = ANY (ARRAY['dry_run'::text, 'real'::text]))),
    CONSTRAINT import_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text]))),
    CONSTRAINT import_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT import_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX import_jobs_project_status_idx ON import_jobs USING btree (project_id, status);
CREATE INDEX import_jobs_source_status_idx ON import_jobs USING btree (source, status);

-- +goose Down
DROP TABLE import_jobs;
