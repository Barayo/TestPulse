-- +goose Up
-- add-project-tags: a shared, deduplicated tag vocabulary (tags.name is
-- unique and stored normalized-lowercase by the service layer) plus a
-- project_tags join mirroring project_favorites's shape — tags are shared
-- project state (any viewer with read permission can assign/remove), not
-- per-user like favorites.
CREATE TABLE tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tags_pkey PRIMARY KEY (id),
    CONSTRAINT tags_name_key UNIQUE (name)
);

CREATE TABLE project_tags (
    project_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_tags_pkey PRIMARY KEY (project_id, tag_id),
    CONSTRAINT project_tags_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT project_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- +goose Down
DROP TABLE project_tags;
DROP TABLE tags;
