// Package testpulseclient is a minimal REST client for the TestPulse API —
// just the calls the Jira connector needs (add-jira-connector): discover
// projects, list Jira-linked cases/run items, and write back cached sync
// data. Authenticates as an ordinary scoped agent actor via a Bearer token,
// the same mechanism any other agent uses — no special auth surface.
package testpulseclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		token:   token,
		http:    &http.Client{},
	}
}

type Project struct {
	Key string `json:"key"`
}

type Case struct {
	Key          string `json:"key"`
	JiraIssueKey string `json:"jiraIssueKey"`
}

type Run struct {
	Key    string `json:"key"`
	Status string `json:"status"`
}

type RunItem struct {
	ID           string `json:"id"`
	JiraIssueKey string `json:"jiraIssueKey"`
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("building request for %s: %w", path, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s returned %s", path, resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decoding response from %s: %w", path, err)
	}
	return nil
}

// ListProjects returns every project this connector's token can see.
func (c *Client) ListProjects(ctx context.Context) ([]Project, error) {
	var projects []Project
	if err := c.get(ctx, "/api/v1/projects", &projects); err != nil {
		return nil, err
	}
	return projects, nil
}

// ListJiraLinkedCases returns a project's cases with a non-null
// jiraIssueKey, via the jiraLinked=true filter (a DB-level query on
// TestPulse's side, not a client-side scan).
func (c *Client) ListJiraLinkedCases(ctx context.Context, projectKey string) ([]Case, error) {
	var cases []Case
	path := fmt.Sprintf("/api/v1/projects/%s/cases?jiraLinked=true", url.PathEscape(projectKey))
	if err := c.get(ctx, path, &cases); err != nil {
		return nil, err
	}
	return cases, nil
}

// ListOpenRuns returns a project's open runs — TestPulse has no
// status-filtered runs endpoint, so this filters the (per-project, already
// bounded) result client-side.
func (c *Client) ListOpenRuns(ctx context.Context, projectKey string) ([]Run, error) {
	var runs []Run
	path := fmt.Sprintf("/api/v1/projects/%s/runs", url.PathEscape(projectKey))
	if err := c.get(ctx, path, &runs); err != nil {
		return nil, err
	}
	open := make([]Run, 0, len(runs))
	for _, r := range runs {
		if r.Status == "open" {
			open = append(open, r)
		}
	}
	return open, nil
}

// ListJiraLinkedRunItems returns an open run's items with a non-null
// jiraIssueKey, via the jiraLinked=true filter.
func (c *Client) ListJiraLinkedRunItems(ctx context.Context, runKey string) ([]RunItem, error) {
	var items []RunItem
	path := fmt.Sprintf("/api/v1/runs/%s/items?jiraLinked=true", url.PathEscape(runKey))
	if err := c.get(ctx, path, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func (c *Client) put(ctx context.Context, path string, body any) error {
	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshaling request for %s: %w", path, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.baseURL+path, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("building request for %s: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%s returned %s", path, resp.Status)
	}
	return nil
}

type syncBody struct {
	JiraIssueSummary string `json:"jiraIssueSummary"`
	JiraIssueStatus  string `json:"jiraIssueStatus"`
}

// SyncCase writes a case's cached Jira summary/status.
func (c *Client) SyncCase(ctx context.Context, caseKey, summary, status string) error {
	path := fmt.Sprintf("/api/v1/cases/%s/jira-sync", url.PathEscape(caseKey))
	return c.put(ctx, path, syncBody{JiraIssueSummary: summary, JiraIssueStatus: status})
}

// SyncRunItem writes a run item's cached Jira summary/status.
func (c *Client) SyncRunItem(ctx context.Context, itemID, summary, status string) error {
	path := fmt.Sprintf("/api/v1/items/%s/jira-sync", url.PathEscape(itemID))
	return c.put(ctx, path, syncBody{JiraIssueSummary: summary, JiraIssueStatus: status})
}
