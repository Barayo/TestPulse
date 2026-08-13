// Package db owns PostgreSQL connectivity and schema application.
//
// Pre-1.0.0 only (replace-migrations-with-schema-sql): the schema is a
// single schema.sql, applied once to an empty database. There is no
// incremental migration history — see schema.sql's own header and
// design.md for why this is safe to do before 1.0.0 ships with real
// customer deployments to protect, and why it must not survive past that
// point.
package db

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaSQL string

func schemaChecksum() string {
	sum := sha256.Sum256([]byte(schemaSQL))
	return hex.EncodeToString(sum[:])
}

// Connect opens a pgx connection pool and verifies connectivity.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// ApplySchema applies schema.sql once, to an empty database, inside one
// transaction. On a database that already has it applied (a schema_info
// row exists), this is a no-op — repeated startups and rolling restarts
// are safe. It never errors on a checksum mismatch between what's stored
// and what the running binary expects — that's surfaced through
// SchemaCurrent (which backs /readyz) instead, so a stale schema fails
// readiness loudly rather than silently serving traffic against a schema
// the binary doesn't actually match.
func ApplySchema(ctx context.Context, pool *pgxpool.Pool) error {
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_info')`,
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("checking for schema_info table: %w", err)
	}
	if exists {
		return nil
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, schemaSQL); err != nil {
		return fmt.Errorf("applying schema.sql: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO schema_info (id, checksum) VALUES (true, $1)`, schemaChecksum(),
	); err != nil {
		return fmt.Errorf("recording schema checksum: %w", err)
	}
	return tx.Commit(ctx)
}

// SchemaCurrent reports whether the database's applied schema checksum
// matches the running binary's schema.sql. False (with no error) on a
// genuine mismatch; an error only if schema_info can't be read at all
// (e.g. ApplySchema has never run).
func SchemaCurrent(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	var checksum string
	err := pool.QueryRow(ctx, `SELECT checksum FROM schema_info WHERE id = true`).Scan(&checksum)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("schema_info has no row")
	}
	if err != nil {
		return false, err
	}
	return checksum == schemaChecksum(), nil
}

// Health checks dependency health for the readiness endpoint.
type Health struct {
	pool *pgxpool.Pool
}

func NewHealth(pool *pgxpool.Pool) *Health {
	return &Health{pool: pool}
}

// Ready returns nil when the database is reachable and the schema is current.
func (h *Health) Ready(ctx context.Context) error {
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := h.pool.Ping(pingCtx); err != nil {
		return fmt.Errorf("database unreachable: %w", err)
	}
	current, err := SchemaCurrent(ctx, h.pool)
	if err != nil {
		return fmt.Errorf("checking schema status: %w", err)
	}
	if !current {
		return fmt.Errorf("database schema does not match the running binary's schema.sql")
	}
	return nil
}
