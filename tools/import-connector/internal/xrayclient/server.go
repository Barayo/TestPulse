package xrayclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type serverClient struct {
	siteURL    string
	pat        string
	projectKey string
	http       *http.Client
}

// NewServer returns a Client backed by Xray Server/Data Center's REST API,
// authenticated via a Jira Personal Access Token (design.md D-X2 — never
// Basic Auth). No network call happens at construction: unlike Cloud's
// token exchange, a PAT is a stateless bearer credential attached to
// every later request.
func NewServer(ctx context.Context, siteURL, personalAccessToken, projectKey string) (Client, error) {
	return &serverClient{
		siteURL:    strings.TrimSuffix(siteURL, "/"),
		pat:        personalAccessToken,
		projectKey: projectKey,
		http:       &http.Client{},
	}, nil
}

func (c *serverClient) do(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.siteURL+path, nil)
	if err != nil {
		return fmt.Errorf("building Xray Server/DC request for %s: %w", path, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.pat)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling Xray Server/DC %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("xray server/dc %s returned %s", path, resp.Status)
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("decoding Xray Server/DC %s response: %w", path, err)
		}
	}
	return nil
}

type rawFolder struct {
	ID      int         `json:"id"`
	Name    string      `json:"name"`
	Folders []rawFolder `json:"folders"`
}

// ListFolders fetches the project's whole Test Repository tree in one
// call (confirmed: GET /testrepository/{projectKey}/folders returns a
// nested tree, unlike Cloud's per-level getFolder) and flattens it,
// skipping the root itself (design.md D-X4: its direct children are the
// top-level TestPulse folders).
func (c *serverClient) ListFolders(ctx context.Context) ([]Folder, error) {
	path := fmt.Sprintf("/rest/raven/1.0/api/testrepository/%s/folders", url.PathEscape(c.projectKey))
	var root rawFolder
	if err := c.do(ctx, path, &root); err != nil {
		return nil, fmt.Errorf("listing Xray Server/DC Test Repository folders: %w", err)
	}

	var all []Folder
	var walk func(children []rawFolder, parentID *string)
	walk = func(children []rawFolder, parentID *string) {
		for _, f := range children {
			id := strconv.Itoa(f.ID)
			all = append(all, Folder{ID: id, ParentID: parentID, Name: f.Name})
			walk(f.Folders, &id)
		}
	}
	walk(root.Folders, nil)
	return all, nil
}

// ListTests lists the tests directly inside folderID, then resolves each
// one's Jira issue fields (summary, description, and every
// "customfield_*" value) via Jira's own REST API — genuinely two calls
// per test, confirmed as Server/DC's own documented split (design.md
// D-X3). TestType is left empty: no Server/DC field for it was
// independently verified (design.md D-X5 addendum) — callers should
// decide Manual-vs-not by whether GetTestSteps returns any steps.
func (c *serverClient) ListTests(ctx context.Context, folderID string) ([]Test, error) {
	listPath := fmt.Sprintf("/rest/raven/1.0/api/testrepository/%s/folders/%s/tests", url.PathEscape(c.projectKey), url.PathEscape(folderID))
	var summaries []struct {
		Key string `json:"key"`
	}
	if err := c.do(ctx, listPath, &summaries); err != nil {
		return nil, fmt.Errorf("listing Xray tests in folder %q: %w", folderID, err)
	}

	var all []Test
	for _, s := range summaries {
		issuePath := fmt.Sprintf("/rest/api/2/issue/%s?expand=names", url.PathEscape(s.Key))
		var issue struct {
			Key    string         `json:"key"`
			Names  map[string]any `json:"names"`
			Fields map[string]any `json:"fields"`
		}
		if err := c.do(ctx, issuePath, &issue); err != nil {
			return nil, fmt.Errorf("fetching Jira issue %s: %w", s.Key, err)
		}

		t := Test{Key: issue.Key}
		if v, ok := issue.Fields["summary"].(string); ok {
			t.Summary = v
		}
		if v, ok := issue.Fields["description"].(string); ok {
			t.Description = v
		}
		customFields := map[string]any{}
		for k, v := range issue.Fields {
			if strings.HasPrefix(k, "customfield_") && v != nil {
				customFields[k] = v
			}
		}
		if len(customFields) > 0 {
			t.CustomFields = customFields
		}
		all = append(all, t)
	}
	return all, nil
}

// GetTestSteps fetches a Manual-type Test's structured steps via Xray's
// raven REST API. Returns an empty slice for a test with no steps
// (confirmed endpoint shape: GET /test/{testIssueKey}/step).
func (c *serverClient) GetTestSteps(ctx context.Context, testKey string) ([]TestStep, error) {
	path := fmt.Sprintf("/rest/raven/1.0/api/test/%s/step", url.PathEscape(testKey))
	var raw []struct {
		Action string `json:"action"`
		Data   string `json:"data"`
		Result string `json:"result"`
	}
	if err := c.do(ctx, path, &raw); err != nil {
		return nil, fmt.Errorf("fetching steps for Xray test %s: %w", testKey, err)
	}
	if len(raw) == 0 {
		return nil, nil
	}
	steps := make([]TestStep, len(raw))
	for i, s := range raw {
		steps[i] = TestStep{Action: s.Action, Data: s.Data, Result: s.Result}
	}
	return steps, nil
}
