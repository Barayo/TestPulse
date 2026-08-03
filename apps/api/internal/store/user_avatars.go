package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserAvatarRepo persists uploaded custom avatar photos, kept in a table
// separate from users so listing/fetching users never pulls image bytes
// along with it (add-custom-avatar-upload design.md).
type UserAvatarRepo struct {
	pool *pgxpool.Pool
}

// Put stores (or replaces) the given user's custom avatar image.
func (r *UserAvatarRepo) Put(ctx context.Context, userID string, image []byte, contentType string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO user_avatars (user_id, image, content_type, updated_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (user_id) DO UPDATE
		   SET image = EXCLUDED.image, content_type = EXCLUDED.content_type, updated_at = now()`,
		userID, image, contentType,
	)
	return err
}

// Get returns the stored image, content type, and last-updated time for a
// user's custom avatar. Returns ErrNotFound if the user has none stored.
func (r *UserAvatarRepo) Get(ctx context.Context, userID string) ([]byte, string, time.Time, error) {
	var image []byte
	var contentType string
	var updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT image, content_type, updated_at FROM user_avatars WHERE user_id = $1`, userID,
	).Scan(&image, &contentType, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", time.Time{}, ErrNotFound
	}
	if err != nil {
		return nil, "", time.Time{}, err
	}
	return image, contentType, updatedAt, nil
}

// Delete removes a user's custom avatar, if one exists. Deleting a user who
// has none is not an error — the end state ("no custom avatar stored") is
// identical either way.
func (r *UserAvatarRepo) Delete(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM user_avatars WHERE user_id = $1`, userID)
	return err
}
