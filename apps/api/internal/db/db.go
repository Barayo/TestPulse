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
	return MigrateWithOptions(ctx, pool, false)
}

// MigrateWithOptions is Migrate with an escape hatch for recovering from a
// migration-history gap: allowMissing=true tells goose to apply any
// migration whose version is below the database's recorded max version but
// was never itself recorded as applied — rather than refuse to start, which
// is goose's default (and correct) behavior, since that gap is normally a
// sign of a genuinely broken deploy history (2026-08-03: a stale build that
// didn't embed one migration file applied every version around it, leaving
// that one version missing from the applied set forever after). This is a
// deliberate, rarely-used recovery path — TESTPULSE_ALLOW_MISSING_MIGRATIONS
// wires it up, off by default, so the safety check stays on for normal
// operation.
func MigrateWithOptions(ctx context.Context, pool *pgxpool.Pool, allowMissing bool) error {
	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() { _ = sqlDB.Close() }()
	var opts []goose.OptionsFunc
	if allowMissing {
		opts = append(opts, goose.WithAllowMissing())
	}
	return goose.UpContext(ctx, sqlDB, "migrations", opts...)
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
