// Package config loads runtime configuration from environment variables.
//
// Documented variables:
//
//	TESTPULSE_DATABASE_URL  (required) PostgreSQL connection string,
//	                        e.g. postgres://user:pass@host:5432/testpulse
//	TESTPULSE_ADDR          (default ":8080") listen address for the HTTP server
//	TESTPULSE_LOG_LEVEL     (default "info") one of debug, info, warn, error
//	TESTPULSE_ADMIN_EMAIL, TESTPULSE_ADMIN_PASSWORD
//	                        (optional, both required together) seed one
//	                        admin user on first startup if the users table
//	                        is empty; ignored on any later startup once
//	                        users exist
//	TESTPULSE_SMTP_HOST, TESTPULSE_SMTP_PORT, TESTPULSE_SMTP_USERNAME,
//	TESTPULSE_SMTP_PASSWORD, TESTPULSE_SMTP_FROM_ADDRESS,
//	TESTPULSE_PUBLIC_URL
//	                        (all optional) enable self-service password
//	                        recovery (add-forgot-password) — see
//	                        Config.PasswordResetEnabled. Username/password
//	                        may be left blank for an unauthenticated relay.
//	TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE, TESTPULSE_LOGIN_RATE_LIMIT_BURST
//	                        (default 5, 5) login attempts allowed per client
//	                        IP (backlog #113). The defaults are a real
//	                        brute-force mitigation for production; a
//	                        same-process test/CI environment doing many
//	                        legitimate logins in quick succession (e.g. the
//	                        E2E suite) should raise these rather than defeat
//	                        the limiter globally.
//	TESTPULSE_ALLOW_MISSING_MIGRATIONS
//	                        (default "false") recovery escape hatch — see
//	                        internal/db.MigrateWithOptions. Only set this
//	                        temporarily, to unblock a startup after a
//	                        migration-history gap; leave it off otherwise,
//	                        since it's the check that catches that gap in
//	                        the first place.
//	TESTPULSE_ENCRYPTION_KEY
//	                        (optional) symmetric key used to encrypt the
//	                        OIDC client secret at rest (add-sso-oidc) —
//	                        required only once a Tenant Admin actually saves
//	                        one via the Instance Settings "Single sign-on"
//	                        card; OIDC configuration itself is DB-backed
//	                        (instance_settings), not an env var.
//	TESTPULSE_MCP_ENABLED
//	                        (default "true") mounts the MCP server at /mcp
//	                        (add-mcp-server) when true. Set to "false" to
//	                        disable it entirely for a deployment.
//	TESTPULSE_TLS_CERT_FILE, TESTPULSE_TLS_KEY_FILE
//	                        (optional, both required together) when set,
//	                        the API terminates TLS directly, serving HTTPS
//	                        instead of plain HTTP (add-https-tls-support).
//	                        No automatic certificate issuance/renewal — the
//	                        operator supplies and rotates these files. For
//	                        reverse-proxy-terminated TLS instead, leave both
//	                        unset — see docs/deployment.md.
package config

import (
	"fmt"
	"strconv"
)

type Config struct {
	DatabaseURL             string
	Addr                    string
	LogLevel                string
	AdminEmail              string
	AdminPassword           string
	SMTPHost                string
	SMTPPort                string
	SMTPUsername            string
	SMTPPassword            string
	SMTPFromAddress         string
	PublicURL               string
	LoginRateLimitPerMinute float64
	LoginRateLimitBurst     int
	AllowMissingMigrations  bool
	EncryptionKey           string
	MCPEnabled              bool
	TLSCertFile             string
	TLSKeyFile              string
}

// PasswordResetEnabled reports whether enough is configured to send a
// password-reset email — host/port/from-address and PublicURL (needed to
// build an absolute reset link) are required; username/password may stay
// blank for an unauthenticated relay (e.g. Mailpit in the compose stack).
// This only reflects SMTP configuration; SSO-only mode (a DB-backed,
// runtime-editable setting — add-sso-oidc) is checked separately by
// Service.PasswordResetEnabled, since it can change without a restart.
func (c Config) PasswordResetEnabled() bool {
	return c.SMTPHost != "" && c.SMTPPort != "" && c.SMTPFromAddress != "" && c.PublicURL != ""
}

// Load reads configuration via getenv (os.Getenv in production, a stub in
// tests). It fails fast, naming the missing variable, when a required value
// has no default.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		DatabaseURL:            getenv("TESTPULSE_DATABASE_URL"),
		Addr:                   withDefault(getenv("TESTPULSE_ADDR"), ":8080"),
		LogLevel:               withDefault(getenv("TESTPULSE_LOG_LEVEL"), "info"),
		AdminEmail:             getenv("TESTPULSE_ADMIN_EMAIL"),
		AdminPassword:          getenv("TESTPULSE_ADMIN_PASSWORD"),
		SMTPHost:               getenv("TESTPULSE_SMTP_HOST"),
		SMTPPort:               getenv("TESTPULSE_SMTP_PORT"),
		SMTPUsername:           getenv("TESTPULSE_SMTP_USERNAME"),
		SMTPPassword:           getenv("TESTPULSE_SMTP_PASSWORD"),
		SMTPFromAddress:        getenv("TESTPULSE_SMTP_FROM_ADDRESS"),
		PublicURL:              getenv("TESTPULSE_PUBLIC_URL"),
		AllowMissingMigrations: getenv("TESTPULSE_ALLOW_MISSING_MIGRATIONS") == "true",
		EncryptionKey:          getenv("TESTPULSE_ENCRYPTION_KEY"),
		// Default true (unlike AllowMissingMigrations' default false above):
		// MCP is the stated core differentiator and should work out of the
		// box, including against the Sample Project — an operator who wants
		// it off sets TESTPULSE_MCP_ENABLED=false explicitly.
		MCPEnabled:  getenv("TESTPULSE_MCP_ENABLED") != "false",
		TLSCertFile: getenv("TESTPULSE_TLS_CERT_FILE"),
		TLSKeyFile:  getenv("TESTPULSE_TLS_KEY_FILE"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("missing required environment variable TESTPULSE_DATABASE_URL")
	}

	// Native TLS termination (add-https-tls-support D1) is a security-
	// relevant pair — unlike the admin-bootstrap pair, which silently
	// no-ops downstream if incomplete, an incomplete TLS config must fail
	// fast rather than risk the operator believing HTTPS is active when
	// the server actually started on plain HTTP.
	switch {
	case cfg.TLSCertFile != "" && cfg.TLSKeyFile == "":
		return Config{}, fmt.Errorf("missing required environment variable TESTPULSE_TLS_KEY_FILE (TESTPULSE_TLS_CERT_FILE is set)")
	case cfg.TLSKeyFile != "" && cfg.TLSCertFile == "":
		return Config{}, fmt.Errorf("missing required environment variable TESTPULSE_TLS_CERT_FILE (TESTPULSE_TLS_KEY_FILE is set)")
	}

	perMinute, err := parseFloatWithDefault(getenv("TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE"), 5, "TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE")
	if err != nil {
		return Config{}, err
	}
	cfg.LoginRateLimitPerMinute = perMinute

	burst, err := parseIntWithDefault(getenv("TESTPULSE_LOGIN_RATE_LIMIT_BURST"), 5, "TESTPULSE_LOGIN_RATE_LIMIT_BURST")
	if err != nil {
		return Config{}, err
	}
	cfg.LoginRateLimitBurst = burst

	switch cfg.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return Config{}, fmt.Errorf("invalid TESTPULSE_LOG_LEVEL %q: must be one of debug, info, warn, error", cfg.LogLevel)
	}

	return cfg, nil
}

func withDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func parseFloatWithDefault(value string, fallback float64, name string) (float64, error) {
	if value == "" {
		return fallback, nil
	}
	f, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid %s %q: %w", name, value, err)
	}
	return f, nil
}

func parseIntWithDefault(value string, fallback int, name string) (int, error) {
	if value == "" {
		return fallback, nil
	}
	i, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid %s %q: %w", name, value, err)
	}
	return i, nil
}
