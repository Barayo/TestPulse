package config

import (
	"strings"
	"testing"
)

func envStub(vars map[string]string) func(string) string {
	return func(key string) string { return vars[key] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(envStub(map[string]string{
		"TESTPULSE_DATABASE_URL": "postgres://localhost/testpulse",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Addr != ":8080" {
		t.Errorf("Addr = %q, want :8080", cfg.Addr)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q, want info", cfg.LogLevel)
	}
}

func TestLoadOverrides(t *testing.T) {
	cfg, err := Load(envStub(map[string]string{
		"TESTPULSE_DATABASE_URL": "postgres://db:5432/tp",
		"TESTPULSE_ADDR":         ":9999",
		"TESTPULSE_LOG_LEVEL":    "debug",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DatabaseURL != "postgres://db:5432/tp" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.Addr != ":9999" {
		t.Errorf("Addr = %q, want :9999", cfg.Addr)
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q, want debug", cfg.LogLevel)
	}
}

func TestLoadMissingDatabaseURLNamesVariable(t *testing.T) {
	_, err := Load(envStub(nil))
	if err == nil {
		t.Fatal("expected error for missing TESTPULSE_DATABASE_URL")
	}
	if !strings.Contains(err.Error(), "TESTPULSE_DATABASE_URL") {
		t.Errorf("error %q does not name the missing variable", err)
	}
}

func TestLoadInvalidLogLevel(t *testing.T) {
	_, err := Load(envStub(map[string]string{
		"TESTPULSE_DATABASE_URL": "postgres://localhost/tp",
		"TESTPULSE_LOG_LEVEL":    "loud",
	}))
	if err == nil {
		t.Fatal("expected error for invalid log level")
	}
}

func TestLoadAdminBootstrapCredentialsOptional(t *testing.T) {
	cfg, err := Load(envStub(map[string]string{
		"TESTPULSE_DATABASE_URL": "postgres://localhost/testpulse",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AdminEmail != "" || cfg.AdminPassword != "" {
		t.Errorf("AdminEmail/AdminPassword should default empty, got %q/%q", cfg.AdminEmail, cfg.AdminPassword)
	}
}

func TestLoadAdminBootstrapCredentialsSet(t *testing.T) {
	cfg, err := Load(envStub(map[string]string{
		"TESTPULSE_DATABASE_URL":   "postgres://localhost/testpulse",
		"TESTPULSE_ADMIN_EMAIL":    "admin@example.com",
		"TESTPULSE_ADMIN_PASSWORD": "correcthorse",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AdminEmail != "admin@example.com" || cfg.AdminPassword != "correcthorse" {
		t.Errorf("AdminEmail/AdminPassword = %q/%q", cfg.AdminEmail, cfg.AdminPassword)
	}
}
