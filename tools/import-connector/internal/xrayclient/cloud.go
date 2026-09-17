package xrayclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// defaultCloudAuthHost is Xray Cloud's fixed, global token-exchange
// endpoint (design.md D-X2) — never varies per customer.
const defaultCloudAuthHost = "https://xray.cloud.getxray.app"

// defaultCloudGraphQLHost is Xray Cloud's US-region GraphQL host. Xray
// Cloud also serves EU/AU regions on different hosts, but region
// selection has no Connect-screen field in v1 (design.md's "Addendum,
// discovered during implementation" under D-X6 narrows Cloud's custom
// field scope for a related reason) — defaulting to US is a stated v1
// limitation, not a silent gap; see docs/integrations.md.
const defaultCloudGraphQLHost = "https://us.xray.cloud.getxray.app"

// pageSize is the getTests "limit" page size used for every paginated
// GraphQL call.
const pageSize = 100

type cloudClient struct {
	authHost    string
	graphqlHost string
	token       string
	projectID   string
	http        *http.Client
}

// NewCloud authenticates against Xray Cloud's token endpoint
// (design.md D-X2) and returns a Client backed by Xray Cloud's GraphQL
// API. baseHost overrides both the auth and GraphQL hosts (used by
// tests against an httptest.Server); empty uses the real, separate
// default hosts. projectID is the numeric Jira project id, not the
// project key (design.md D-X2 addendum).
func NewCloud(ctx context.Context, baseHost, clientID, clientSecret, projectID string) (Client, error) {
	authHost := defaultCloudAuthHost
	graphqlHost := defaultCloudGraphQLHost
	if baseHost != "" {
		authHost = baseHost
		graphqlHost = baseHost
	}

	body, err := json.Marshal(map[string]string{"client_id": clientID, "client_secret": clientSecret})
	if err != nil {
		return nil, fmt.Errorf("marshaling Xray Cloud authenticate request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(authHost, "/")+"/api/v2/authenticate", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("building Xray Cloud authenticate request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling Xray Cloud authenticate: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("xray cloud authenticate returned %s", resp.Status)
	}
	var token string
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		return nil, fmt.Errorf("decoding Xray Cloud authenticate response: %w", err)
	}

	return &cloudClient{
		authHost:    authHost,
		graphqlHost: graphqlHost,
		token:       token,
		projectID:   projectID,
		http:        httpClient,
	}, nil
}

type graphqlError struct {
	Message string `json:"message"`
}

type graphqlEnvelope struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphqlError  `json:"errors"`
}

// doGraphQL POSTs a GraphQL query+variables to Xray Cloud and decodes the
// "data" envelope into out, surfacing any "errors" entries as a Go error.
func (c *cloudClient) doGraphQL(ctx context.Context, query string, variables map[string]any, out any) error {
	payload, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return fmt.Errorf("marshaling Xray Cloud GraphQL request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(c.graphqlHost, "/")+"/api/v2/graphql", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("building Xray Cloud GraphQL request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling Xray Cloud GraphQL: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("xray cloud graphql returned %s", resp.Status)
	}
	var envelope graphqlEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("decoding Xray Cloud GraphQL response: %w", err)
	}
	if len(envelope.Errors) > 0 {
		return fmt.Errorf("xray cloud graphql error: %s", envelope.Errors[0].Message)
	}
	if out != nil {
		if err := json.Unmarshal(envelope.Data, out); err != nil {
			return fmt.Errorf("decoding Xray Cloud GraphQL data: %w", err)
		}
	}
	return nil
}

const getFolderQuery = `query GetFolder($projectId: String!, $path: String!) {
  getFolder(projectId: $projectId, path: $path) {
    name
    path
    folders {
      name
      path
    }
  }
}`

// ListFolders walks the project's Test Repository tree one level at a
// time, starting from the root path "/" — the root itself is never
// returned as a Folder entry (design.md D-X4: its direct children are
// the top-level TestPulse folders), matching every prior importer's
// root-is-not-imported convention.
func (c *cloudClient) ListFolders(ctx context.Context) ([]Folder, error) {
	var all []Folder
	var walk func(path string, parentID *string) error
	walk = func(path string, parentID *string) error {
		var resp struct {
			GetFolder struct {
				Folders []struct {
					Name string `json:"name"`
					Path string `json:"path"`
				} `json:"folders"`
			} `json:"getFolder"`
		}
		if err := c.doGraphQL(ctx, getFolderQuery, map[string]any{"projectId": c.projectID, "path": path}, &resp); err != nil {
			return fmt.Errorf("listing Xray folder %q: %w", path, err)
		}
		for _, child := range resp.GetFolder.Folders {
			childID := child.Path
			all = append(all, Folder{ID: childID, ParentID: parentID, Name: child.Name})
			if err := walk(child.Path, &childID); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk("/", nil); err != nil {
		return nil, err
	}
	return all, nil
}

const getTestsQuery = `query GetTests($projectId: String!, $path: [String], $start: Int!, $limit: Int!) {
  getTests(projectId: $projectId, folder: {path: $path, includeDescendants: false}, start: $start, limit: $limit) {
    total
    start
    limit
    results {
      issueId
      testType { name }
      steps { action data result }
      gherkin
      unstructured
      jira(fields: ["key", "summary", "description"])
    }
  }
}`

type gqlStep struct {
	Action string `json:"action"`
	Data   string `json:"data"`
	Result string `json:"result"`
}

type gqlTestResult struct {
	IssueID  string `json:"issueId"`
	TestType struct {
		Name string `json:"name"`
	} `json:"testType"`
	// Steps is documented as a nested array ([[Step]]); every sub-array
	// encountered is flattened into one ordered step list rather than
	// assuming a fixed shape the docs don't fully explain.
	Steps        [][]gqlStep    `json:"steps"`
	Gherkin      []string       `json:"gherkin"`
	Unstructured []string       `json:"unstructured"`
	Jira         map[string]any `json:"jira"`
}

func flattenSteps(steps [][]gqlStep) []TestStep {
	var out []TestStep
	for _, group := range steps {
		for _, s := range group {
			out = append(out, TestStep(s))
		}
	}
	return out
}

func jiraString(jira map[string]any, field string) string {
	v, _ := jira[field].(string)
	return v
}

func toCloudTest(r gqlTestResult) Test {
	t := Test{
		Key:         jiraString(r.Jira, "key"),
		Summary:     jiraString(r.Jira, "summary"),
		Description: jiraString(r.Jira, "description"),
		TestType:    r.TestType.Name,
	}
	if len(r.Gherkin) > 0 {
		t.Definition = strings.Join(r.Gherkin, "\n")
	} else if len(r.Unstructured) > 0 {
		t.Definition = strings.Join(r.Unstructured, "\n")
	}
	return t
}

// ListTests returns every Test issue directly inside folderID (a Test
// Repository folder path for Cloud), paginating via getTests' start/limit
// until every page has been fetched (design.md's Cloud rate-limit risk).
// Custom fields are never populated here (design.md D-X6 addendum: Cloud
// mode does not import Jira custom fields in v1).
func (c *cloudClient) ListTests(ctx context.Context, folderID string) ([]Test, error) {
	var all []Test
	start := 0
	for {
		var resp struct {
			GetTests struct {
				Total   int             `json:"total"`
				Results []gqlTestResult `json:"results"`
			} `json:"getTests"`
		}
		variables := map[string]any{
			"projectId": c.projectID,
			"path":      []string{folderID},
			"start":     start,
			"limit":     pageSize,
		}
		if err := c.doGraphQL(ctx, getTestsQuery, variables, &resp); err != nil {
			return nil, fmt.Errorf("listing Xray tests in folder %q: %w", folderID, err)
		}
		for _, r := range resp.GetTests.Results {
			all = append(all, toCloudTest(r))
		}
		start += len(resp.GetTests.Results)
		if len(resp.GetTests.Results) == 0 || start >= resp.GetTests.Total {
			return all, nil
		}
	}
}

const getTestStepsQuery = `query GetTestSteps($projectId: String!, $jql: String!) {
  getTests(projectId: $projectId, jql: $jql, limit: 1) {
    results {
      steps { action data result }
    }
  }
}`

// GetTestSteps fetches a single Test's structured steps by issue key,
// via a JQL-scoped getTests call (avoids relying on an unverified
// issueId-vs-key convention for a dedicated getTest lookup).
func (c *cloudClient) GetTestSteps(ctx context.Context, testKey string) ([]TestStep, error) {
	var resp struct {
		GetTests struct {
			Results []struct {
				Steps [][]gqlStep `json:"steps"`
			} `json:"results"`
		} `json:"getTests"`
	}
	variables := map[string]any{
		"projectId": c.projectID,
		"jql":       fmt.Sprintf("key = %s", testKey),
	}
	if err := c.doGraphQL(ctx, getTestStepsQuery, variables, &resp); err != nil {
		return nil, fmt.Errorf("fetching steps for Xray test %s: %w", testKey, err)
	}
	if len(resp.GetTests.Results) == 0 {
		return nil, nil
	}
	return flattenSteps(resp.GetTests.Results[0].Steps), nil
}
