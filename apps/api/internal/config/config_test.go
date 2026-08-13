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


func TestLoadReadsSMTPSettings(t *testing.T) {
	cfg, err := Load(envStub(map[string]string{
		"TESTPULSE_DATABASE_URL":      "postgres://localhost/testpulse",
		"TESTPULSE_SMTP_HOST":         "smtp.example.com",
		"TESTPULSE_SMTP_PORT":         "587",
		"TESTPULSE_SMTP_USERNAME":     "smtp-user",
		"TESTPULSE_SMTP_PASSWORD":     "smtp-pass",
		"TESTPULSE_SMTP_FROM_ADDRESS": "noreply@example.com",
		"TESTPULSE_PUBLIC_URL":        "https://testpulse.example.com",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.SMTPHost != "smtp.example.com" || cfg.SMTPPort != "587" || cfg.SMTPUsername != "smtp-user" ||
		cfg.SMTPPassword != "smtp-pass" || cfg.SMTPFromAddress != "noreply@example.com" ||
		cfg.PublicURL != "https://testpulse.example.com" {
		t.Errorf("cfg = %+v", cfg)
	}
}

func TestPasswordResetEnabledRequiresAllVars(t *testing.T) {
	full := map[string]string{
		"TESTPULSE_DATABASE_URL":      "postgres://localhost/testpulse",
		"TESTPULSE_SMTP_HOST":         "smtp.example.com",
		"TESTPULSE_SMTP_PORT":         "587",
		"TESTPULSE_SMTP_FROM_ADDRESS": "noreply@example.com",
		"TESTPULSE_PUBLIC_URL":        "https://testpulse.example.com",
	}
	cfg, err := Load(envStub(full))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.PasswordResetEnabled() {
		t.Error("PasswordResetEnabled() = false with host/port/from/public-url all set, want true")
	}

	// Username/password may be blank (unauthenticated relay, e.g. Mailpit).
	cfg, err = Load(envStub(full))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.SMTPUsername != "" || cfg.SMTPPassword != "" {
		t.Fatalf("expected blank username/password in this fixture, got %+v", cfg)
	}
	if !cfg.PasswordResetEnabled() {
		t.Error("PasswordResetEnabled() = false with blank username/password, want true (unauthenticated relay)")
	}

	for missing := range full {
		if missing == "TESTPULSE_DATABASE_URL" {
			continue
		}
		partial := map[string]string{}
		for k, v := range full {
			if k != missing {
				partial[k] = v
			}
		}
		cfg, err := Load(envStub(partial))
		if err != nil {
			t.Fatalf("unexpected error with %s missing: %v", missing, err)
		}
		if cfg.PasswordResetEnabled() {
			t.Errorf("PasswordResetEnabled() = true with %s missing, want false", missing)
		}
	}
}
