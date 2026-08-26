-- +goose Up
-- add-library-folder-selection: a folder can now be moved (reparented), a
-- capability that didn't exist before at any permission tier. sectionEdit
-- mirrors caseEdit's own tier — Contributor and Project Admin get it by
-- default, the same rank threshold sectionCreate already uses.
ALTER TABLE roles
    ADD COLUMN can_section_edit boolean NOT NULL DEFAULT false;

UPDATE roles SET can_section_edit = true WHERE name IN ('Contributor', 'Project Admin');

-- +goose Down
ALTER TABLE roles
    DROP COLUMN can_section_edit;
