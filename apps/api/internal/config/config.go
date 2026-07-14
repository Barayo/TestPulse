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
package config

import "fmt"

type Config struct {
	DatabaseURL   string
	Addr          string
	LogLevel      string
	AdminEmail    string
	AdminPassword string
}

// Load reads configuration via getenv (os.Getenv in production, a stub in
// tests). It fails fast, naming the missing variable, when a required value
// has no default.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		DatabaseURL:   getenv("TESTPULSE_DATABASE_URL"),
		Addr:          withDefault(getenv("TESTPULSE_ADDR"), ":8080"),
		LogLevel:      withDefault(getenv("TESTPULSE_LOG_LEVEL"), "info"),
		AdminEmail:    getenv("TESTPULSE_ADMIN_EMAIL"),
		AdminPassword: getenv("TESTPULSE_ADMIN_PASSWORD"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("missing required environment variable TESTPULSE_DATABASE_URL")
	}

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
