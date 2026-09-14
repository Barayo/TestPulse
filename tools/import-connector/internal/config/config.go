// Package config loads the import connector's runtime configuration —
// mirrors tools/jira-connector/internal/config's Load(getenv) pattern
// (add-testrail-importer) so the same fail-fast, missing-variable-naming
// behavior applies here too. Unlike jira-connector, this tool never holds
// long-lived third-party credentials as config: the source system's
// connection secrets (e.g. a TestRail API key) travel per-job, entered by
// a human in the browser and delivered decrypted only at claim time
// (design.md D2/D3) — this config is only what the importer needs to talk
// to TestPulse itself, plus which source backend to run as.
//
// Documented variables:
//
//	TESTPULSE_URL                              (required) base URL of the
//	                                            TestPulse API.
//	TESTPULSE_AGENT_TOKEN                      (required) a project-scoped
//	                                            TestPulse agent API token
//	                                            (design.md D4).
//	TESTPULSE_IMPORT_CONNECTOR_POLL_INTERVAL   (default "5s") how often the
//	                                            importer polls for pending
//	                                            work — deliberately tight,
//	                                            not jira-connector's 5m
//	                                            default, so the in-app
//	                                            Preview/Result screens feel
//	                                            responsive (design.md D9).
//
// --source (required CLI flag, not an env var): which connector backend to
// run as, e.g. --source=testrail (design.md D10). An invocation choice,
// not deployment config — the tool is invoked once per source.
package config

import (
	"flag"
	"fmt"
	"time"
)

type Config struct {
	TestPulseURL string
	AgentToken   string
	Source       string
	PollInterval time.Duration
}

// Load reads configuration via getenv (os.Getenv in production, a stub in
// tests) and CLI args (os.Args[1:] in production). It fails fast, naming
// the missing variable/flag, when a required value is absent.
func Load(getenv func(string) string, args []string) (Config, error) {
	cfg := Config{
		TestPulseURL: getenv("TESTPULSE_URL"),
		AgentToken:   getenv("TESTPULSE_AGENT_TOKEN"),
	}

	for _, req := range []struct{ name, value string }{
		{"TESTPULSE_URL", cfg.TestPulseURL},
		{"TESTPULSE_AGENT_TOKEN", cfg.AgentToken},
	} {
		if req.value == "" {
			return Config{}, fmt.Errorf("missing required environment variable %s", req.name)
		}
	}

	fs := flag.NewFlagSet("import-connector", flag.ContinueOnError)
	source := fs.String("source", "", "connector backend to run as, e.g. testrail")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	if *source == "" {
		return Config{}, fmt.Errorf("missing required --source flag")
	}
	cfg.Source = *source

	interval := getenv("TESTPULSE_IMPORT_CONNECTOR_POLL_INTERVAL")
	if interval == "" {
		cfg.PollInterval = 5 * time.Second
	} else {
		d, err := time.ParseDuration(interval)
		if err != nil {
			return Config{}, fmt.Errorf("invalid TESTPULSE_IMPORT_CONNECTOR_POLL_INTERVAL %q: %w", interval, err)
		}
		cfg.PollInterval = d
	}

	return cfg, nil
}
