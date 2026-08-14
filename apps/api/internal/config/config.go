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
}

// PasswordResetEnabled reports whether enough is configured to send a
// password-reset email — host/port/from-address and PublicURL (needed to
// build an absolute reset link) are required; username/password may stay
// blank for an unauthenticated relay (e.g. Mailpit in the compose stack).
func (c Config) PasswordResetEnabled() bool {
	return c.SMTPHost != "" && c.SMTPPort != "" && c.SMTPFromAddress != "" && c.PublicURL != ""
}

// Load reads configuration via getenv (os.Getenv in production, a stub in
// tests). It fails fast, naming the missing variable, when a required value
// has no default.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		DatabaseURL:     getenv("TESTPULSE_DATABASE_URL"),
		Addr:            withDefault(getenv("TESTPULSE_ADDR"), ":8080"),
		LogLevel:        withDefault(getenv("TESTPULSE_LOG_LEVEL"), "info"),
		AdminEmail:      getenv("TESTPULSE_ADMIN_EMAIL"),
		AdminPassword:   getenv("TESTPULSE_ADMIN_PASSWORD"),
		SMTPHost:        getenv("TESTPULSE_SMTP_HOST"),
		SMTPPort:        getenv("TESTPULSE_SMTP_PORT"),
		SMTPUsername:    getenv("TESTPULSE_SMTP_USERNAME"),
		SMTPPassword:    getenv("TESTPULSE_SMTP_PASSWORD"),
		SMTPFromAddress: getenv("TESTPULSE_SMTP_FROM_ADDRESS"),
		PublicURL:       getenv("TESTPULSE_PUBLIC_URL"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("missing required environment variable TESTPULSE_DATABASE_URL")
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
