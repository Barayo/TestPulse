package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/config"
	"github.com/Barayo/TestPulse/apps/api/internal/db"
	"github.com/Barayo/TestPulse/apps/api/internal/sampledata"
	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "testpulse-api: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	logger := newLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		return fmt.Errorf("running migrations: %w", err)
	}
	logger.Info("migrations applied", "status", "current")

	svc := service.New(store.New(pool))

	if err := svc.BootstrapAdmin(ctx, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		return fmt.Errorf("bootstrapping admin: %w", err)
	}
	seedSampleProjectIfEmpty(ctx, logger, svc)
	if err := svc.CleanupExpiredSessions(ctx); err != nil {
		logger.Warn("clearing expired sessions at startup", "error", err)
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.New(logger, db.NewHealth(pool), svc),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("api listening", "addr", cfg.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

// seedSampleProjectIfEmpty seeds the always-on Sample Project once, on an
// instance with zero projects — never re-seeds afterward, including after
// the Sample Project is later deleted (add-sample-project). Failure is
// logged, never fatal: a broken demo seed must not prevent the server from
// starting.
func seedSampleProjectIfEmpty(ctx context.Context, logger *slog.Logger, svc *service.Service) {
	has, err := svc.HasAnyProject(ctx)
	if err != nil {
		logger.Warn("checking for existing projects before seeding sample project", "error", err)
		return
	}
	if has {
		return
	}
	if err := sampledata.Seed(ctx, svc); err != nil {
		logger.Warn("seeding sample project", "error", err)
		return
	}
	logger.Info("sample project seeded")
}

func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
}
