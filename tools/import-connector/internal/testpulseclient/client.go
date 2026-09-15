// Package testpulseclient is a minimal REST client for TestPulse's own
// public API — just the calls the import connector needs
// (add-testrail-importer): claim/report on import jobs, and create
// folders/cases/custom fields through the same endpoints a human author
// would use. Authenticates as an ordinary scoped agent actor via a Bearer
// token, matching tools/jira-connector's testpulseclient.
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

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshaling request for %s: %w", path, err)
		}
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("building request for %s: %w", path, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%s %s returned %s", method, path, resp.Status)
	}
	if out == nil || resp.StatusCode == http.StatusNoContent {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decoding response from %s: %w", path, err)
	}
	return nil
}

type Project struct {
	ID  string `json:"id"`
	Key string `json:"key"`
}

// ListProjects returns every project this connector's token can see —
// since an import connector's token is always scoped to exactly one
// project (design.md D4), this is how it discovers that project's human
// key, needed by every folder/case-authoring endpoint's {projectKey} path
// segment (the claimed job only carries the project's internal id).
func (c *Client) ListProjects(ctx context.Context) ([]Project, error) {
	var projects []Project
	if err := c.do(ctx, http.MethodGet, "/api/v1/projects", nil, &projects); err != nil {
		return nil, err
	}
	return projects, nil
}

type Folder struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	ParentFolderID string `json:"parentFolderId"`
}

// RootFolderID finds a project's root folder — the one Folder in its list
// with no ParentFolderID (Folder's own doc: "Absent for a project's root
// folder") — needed as the parent for each TestRail-suite-derived
// top-level Folder (design.md D6).
func (c *Client) RootFolderID(ctx context.Context, projectKey string) (string, error) {
	var page struct {
		Items []Folder `json:"items"`
	}
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/api/v1/projects/%s/folders", url.PathEscape(projectKey)), nil, &page); err != nil {
		return "", err
	}
	for _, f := range page.Items {
		if f.ParentFolderID == "" {
			return f.ID, nil
		}
	}
	return "", fmt.Errorf("project %s has no root folder", projectKey)
}

// CreateFolder creates a subfolder — the mapping target for both a
// TestRail Suite (parented at the project root) and a TestRail Section
// (parented at its suite's or parent section's own Folder), design.md D6.
func (c *Client) CreateFolder(ctx context.Context, projectKey, name, parentFolderID string) (Folder, error) {
	var created Folder
	body := jmap{"name": name, "parentFolderId": parentFolderID}
	err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/folders", url.PathEscape(projectKey)), body, &created)
	return created, err
}

type Step struct {
	Action   string `json:"action"`
	Expected string `json:"expected"`
}

// NewCase is the request body for creating a case — CustomFields is keyed
// by TestPulse custom field id (not TestRail's field name), matching
// design.md D7's mapped-field values. Description is empty for TestRail
// and Qase (design.md D6/D-Q3 map to Steps only); Zephyr Scale's
// importer populates it for a script-only case with no step-by-step
// steps, preserving its plain-text/BDD procedure as prose instead of
// dropping it (add-zephyr-scale-importer design.md D-Z3).
type NewCase struct {
	Title        string            `json:"title"`
	Description  string            `json:"description,omitempty"`
	FolderID     string            `json:"folderId"`
	Steps        []Step            `json:"steps,omitempty"`
	CustomFields map[string]string `json:"customFields,omitempty"`
}

type Case struct {
	Key string `json:"key"`
}

func (c *Client) CreateCase(ctx context.Context, projectKey string, input NewCase) (Case, error) {
	var created Case
	err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/cases", url.PathEscape(projectKey)), input, &created)
	return created, err
}

type CustomField struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// CreateCustomField creates a project custom field definition — fieldType
// is one of TestPulse's fixed CustomFieldType values ("text"/"select"),
// the only two design.md D7 ever maps a TestRail field into.
func (c *Client) CreateCustomField(ctx context.Context, projectKey, name, fieldType string) (CustomField, error) {
	var created CustomField
	body := jmap{"name": name, "fieldType": fieldType}
	err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/v1/projects/%s/custom-fields", url.PathEscape(projectKey)), body, &created)
	return created, err
}

type CustomFieldOption struct {
	ID    string `json:"id"`
	Value string `json:"value"`
}

func (c *Client) AddCustomFieldOption(ctx context.Context, fieldID, value string) (CustomFieldOption, error) {
	var created CustomFieldOption
	body := jmap{"value": value}
	err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/v1/custom-fields/%s/options", url.PathEscape(fieldID)), body, &created)
	return created, err
}

// ImportJob is the subset of the browser-facing job shape the importer
// itself needs back.
type ImportJob struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Mode      string `json:"mode"`
}

// ClaimedJob pairs a claimed job with its decrypted credentials — mirrors
// apps/api's own ClaimedImportJob response shape.
type ClaimedJob struct {
	Job         ImportJob         `json:"job"`
	Credentials map[string]string `json:"credentials"`
}

// ClaimPendingJob claims the oldest pending job for source, scoped to this
// client's own token (design.md D3/D4). Returns nil, nil when nothing is
// pending (204).
func (c *Client) ClaimPendingJob(ctx context.Context, source string) (*ClaimedJob, error) {
	path := fmt.Sprintf("/api/v1/import-jobs?status=pending&source=%s", url.QueryEscape(source))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("building request for %s: %w", path, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s returned %s", path, resp.Status)
	}
	var claimed ClaimedJob
	if err := json.NewDecoder(resp.Body).Decode(&claimed); err != nil {
		return nil, fmt.Errorf("decoding response from %s: %w", path, err)
	}
	return &claimed, nil
}

// ReportProgress patches a running job's progress counters.
func (c *Client) ReportProgress(ctx context.Context, jobID string, current, total int) error {
	body := jmap{"progressCurrent": current, "progressTotal": total}
	return c.do(ctx, http.MethodPatch, fmt.Sprintf("/api/v1/import-jobs/%s", url.PathEscape(jobID)), body, nil)
}

// ImportReport is the per-entity created counts plus individually-named
// unmapped fields, mirroring apps/api's domain.ImportReport.
type ImportReport struct {
	Counts   map[string]int `json:"counts"`
	Unmapped []string       `json:"unmapped"`
}

// CompleteJob patches a job to a terminal status with its final report or
// error.
func (c *Client) CompleteJob(ctx context.Context, jobID, status string, report *ImportReport, errMsg *string) error {
	body := jmap{"status": status}
	if report != nil {
		body["report"] = report
	}
	if errMsg != nil {
		body["error"] = *errMsg
	}
	return c.do(ctx, http.MethodPatch, fmt.Sprintf("/api/v1/import-jobs/%s", url.PathEscape(jobID)), body, nil)
}

type jmap = map[string]any
