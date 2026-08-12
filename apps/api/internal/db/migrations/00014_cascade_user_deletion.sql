-- +goose Up
ALTER TABLE sessions
    DROP CONSTRAINT sessions_user_id_fkey,
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE api_tokens
    DROP CONSTRAINT api_tokens_created_by_fkey,
    ADD CONSTRAINT api_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE sessions
    DROP CONSTRAINT sessions_user_id_fkey,
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE api_tokens
    DROP CONSTRAINT api_tokens_created_by_fkey,
    ADD CONSTRAINT api_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id);
