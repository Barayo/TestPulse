-- +goose Up
-- add-case-reference-attachments: reference files (images, PDFs) attached to
-- a test case's identity rather than a specific CaseVersion — the same
-- "identity-level, not versioned content" treatment as JiraIssueKey
-- (design.md D1). Independent of result_attachments, which belongs to run
-- execution evidence, not a case's own definition.
CREATE TABLE case_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    image bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT case_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT case_attachments_case_id_fkey FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

CREATE INDEX case_attachments_case_id_idx ON case_attachments USING btree (case_id);

-- +goose Down
DROP TABLE case_attachments;
