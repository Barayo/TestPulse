package config

import (
	"strings"
	"testing"
	"time"
)

func envStub(vars map[string]string) func(string) string {
	return func(key string) string { return vars[key] }
}

func validVars() map[string]string {
	return map[string]string{
		"TESTPULSE_URL":         "http://localhost:8080",
		"TESTPULSE_AGENT_TOKEN": "agent-token-123",
	}
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(envStub(validVars()), []string{"--source=testrail"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.PollInterval != 5*time.Second {
		t.Errorf("PollInterval = %v, want 5s default (design.md D9 — jira-connector's 5m default is wrong for this interactive use case)", cfg.PollInterval)
	}
	if cfg.TestPulseURL != "http://localhost:8080" {
		t.Errorf("TestPulseURL = %q", cfg.TestPulseURL)
	}
	if cfg.AgentToken != "agent-token-123" {
		t.Errorf("AgentToken = %q", cfg.AgentToken)
	}
	if cfg.Source != "testrail" {
		t.Errorf("Source = %q, want testrail", cfg.Source)
	}
}

func TestLoadPollIntervalOverride(t *testing.T) {
	vars := validVars()
	vars["TESTPULSE_IMPORT_CONNECTOR_POLL_INTERVAL"] = "2s"
	cfg, err := Load(envStub(vars), []string{"--source=testrail"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.PollInterval != 2*time.Second {
		t.Errorf("PollInterval = %v, want 2s", cfg.PollInterval)
	}
}

func TestLoadInvalidPollInterval(t *testing.T) {
	vars := validVars()
	vars["TESTPULSE_IMPORT_CONNECTOR_POLL_INTERVAL"] = "not-a-duration"
	_, err := Load(envStub(vars), []string{"--source=testrail"})
	if err == nil {
		t.Fatal("expected error for invalid poll interval")
	}
}

func TestLoadFailsFastNamingEachMissingEnvVariable(t *testing.T) {
	for _, required := range []string{"TESTPULSE_URL", "TESTPULSE_AGENT_TOKEN"} {
		vars := validVars()
		delete(vars, required)
		_, err := Load(envStub(vars), []string{"--source=testrail"})
		if err == nil {
			t.Errorf("missing %s: expected an error, got none", required)
			continue
		}
		if !strings.Contains(err.Error(), required) {
			t.Errorf("missing %s: error %q does not name the missing variable", required, err)
		}
	}
}

// --source is a CLI flag, not an env var (design.md D10's documented
// `--source=testrail` syntax) — the importer is invoked once per source
// backend, so this is an invocation-time choice, not deployment config.
func TestLoadRequiresSourceFlag(t *testing.T) {
	_, err := Load(envStub(validVars()), []string{})
	if err == nil {
		t.Fatal("expected error when --source is not provided")
	}
	if !strings.Contains(err.Error(), "source") {
		t.Errorf("error %q does not mention the missing --source flag", err)
	}
}
