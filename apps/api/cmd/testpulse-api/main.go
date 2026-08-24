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
	"github.com/Barayo/TestPulse/apps/api/internal/mailer"
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

	if err := db.MigrateWithOptions(ctx, pool, cfg.AllowMissingMigrations); err != nil {
		return fmt.Errorf("applying migrations: %w", err)
	}
	if current, err := db.MigrationsCurrent(ctx, pool); err != nil {
		logger.Warn("checking migration status", "error", err)
	} else if !current {
		logger.Warn("database schema is not at the latest migration")
	} else {
		logger.Info("migrations applied", "status", "current")
	}

	svc := service.New(store.New(pool)).WithMailer(
		&mailer.SMTPSender{
			Host: cfg.SMTPHost, Port: cfg.SMTPPort,
			Username: cfg.SMTPUsername, Password: cfg.SMTPPassword,
			From: cfg.SMTPFromAddress,
		},
		cfg.PublicURL, cfg.PasswordResetEnabled(),
	).WithEncryptionKey(cfg.EncryptionKey)

	oidcManager := buildOIDCManager(ctx, logger, svc, cfg.PublicURL, cfg.EncryptionKey)
	sso := &server.SSOConfig{Manager: oidcManager, PublicURL: cfg.PublicURL, EncryptionKey: cfg.EncryptionKey}

	if err := svc.BootstrapAdmin(ctx, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		return fmt.Errorf("bootstrapping admin: %w", err)
	}
	seedSampleProjectIfEmpty(ctx, logger, svc)
	if err := svc.CleanupExpiredSessions(ctx); err != nil {
		logger.Warn("clearing expired sessions at startup", "error", err)
	}

	// The codebase's first background worker (add-data-retention design.md
	// D6) — purges projects queued for permanent deletion. Runs for the
	// server's whole lifetime; ctx cancellation (the same signal-driven
	// context the HTTP server shuts down on) stops it cleanly.
	go service.NewProjectDeletionWorker(svc).Run(ctx)

	// A second, independent background worker (add-data-retention design.md
	// D8) — automatically deletes closed runs past the configured
	// instance-wide age threshold. No-ops entirely while the threshold is 0
	// (the default). Same signal-cancelled ctx.
	go service.NewRunRetentionWorker(svc).Run(ctx)

	// A third, independent background worker (add-data-retention design.md
	// D9) — automatically archives inactive, non-exempt projects past the
	// configured instance-wide inactivity threshold. Same signal-cancelled
	// ctx.
	go service.NewProjectAutoArchiveWorker(svc).Run(ctx)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.New(logger, db.NewHealth(pool), svc, cfg.LoginRateLimitPerMinute, cfg.LoginRateLimitBurst, sso),
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

// buildOIDCManager reads whatever SSO settings a Tenant Admin has already
// saved and attempts discovery for them at boot, so a restart doesn't leave
// SSO silently disabled. Unlike a bad database connection, a bad IdP is not
// a fatal startup error (add-sso-oidc design.md D8) — SSO is a runtime
// admin setting, not deploy-time infra config, so this logs a warning and
// starts with SSO disabled instead of crash-looping the whole app over a
// third-party dependency someone else configured.
func buildOIDCManager(ctx context.Context, logger *slog.Logger, svc *service.Service, publicURL, encryptionKey string) *server.OIDCManager {
	manager := server.NewOIDCManager()
	settings, err := svc.InstanceSettings(ctx)
	if err != nil {
		logger.Warn("reading instance settings for SSO at startup", "error", err)
		return manager
	}
	if settings.OIDCIssuer == "" || settings.OIDCClientID == "" || !settings.OIDCClientSecretSet {
		return manager
	}
	secret, ok, err := svc.DecryptedOIDCClientSecret(ctx)
	if err != nil || !ok {
		logger.Warn("decrypting stored OIDC client secret at startup", "error", err)
		return manager
	}
	auth, err := server.NewOIDCAuthenticator(ctx, server.OIDCAuthenticatorConfig{
		Issuer: settings.OIDCIssuer, ClientID: settings.OIDCClientID, ClientSecret: secret,
		PublicURL: publicURL, GroupClaim: settings.OIDCGroupClaim, StateSigningKey: encryptionKey,
	})
	if err != nil {
		logger.Warn("discovering configured OIDC provider at startup; starting with SSO disabled", "error", err)
		return manager
	}
	manager.Set(auth)
	return manager
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
