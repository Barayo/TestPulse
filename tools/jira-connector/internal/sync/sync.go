// Package sync implements the connector's one-pass sync: for every project
// its token can see, batch-fetch each Jira-linked case's/open-run-item's
// current Jira data and write it back to TestPulse (add-jira-connector
// design.md D2). A failure anywhere — listing a project's cases, the Jira
// search itself, or writing one item's result — is logged and skipped,
// never fatal to the rest of the pass (design.md D6).
package sync

import (
	"context"
	"log/slog"

	"github.com/Barayo/TestPulse/tools/jira-connector/internal/jiraclient"
	"github.com/Barayo/TestPulse/tools/jira-connector/internal/testpulseclient"
)

// TestPulseClient is the subset of testpulseclient.Client this package
// needs — an interface so tests can substitute a fake.
type TestPulseClient interface {
	ListProjects(ctx context.Context) ([]testpulseclient.Project, error)
	ListJiraLinkedCases(ctx context.Context, projectKey string) ([]testpulseclient.Case, error)
	ListOpenRuns(ctx context.Context, projectKey string) ([]testpulseclient.Run, error)
	ListJiraLinkedRunItems(ctx context.Context, runKey string) ([]testpulseclient.RunItem, error)
	SyncCase(ctx context.Context, caseKey, summary, status string) error
	SyncRunItem(ctx context.Context, itemID, summary, status string) error
}

// JiraClient is the subset of jiraclient.Client this package needs.
type JiraClient interface {
	SearchIssues(ctx context.Context, keys []string) ([]jiraclient.Issue, error)
}

// Once runs a single sync pass across every project the TestPulse client's
// token can see.
func Once(ctx context.Context, tp TestPulseClient, jira JiraClient, logger *slog.Logger) {
	projects, err := tp.ListProjects(ctx)
	if err != nil {
		logger.Error("listing projects", "error", err)
		return
	}

	for _, project := range projects {
		syncProjectCases(ctx, tp, jira, logger, project.Key)

		runs, err := tp.ListOpenRuns(ctx, project.Key)
		if err != nil {
			logger.Error("listing open runs", "project", project.Key, "error", err)
			continue
		}
		for _, run := range runs {
			syncRunItems(ctx, tp, jira, logger, run.Key)
		}
	}
}

func syncProjectCases(ctx context.Context, tp TestPulseClient, jira JiraClient, logger *slog.Logger, projectKey string) {
	cases, err := tp.ListJiraLinkedCases(ctx, projectKey)
	if err != nil {
		logger.Error("listing jira-linked cases", "project", projectKey, "error", err)
		return
	}
	if len(cases) == 0 {
		return
	}

	keys := make([]string, len(cases))
	for i, c := range cases {
		keys[i] = c.JiraIssueKey
	}
	issues, err := jira.SearchIssues(ctx, keys)
	if err != nil {
		logger.Error("searching jira issues", "project", projectKey, "error", err)
		return
	}
	byKey := issuesByKey(issues)

	for _, c := range cases {
		issue, ok := byKey[c.JiraIssueKey]
		if !ok {
			logger.Warn("linked jira issue not found, skipping", "case", c.Key, "jiraIssueKey", c.JiraIssueKey)
			continue
		}
		if err := tp.SyncCase(ctx, c.Key, issue.Summary, issue.Status); err != nil {
			logger.Error("syncing case", "case", c.Key, "error", err)
			continue
		}
	}
}

func syncRunItems(ctx context.Context, tp TestPulseClient, jira JiraClient, logger *slog.Logger, runKey string) {
	items, err := tp.ListJiraLinkedRunItems(ctx, runKey)
	if err != nil {
		logger.Error("listing jira-linked run items", "run", runKey, "error", err)
		return
	}
	if len(items) == 0 {
		return
	}

	keys := make([]string, len(items))
	for i, it := range items {
		keys[i] = it.JiraIssueKey
	}
	issues, err := jira.SearchIssues(ctx, keys)
	if err != nil {
		logger.Error("searching jira issues", "run", runKey, "error", err)
		return
	}
	byKey := issuesByKey(issues)

	for _, it := range items {
		issue, ok := byKey[it.JiraIssueKey]
		if !ok {
			logger.Warn("linked jira issue not found, skipping", "item", it.ID, "jiraIssueKey", it.JiraIssueKey)
			continue
		}
		if err := tp.SyncRunItem(ctx, it.ID, issue.Summary, issue.Status); err != nil {
			logger.Error("syncing run item", "item", it.ID, "error", err)
			continue
		}
	}
}

func issuesByKey(issues []jiraclient.Issue) map[string]jiraclient.Issue {
	m := make(map[string]jiraclient.Issue, len(issues))
	for _, issue := range issues {
		m[issue.Key] = issue
	}
	return m
}
