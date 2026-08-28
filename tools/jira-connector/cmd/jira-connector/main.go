// Command jira-connector is the standalone Jira connector (add-jira-connector)
// — never compiled into apps/api, per establish-architecture's standing
// decision that connectors are external API/MCP clients, not in-process
// plugins.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Barayo/TestPulse/tools/jira-connector/internal/config"
	"github.com/Barayo/TestPulse/tools/jira-connector/internal/jiraclient"
	"github.com/Barayo/TestPulse/tools/jira-connector/internal/sync"
	"github.com/Barayo/TestPulse/tools/jira-connector/internal/testpulseclient"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "jira-connector: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	tp := testpulseclient.New(cfg.TestPulseURL, cfg.AgentToken)
	jira := jiraclient.New(cfg.JiraBaseURL, cfg.JiraEmail, cfg.JiraAPIToken)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("jira-connector starting", "syncInterval", cfg.SyncInterval.String())

	// Runs once immediately, then on every tick — an operator restarting the
	// connector shouldn't wait a full interval to see its first sync.
	sync.Once(ctx, tp, jira, logger)

	ticker := time.NewTicker(cfg.SyncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("jira-connector shutting down")
			return nil
		case <-ticker.C:
			sync.Once(ctx, tp, jira, logger)
		}
	}
}
