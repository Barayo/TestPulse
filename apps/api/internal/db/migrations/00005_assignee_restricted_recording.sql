-- +goose Up
-- restrict-run-item-status-to-assignee: project-level opt-in requiring the
-- authenticated actor to match a run item's assignee (user or team member)
-- before recording a result or changing its status. Default off preserves
-- today's behavior.
ALTER TABLE projects
    ADD COLUMN assignee_restricted_recording boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE projects
    DROP COLUMN assignee_restricted_recording;
