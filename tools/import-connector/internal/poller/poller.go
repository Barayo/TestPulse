// Package poller implements the import connector's one-job poll pass:
// claim a pending job, resolve its TestPulse project key and TestRail
// credentials, run internal/importer, and report progress/completion back
// — mirroring tools/jira-connector's internal/sync package's shape and
// testability pattern (add-testrail-importer).
package poller

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/Barayo/TestPulse/tools/import-connector/internal/importer"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
)

// TestPulseClient is the subset of testpulseclient.Client the poll loop
// needs: job lifecycle calls plus importer.TestPulseWriter's write
// methods (design.md D2/D3) — an interface so tests can substitute a
// fake.
type TestPulseClient interface {
	importer.TestPulseWriter
	ClaimPendingJob(ctx context.Context, source string) (*testpulseclient.ClaimedJob, error)
	ListProjects(ctx context.Context) ([]testpulseclient.Project, error)
	ReportProgress(ctx context.Context, jobID string, current, total int) error
	CompleteJob(ctx context.Context, jobID, status string, report *testpulseclient.ImportReport, errMsg *string) error
}

// NewTestRailClient constructs a TestRailReader from a claimed job's
// decrypted credentials — a seam so tests can substitute a fake without a
// real TestRail site. In production this is testrailclient.New.
type NewTestRailClient func(siteURL, email, apiKey string) importer.TestRailReader

// NewQaseClient constructs a QaseReader from a claimed job's decrypted
// credentials — the Qase counterpart to NewTestRailClient. In production
// this is qaseclient.New.
type NewQaseClient func(baseURL, token string) importer.QaseReader

// NewZephyrScaleClient constructs a ZephyrScaleReader from a claimed job's
// decrypted credentials — the Zephyr Scale counterpart to
// NewTestRailClient/NewQaseClient. In production this is
// zephyrscaleclient.New.
type NewZephyrScaleClient func(baseURL, token string) importer.ZephyrScaleReader

// NewKiwiTCMSClient constructs a KiwiTCMSReader from a claimed job's
// decrypted credentials, given a context (unlike the other New*Client
// types — Kiwi TCMS logs in via a real RPC call at construction time,
// design.md D-K2, so failure needs a context and can itself fail). In
// production this is kiwitcmsclient.New.
type NewKiwiTCMSClient func(ctx context.Context, siteURL, username, password string) (importer.KiwiTCMSReader, error)

// NewXrayCloudClient constructs an XrayReader from a claimed job's
// decrypted Cloud credentials — a seam so tests can substitute a fake
// without a real Xray Cloud account. In production this wraps
// xrayclient.NewCloud.
type NewXrayCloudClient func(ctx context.Context, baseHost, clientID, clientSecret, projectID string) (importer.XrayReader, error)

// NewXrayServerClient constructs an XrayReader from a claimed job's
// decrypted Server/Data Center credentials — the Server/DC counterpart
// to NewXrayCloudClient (design.md D-X1: one interface, two modes). In
// production this wraps xrayclient.NewServer.
type NewXrayServerClient func(ctx context.Context, siteURL, personalAccessToken, projectKey string) (importer.XrayReader, error)

// NewTuskrClient constructs a TuskrReader from a claimed job's decrypted
// credentials — a seam so tests can substitute a fake without a real
// Tuskr account. In production this is tuskrclient.New.
type NewTuskrClient func(baseURL, tenantID, token string) importer.TuskrReader

// Once claims and runs at most one pending job for source. Returns true
// when a job was claimed (whether it ultimately succeeded or failed) and
// false when nothing was pending — the ordinary steady-state case, not an
// error.
func Once(ctx context.Context, tp TestPulseClient, newTestRail NewTestRailClient, newQase NewQaseClient, newZephyrScale NewZephyrScaleClient, newKiwiTCMS NewKiwiTCMSClient, newXrayCloud NewXrayCloudClient, newXrayServer NewXrayServerClient, newTuskr NewTuskrClient, source string, logger *slog.Logger) bool {
	claimed, err := tp.ClaimPendingJob(ctx, source)
	if err != nil {
		logger.Error("claiming pending job", "source", source, "error", err)
		return false
	}
	if claimed == nil {
		return false
	}
	logger.Info("claimed import job", "jobId", claimed.Job.ID, "mode", claimed.Job.Mode)

	if err := runClaimedJob(ctx, tp, newTestRail, newQase, newZephyrScale, newKiwiTCMS, newXrayCloud, newXrayServer, newTuskr, source, claimed, logger); err != nil {
		// The full internal error (chain, job ID, etc.) is logged here for
		// operator debugging; only the classified, sanitized message below
		// is ever persisted/surfaced to a user (design.md D4).
		logger.Error("running import job", "jobId", claimed.Job.ID, "error", err)
		msg := importer.ClassifyImportError(sourceLabel(source), err)
		if cerr := tp.CompleteJob(ctx, claimed.Job.ID, "failed", nil, &msg); cerr != nil {
			logger.Error("reporting job failure", "jobId", claimed.Job.ID, "error", cerr)
		}
	}
	return true
}

func runClaimedJob(ctx context.Context, tp TestPulseClient, newTestRail NewTestRailClient, newQase NewQaseClient, newZephyrScale NewZephyrScaleClient, newKiwiTCMS NewKiwiTCMSClient, newXrayCloud NewXrayCloudClient, newXrayServer NewXrayServerClient, newTuskr NewTuskrClient, source string, claimed *testpulseclient.ClaimedJob, logger *slog.Logger) error {
	projectKey, err := resolveProjectKey(ctx, tp, claimed.Job.ProjectID)
	if err != nil {
		return err
	}
	dryRun := claimed.Job.Mode == "dry_run"

	var report importer.Report
	switch source {
	case "testrail":
		report, err = runTestRailJob(ctx, tp, newTestRail, claimed, projectKey, dryRun, logger)
	case "qase":
		report, err = runQaseJob(ctx, tp, newQase, claimed, projectKey, dryRun, logger)
	case "zephyr-scale":
		report, err = runZephyrScaleJob(ctx, tp, newZephyrScale, claimed, projectKey, dryRun, logger)
	case "kiwi-tcms":
		report, err = runKiwiTCMSJob(ctx, tp, newKiwiTCMS, claimed, projectKey, dryRun, logger)
	case "xray":
		report, err = runXrayJob(ctx, tp, newXrayCloud, newXrayServer, claimed, projectKey, dryRun, logger)
	case "tuskr":
		report, err = runTuskrJob(ctx, tp, newTuskr, claimed, projectKey, dryRun, logger)
	default:
		return fmt.Errorf("job %s has unsupported source %q", claimed.Job.ID, source)
	}
	if err != nil {
		return err
	}

	return tp.CompleteJob(ctx, claimed.Job.ID, "succeeded",
		&testpulseclient.ImportReport{Counts: report.Counts, Unmapped: report.Unmapped}, nil)
}

func runTestRailJob(ctx context.Context, tp TestPulseClient, newTestRail NewTestRailClient, claimed *testpulseclient.ClaimedJob, projectKey string, dryRun bool, logger *slog.Logger) (importer.Report, error) {
	siteURL := claimed.Credentials["siteUrl"]
	email := claimed.Credentials["email"]
	apiKey := claimed.Credentials["apiKey"]
	if siteURL == "" || email == "" || apiKey == "" {
		return importer.Report{}, fmt.Errorf("job %s is missing TestRail credentials (siteUrl/email/apiKey)", claimed.Job.ID)
	}
	testRailProjectID, err := strconv.Atoi(claimed.Credentials["testRailProjectId"])
	if err != nil {
		return importer.Report{}, fmt.Errorf("job %s has an invalid testRailProjectId %q: %w", claimed.Job.ID, claimed.Credentials["testRailProjectId"], err)
	}

	tr := newTestRail(siteURL, email, apiKey)
	return importer.Run(ctx, tr, tp, projectKey, testRailProjectID, dryRun, func(current, total int) {
		if err := tp.ReportProgress(ctx, claimed.Job.ID, current, total); err != nil {
			logger.Error("reporting progress", "jobId", claimed.Job.ID, "error", err)
		}
	})
}

func runQaseJob(ctx context.Context, tp TestPulseClient, newQase NewQaseClient, claimed *testpulseclient.ClaimedJob, projectKey string, dryRun bool, logger *slog.Logger) (importer.Report, error) {
	apiToken := claimed.Credentials["apiToken"]
	projectCode := claimed.Credentials["projectCode"]
	if apiToken == "" || projectCode == "" {
		return importer.Report{}, fmt.Errorf("job %s is missing Qase credentials (apiToken/projectCode)", claimed.Job.ID)
	}
	// baseUrl is an optional override (design.md D-Q2) — empty defaults to
	// Qase's public SaaS API inside qaseclient.New.
	baseURL := claimed.Credentials["baseUrl"]

	qr := newQase(baseURL, apiToken)
	return importer.RunQase(ctx, qr, tp, projectKey, projectCode, dryRun, func(current, total int) {
		if err := tp.ReportProgress(ctx, claimed.Job.ID, current, total); err != nil {
			logger.Error("reporting progress", "jobId", claimed.Job.ID, "error", err)
		}
	})
}

func runZephyrScaleJob(ctx context.Context, tp TestPulseClient, newZephyrScale NewZephyrScaleClient, claimed *testpulseclient.ClaimedJob, projectKey string, dryRun bool, logger *slog.Logger) (importer.Report, error) {
	apiToken := claimed.Credentials["apiToken"]
	zephyrScaleProjectKey := claimed.Credentials["projectKey"]
	if apiToken == "" || zephyrScaleProjectKey == "" {
		return importer.Report{}, fmt.Errorf("job %s is missing Zephyr Scale credentials (apiToken/projectKey)", claimed.Job.ID)
	}

	zr := newZephyrScale("", apiToken)
	return importer.RunZephyrScale(ctx, zr, tp, projectKey, zephyrScaleProjectKey, dryRun, func(current, total int) {
		if err := tp.ReportProgress(ctx, claimed.Job.ID, current, total); err != nil {
			logger.Error("reporting progress", "jobId", claimed.Job.ID, "error", err)
		}
	})
}

func runKiwiTCMSJob(ctx context.Context, tp TestPulseClient, newKiwiTCMS NewKiwiTCMSClient, claimed *testpulseclient.ClaimedJob, projectKey string, dryRun bool, logger *slog.Logger) (importer.Report, error) {
	siteURL := claimed.Credentials["siteUrl"]
	username := claimed.Credentials["username"]
	password := claimed.Credentials["password"]
	product := claimed.Credentials["product"]
	if siteURL == "" || username == "" || password == "" || product == "" {
		return importer.Report{}, fmt.Errorf("job %s is missing Kiwi TCMS credentials (siteUrl/username/password/product)", claimed.Job.ID)
	}

	// design.md D-K2: a login failure here is a distinct, clearly-wrapped
	// failure mode from a later data-fetch error — kiwitcmsclient.New
	// itself performs Auth.login before returning.
	kr, err := newKiwiTCMS(ctx, siteURL, username, password)
	if err != nil {
		return importer.Report{}, fmt.Errorf("job %s could not connect to Kiwi TCMS: %w", claimed.Job.ID, err)
	}
	return importer.RunKiwiTCMS(ctx, kr, tp, projectKey, product, dryRun, func(current, total int) {
		if err := tp.ReportProgress(ctx, claimed.Job.ID, current, total); err != nil {
			logger.Error("reporting progress", "jobId", claimed.Job.ID, "error", err)
		}
	})
}

// runXrayJob dispatches to Cloud or Server/DC based on the claimed job's
// "mode" credential (design.md D-X7 — the only branching point in the
// whole pipeline; everything downstream of client construction is
// mode-agnostic, design.md D-X1).
func runXrayJob(ctx context.Context, tp TestPulseClient, newXrayCloud NewXrayCloudClient, newXrayServer NewXrayServerClient, claimed *testpulseclient.ClaimedJob, projectKey string, dryRun bool, logger *slog.Logger) (importer.Report, error) {
	mode := claimed.Credentials["mode"]
	var xr importer.XrayReader
	var err error

	switch mode {
	case "cloud":
		clientID := claimed.Credentials["clientId"]
		clientSecret := claimed.Credentials["clientSecret"]
		projectID := claimed.Credentials["projectId"]
		if clientID == "" || clientSecret == "" || projectID == "" {
			return importer.Report{}, fmt.Errorf("job %s is missing Xray Cloud credentials (clientId/clientSecret/projectId)", claimed.Job.ID)
		}
		// design.md D-X2: a failed authenticate call here is a distinct,
		// clearly-wrapped failure mode from a later data-fetch error.
		xr, err = newXrayCloud(ctx, "", clientID, clientSecret, projectID)
		if err != nil {
			return importer.Report{}, fmt.Errorf("job %s could not connect to Xray Cloud: %w", claimed.Job.ID, err)
		}
	case "server":
		siteURL := claimed.Credentials["siteUrl"]
		pat := claimed.Credentials["personalAccessToken"]
		projectKeyXray := claimed.Credentials["projectKey"]
		if siteURL == "" || pat == "" || projectKeyXray == "" {
			return importer.Report{}, fmt.Errorf("job %s is missing Xray Server/DC credentials (siteUrl/personalAccessToken/projectKey)", claimed.Job.ID)
		}
		xr, err = newXrayServer(ctx, siteURL, pat, projectKeyXray)
		if err != nil {
			return importer.Report{}, fmt.Errorf("job %s could not connect to Xray Server/DC: %w", claimed.Job.ID, err)
		}
	default:
		return importer.Report{}, fmt.Errorf("job %s has an invalid Xray mode %q (want \"cloud\" or \"server\")", claimed.Job.ID, mode)
	}

	return importer.RunXray(ctx, xr, tp, projectKey, dryRun, func(current, total int) {
		if err := tp.ReportProgress(ctx, claimed.Job.ID, current, total); err != nil {
			logger.Error("reporting progress", "jobId", claimed.Job.ID, "error", err)
		}
	})
}

func runTuskrJob(ctx context.Context, tp TestPulseClient, newTuskr NewTuskrClient, claimed *testpulseclient.ClaimedJob, projectKey string, dryRun bool, logger *slog.Logger) (importer.Report, error) {
	tenantID := claimed.Credentials["tenantId"]
	pat := claimed.Credentials["personalAccessToken"]
	tuskrProjectID := claimed.Credentials["projectId"]
	if tenantID == "" || pat == "" || tuskrProjectID == "" {
		return importer.Report{}, fmt.Errorf("job %s is missing Tuskr credentials (tenantId/personalAccessToken/projectId)", claimed.Job.ID)
	}

	tr := newTuskr("", tenantID, pat)
	return importer.RunTuskr(ctx, tr, tp, projectKey, tuskrProjectID, dryRun, func(current, total int) {
		if err := tp.ReportProgress(ctx, claimed.Job.ID, current, total); err != nil {
			logger.Error("reporting progress", "jobId", claimed.Job.ID, "error", err)
		}
	})
}

// sourceLabel maps the wizard's internal source slug to the vendor display
// name ClassifyImportError's messages should name — mirrors the frontend's
// own SOURCE_LABEL (apps/web/src/pages/ImportProjectPage.tsx), kept in
// sync by hand since these are separate modules with no shared constant.
func sourceLabel(source string) string {
	switch source {
	case "testrail":
		return "TestRail"
	case "qase":
		return "Qase"
	case "zephyr-scale":
		return "Zephyr Scale"
	case "kiwi-tcms":
		return "Kiwi TCMS"
	case "xray":
		return "Xray"
	case "tuskr":
		return "Tuskr"
	default:
		return source
	}
}

// resolveProjectKey finds the human-readable key for a claimed job's
// internal project id via ListProjects — a per-project-scoped token
// (design.md D4) only ever sees its one project, so this is always a
// single-item lookup, not a scan across many.
func resolveProjectKey(ctx context.Context, tp TestPulseClient, projectID string) (string, error) {
	projects, err := tp.ListProjects(ctx)
	if err != nil {
		return "", fmt.Errorf("resolving TestPulse project key: %w", err)
	}
	for _, p := range projects {
		if p.ID == projectID {
			return p.Key, nil
		}
	}
	return "", fmt.Errorf("this token cannot see project %s", projectID)
}
