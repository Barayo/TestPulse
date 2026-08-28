// Package jiraclient is a minimal Jira Cloud REST API v3 client — just
// enough to batch-fetch the summary/status of a set of issue keys
// (add-jira-connector design.md D2). Not a general-purpose Jira SDK.
package jiraclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Client struct {
	baseURL  string
	email    string
	apiToken string
	http     *http.Client
}

func New(baseURL, email, apiToken string) *Client {
	return &Client{
		baseURL:  strings.TrimSuffix(baseURL, "/"),
		email:    email,
		apiToken: apiToken,
		http:     &http.Client{},
	}
}

// Issue is the subset of a Jira issue this connector cares about.
type Issue struct {
	Key     string
	Summary string
	Status  string
}

type searchRequest struct {
	JQL    string   `json:"jql"`
	Fields []string `json:"fields"`
}

type searchResponse struct {
	Issues []struct {
		Key    string `json:"key"`
		Fields struct {
			Summary string `json:"summary"`
			Status  struct {
				Name string `json:"name"`
			} `json:"status"`
		} `json:"fields"`
	} `json:"issues"`
}

// SearchIssues fetches the current summary/status of every key in one
// batched Jira search request (design.md D2) — not one call per key. Empty
// keys is a no-op: no request is made at all.
func (c *Client) SearchIssues(ctx context.Context, keys []string) ([]Issue, error) {
	if len(keys) == 0 {
		return nil, nil
	}

	quoted := make([]string, len(keys))
	for i, k := range keys {
		quoted[i] = fmt.Sprintf("%q", k)
	}
	jql := fmt.Sprintf("issuekey in (%s)", strings.Join(quoted, ","))

	body, err := json.Marshal(searchRequest{JQL: jql, Fields: []string{"summary", "status"}})
	if err != nil {
		return nil, fmt.Errorf("marshaling search request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/api/3/search", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("building search request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(c.email, c.apiToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling Jira search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Jira search returned %s", resp.Status)
	}

	var parsed searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decoding Jira search response: %w", err)
	}

	issues := make([]Issue, len(parsed.Issues))
	for i, raw := range parsed.Issues {
		issues[i] = Issue{Key: raw.Key, Summary: raw.Fields.Summary, Status: raw.Fields.Status.Name}
	}
	return issues, nil
}
