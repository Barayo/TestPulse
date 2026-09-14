// Command import-connector is the standalone structural importer
// (add-testrail-importer) — never compiled into apps/api, per
// establish-architecture's standing decision that connectors are external
// API clients, not in-process plugins. Generic across source backends
// (design.md D10); TestRail is the first one, selected via --source.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Barayo/TestPulse/tools/import-connector/internal/config"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/importer"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/poller"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testrailclient"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "import-connector: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv, os.Args[1:])
	if err != nil {
		return err
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	tp := testpulseclient.New(cfg.TestPulseURL, cfg.AgentToken)
	newTestRail := func(siteURL, email, apiKey string) importer.TestRailReader {
		return testrailclient.New(siteURL, email, apiKey)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("import-connector starting", "source", cfg.Source, "pollInterval", cfg.PollInterval.String())

	// Polls once immediately, then on every tick — an operator restarting
	// the connector shouldn't wait a full interval to see its first poll
	// (matches tools/jira-connector's main loop shape).
	poller.Once(ctx, tp, newTestRail, cfg.Source, logger)

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("import-connector shutting down")
			return nil
		case <-ticker.C:
			poller.Once(ctx, tp, newTestRail, cfg.Source, logger)
		}
	}
}
