// Package config loads the Jira connector's runtime configuration from
// environment variables — mirrors apps/api/internal/config's Load(getenv)
// pattern so the same fail-fast, missing-variable-naming behavior applies
// here too (add-jira-connector).
//
// Documented variables:
//
//	TESTPULSE_URL              (required) base URL of the TestPulse API,
//	                           e.g. http://localhost:8080
//	TESTPULSE_JIRA_AGENT_TOKEN (required) a scoped TestPulse agent API token
//	                           — the connector authenticates as an ordinary
//	                           agent actor, no special auth mechanism.
//	TESTPULSE_JIRA_BASE_URL    (required) Jira Cloud site base URL, e.g.
//	                           https://mycompany.atlassian.net — used for
//	                           the connector's own Jira REST API calls, kept
//	                           in sync by whoever configures the connector
//	                           with the same value under Instance Settings'
//	                           jiraSiteUrl (a separate, UI-facing setting).
//	TESTPULSE_JIRA_EMAIL,
//	TESTPULSE_JIRA_API_TOKEN   (required) Jira Cloud API token credentials
//	                           (Basic auth against the Jira REST API v3).
//	TESTPULSE_JIRA_SYNC_INTERVAL
//	                           (default "5m") how often the connector polls
//	                           TestPulse for linked cases/run items and
//	                           re-fetches their Jira status.
package config

import (
	"fmt"
	"time"
)

type Config struct {
	TestPulseURL string
	AgentToken   string
	JiraBaseURL  string
	JiraEmail    string
	JiraAPIToken string
	SyncInterval time.Duration
}

// Load reads configuration via getenv (os.Getenv in production, a stub in
// tests). It fails fast, naming the missing variable, when a required value
// is absent.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		TestPulseURL: getenv("TESTPULSE_URL"),
		AgentToken:   getenv("TESTPULSE_JIRA_AGENT_TOKEN"),
		JiraBaseURL:  getenv("TESTPULSE_JIRA_BASE_URL"),
		JiraEmail:    getenv("TESTPULSE_JIRA_EMAIL"),
		JiraAPIToken: getenv("TESTPULSE_JIRA_API_TOKEN"),
	}

	for _, req := range []struct {
		name  string
		value string
	}{
		{"TESTPULSE_URL", cfg.TestPulseURL},
		{"TESTPULSE_JIRA_AGENT_TOKEN", cfg.AgentToken},
		{"TESTPULSE_JIRA_BASE_URL", cfg.JiraBaseURL},
		{"TESTPULSE_JIRA_EMAIL", cfg.JiraEmail},
		{"TESTPULSE_JIRA_API_TOKEN", cfg.JiraAPIToken},
	} {
		if req.value == "" {
			return Config{}, fmt.Errorf("missing required environment variable %s", req.name)
		}
	}

	interval := getenv("TESTPULSE_JIRA_SYNC_INTERVAL")
	if interval == "" {
		cfg.SyncInterval = 5 * time.Minute
	} else {
		d, err := time.ParseDuration(interval)
		if err != nil {
			return Config{}, fmt.Errorf("invalid TESTPULSE_JIRA_SYNC_INTERVAL %q: %w", interval, err)
		}
		cfg.SyncInterval = d
	}

	return cfg, nil
}
