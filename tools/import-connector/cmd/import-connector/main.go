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
	"github.com/Barayo/TestPulse/tools/import-connector/internal/kiwitcmsclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/poller"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/qaseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testrailclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/xrayclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/zephyrscaleclient"
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
	newQase := func(baseURL, token string) importer.QaseReader {
		return qaseclient.New(baseURL, token)
	}
	newZephyrScale := func(baseURL, token string) importer.ZephyrScaleReader {
		return zephyrscaleclient.New(baseURL, token)
	}
	newKiwiTCMS := func(ctx context.Context, siteURL, username, password string) (importer.KiwiTCMSReader, error) {
		return kiwitcmsclient.New(ctx, siteURL, username, password)
	}
	newXrayCloud := func(ctx context.Context, baseHost, clientID, clientSecret, projectID string) (importer.XrayReader, error) {
		return xrayclient.NewCloud(ctx, baseHost, clientID, clientSecret, projectID)
	}
	newXrayServer := func(ctx context.Context, siteURL, personalAccessToken, projectKey string) (importer.XrayReader, error) {
		return xrayclient.NewServer(ctx, siteURL, personalAccessToken, projectKey)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("import-connector starting", "source", cfg.Source, "pollInterval", cfg.PollInterval.String())

	// Polls once immediately, then on every tick — an operator restarting
	// the connector shouldn't wait a full interval to see its first poll
	// (matches tools/jira-connector's main loop shape).
	poller.Once(ctx, tp, newTestRail, newQase, newZephyrScale, newKiwiTCMS, newXrayCloud, newXrayServer, cfg.Source, logger)

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("import-connector shutting down")
			return nil
		case <-ticker.C:
			poller.Once(ctx, tp, newTestRail, newQase, newZephyrScale, newKiwiTCMS, newXrayCloud, newXrayServer, cfg.Source, logger)
		}
	}
}
