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
		"TESTPULSE_URL":              "http://localhost:8080",
		"TESTPULSE_JIRA_AGENT_TOKEN": "agent-token-123",
		"TESTPULSE_JIRA_BASE_URL":    "https://mycompany.atlassian.net",
		"TESTPULSE_JIRA_EMAIL":       "bot@mycompany.com",
		"TESTPULSE_JIRA_API_TOKEN":   "jira-token-456",
	}
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(envStub(validVars()))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.SyncInterval != 5*time.Minute {
		t.Errorf("SyncInterval = %v, want 5m default", cfg.SyncInterval)
	}
	if cfg.TestPulseURL != "http://localhost:8080" {
		t.Errorf("TestPulseURL = %q", cfg.TestPulseURL)
	}
	if cfg.JiraBaseURL != "https://mycompany.atlassian.net" {
		t.Errorf("JiraBaseURL = %q", cfg.JiraBaseURL)
	}
}

func TestLoadSyncIntervalOverride(t *testing.T) {
	vars := validVars()
	vars["TESTPULSE_JIRA_SYNC_INTERVAL"] = "30s"
	cfg, err := Load(envStub(vars))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.SyncInterval != 30*time.Second {
		t.Errorf("SyncInterval = %v, want 30s", cfg.SyncInterval)
	}
}

func TestLoadInvalidSyncInterval(t *testing.T) {
	vars := validVars()
	vars["TESTPULSE_JIRA_SYNC_INTERVAL"] = "not-a-duration"
	_, err := Load(envStub(vars))
	if err == nil {
		t.Fatal("expected error for invalid sync interval")
	}
}

func TestLoadFailsFastNamingEachMissingVariable(t *testing.T) {
	for _, required := range []string{
		"TESTPULSE_URL",
		"TESTPULSE_JIRA_AGENT_TOKEN",
		"TESTPULSE_JIRA_BASE_URL",
		"TESTPULSE_JIRA_EMAIL",
		"TESTPULSE_JIRA_API_TOKEN",
	} {
		vars := validVars()
		delete(vars, required)
		_, err := Load(envStub(vars))
		if err == nil {
			t.Errorf("missing %s: expected an error, got none", required)
			continue
		}
		if !strings.Contains(err.Error(), required) {
			t.Errorf("missing %s: error %q does not name the missing variable", required, err)
		}
	}
}
