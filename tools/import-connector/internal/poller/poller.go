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

// Once claims and runs at most one pending job for source. Returns true
// when a job was claimed (whether it ultimately succeeded or failed) and
// false when nothing was pending — the ordinary steady-state case, not an
// error.
func Once(ctx context.Context, tp TestPulseClient, newTestRail NewTestRailClient, newQase NewQaseClient, source string, logger *slog.Logger) bool {
	claimed, err := tp.ClaimPendingJob(ctx, source)
	if err != nil {
		logger.Error("claiming pending job", "source", source, "error", err)
		return false
	}
	if claimed == nil {
		return false
	}
	logger.Info("claimed import job", "jobId", claimed.Job.ID, "mode", claimed.Job.Mode)

	if err := runClaimedJob(ctx, tp, newTestRail, newQase, source, claimed, logger); err != nil {
		logger.Error("running import job", "jobId", claimed.Job.ID, "error", err)
		msg := err.Error()
		if cerr := tp.CompleteJob(ctx, claimed.Job.ID, "failed", nil, &msg); cerr != nil {
			logger.Error("reporting job failure", "jobId", claimed.Job.ID, "error", cerr)
		}
	}
	return true
}

func runClaimedJob(ctx context.Context, tp TestPulseClient, newTestRail NewTestRailClient, newQase NewQaseClient, source string, claimed *testpulseclient.ClaimedJob, logger *slog.Logger) error {
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
