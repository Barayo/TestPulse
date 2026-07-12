// Package db owns PostgreSQL connectivity and schema migrations.
package db

import (
	"context"
	"embed"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

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

// Migrate applies all pending migrations. Goose tracks applied versions in
// the goose_db_version table, so repeated startups are no-ops.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()
	return goose.UpContext(ctx, sqlDB, "migrations")
}

// MigrationsCurrent reports whether the database schema is at the latest
// embedded migration version.
func MigrationsCurrent(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return false, err
	}
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()

	dbVersion, err := goose.GetDBVersionContext(ctx, sqlDB)
	if err != nil {
		return false, err
	}
	migrations, err := goose.CollectMigrations("migrations", 0, goose.MaxVersion)
	if err != nil {
		return false, err
	}
	var latest int64
	if len(migrations) > 0 {
		latest = migrations[len(migrations)-1].Version
	}
	return dbVersion >= latest, nil
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
	current, err := MigrationsCurrent(ctx, h.pool)
	if err != nil {
		return fmt.Errorf("checking migration status: %w", err)
	}
	if !current {
		return fmt.Errorf("database schema is not at the latest migration")
	}
	return nil
}
