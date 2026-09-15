// Package zephyrscaleclient is a minimal Zephyr Scale Cloud REST API v2
// client — just enough to crawl a project's TEST_CASE folder/case
// structure for add-zephyr-scale-importer (design.md D-Z1/D-Z2/D-Z3/D-Z5).
// Not a general-purpose Zephyr Scale SDK: no write endpoints, since this
// importer never writes back to Zephyr Scale.
//
// Verified against the real published OpenAPI spec's generated TypeScript
// contracts (bun913/zephyr-api-client's data-contracts.ts, itself produced
// by swagger-typescript-api), not assumed: auth is a single Bearer token
// against a fixed, vendor-hosted endpoint (no site URL, unlike TestRail —
// design.md D-Z1); projects/folders/cases are addressed by string
// projectKey; a folder carries parentId (nullable, root when absent) and
// folderType ("TEST_CASE"|"TEST_PLAN"|"TEST_CYCLE"); a case's
// priority/status/folder/testScript are link objects (id + self), not
// embedded values — this client only resolves the folder and testScript
// links (design.md D-Z2/D-Z3; D-Z4 deliberately never resolves
// priority/status, so no client method fetches them at all); a case's
// steps live at a separate /testcases/{key}/teststeps endpoint from its
// /testcases/{key}/testscript (a "plain" or "bdd" freeform text blob) —
// distinct, mutually exclusive representations of a case's procedure.
//
// No ListCustomFields method exists: design.md D-Z5 resolved to mapping by
// a case's own custom field JSON value shape (string vs. everything else),
// not by a vendor type enum, since no live account or authoritative spec
// exposed a field-definitions endpoint to verify one against.
package zephyrscaleclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// defaultBaseURL is Zephyr Scale Cloud's fixed, vendor-hosted API — never
// varies per customer, unlike TestRail's own-instance site URL (design.md
// D-Z1). Zephyr Scale Server/Data Center exposes a structurally different,
// self-hosted API and is out of scope (design.md Non-Goals).
const defaultBaseURL = "https://api.zephyrscale.smartbear.com/v2"

// pageSize is the maxResults page size used for every paginated list call.
const pageSize = 50

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		token:   token,
		http:    &http.Client{},
	}
}

type pagedList struct {
	Total  *int            `json:"total"`
	IsLast *bool           `json:"isLast"`
	Values json.RawMessage `json:"values"`
}

// list fetches every page of a startAt/maxResults-paginated endpoint,
// decoding each page's "values" array via decode (which returns how many
// items it decoded) and stopping once a page reports zero new items,
// isLast, or startAt has reached the reported total — whichever signal the
// server actually sends, since isLast/total are both optional in the
// generated PagedList contract.
func (c *Client) list(ctx context.Context, path string, query url.Values, decode func(json.RawMessage) (int, error)) error {
	startAt := 0
	for {
		q := url.Values{}
		for k, v := range query {
			q[k] = v
		}
		q.Set("maxResults", strconv.Itoa(pageSize))
		q.Set("startAt", strconv.Itoa(startAt))

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path+"?"+q.Encode(), nil)
		if err != nil {
			return fmt.Errorf("building Zephyr Scale request for %s: %w", path, err)
		}
		req.Header.Set("Authorization", "Bearer "+c.token)

		resp, err := c.http.Do(req)
		if err != nil {
			return fmt.Errorf("calling Zephyr Scale %s: %w", path, err)
		}
		var page pagedList
		var count int
		func() {
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusOK {
				err = fmt.Errorf("zephyr scale %s returned %s", path, resp.Status)
				return
			}
			if decErr := json.NewDecoder(resp.Body).Decode(&page); decErr != nil {
				err = fmt.Errorf("decoding Zephyr Scale %s response: %w", path, decErr)
				return
			}
			count, err = decode(page.Values)
		}()
		if err != nil {
			return err
		}

		startAt += count
		if count == 0 || (page.IsLast != nil && *page.IsLast) || (page.Total != nil && startAt >= *page.Total) {
			return nil
		}
	}
}

// Folder is a Zephyr Scale TEST_CASE-type folder (ListFolders never
// fetches TEST_PLAN/TEST_CYCLE folders at all — design.md D-Z2). ParentID
// is nil for a root folder.
type Folder struct {
	ID       int
	ParentID *int
	Name     string
}

// ListFolders returns every TEST_CASE-type folder in a project, preserving
// Zephyr Scale's own parentId-linked tree — the mapping target for a
// nested TestPulse Folder tree (design.md D-Z2).
func (c *Client) ListFolders(ctx context.Context, projectKey string) ([]Folder, error) {
	var all []Folder
	err := c.list(ctx, "/folders", url.Values{"projectKey": {projectKey}, "folderType": {"TEST_CASE"}}, func(raw json.RawMessage) (int, error) {
		var page []struct {
			ID       int    `json:"id"`
			ParentID *int   `json:"parentId"`
			Name     string `json:"name"`
		}
		if err := json.Unmarshal(raw, &page); err != nil {
			return 0, fmt.Errorf("decoding Zephyr Scale folders: %w", err)
		}
		for _, f := range page {
			all = append(all, Folder{ID: f.ID, ParentID: f.ParentID, Name: f.Name})
		}
		return len(page), nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}

// Case is a Zephyr Scale test case. FolderID is nil when the case has no
// folder (imports into the project root, design.md D-Z2). HasTestScript
// reflects whether the case's testScript link is present — callers use
// this to decide whether GetTestScript is worth calling at all, without
// guessing an empty-script response shape. CustomFields is the case's own
// raw JSON value map (design.md D-Z5) — deciding which values are
// mappable strings versus droppable is internal/importer's job, not this
// client's.
type Case struct {
	Key           string
	Name          string
	FolderID      *int
	HasTestScript bool
	CustomFields  map[string]any
}

// ListTestCases returns every case within a project. Paginates until every
// page has been fetched.
func (c *Client) ListTestCases(ctx context.Context, projectKey string) ([]Case, error) {
	var all []Case
	err := c.list(ctx, "/testcases", url.Values{"projectKey": {projectKey}}, func(raw json.RawMessage) (int, error) {
		var page []struct {
			Key    string `json:"key"`
			Name   string `json:"name"`
			Folder *struct {
				ID *int `json:"id"`
			} `json:"folder"`
			TestScript *struct {
				ID *int `json:"id"`
			} `json:"testScript"`
			CustomFields map[string]any `json:"customFields"`
		}
		if err := json.Unmarshal(raw, &page); err != nil {
			return 0, fmt.Errorf("decoding Zephyr Scale test cases: %w", err)
		}
		for _, tc := range page {
			var folderID *int
			if tc.Folder != nil {
				folderID = tc.Folder.ID
			}
			all = append(all, Case{
				Key:           tc.Key,
				Name:          tc.Name,
				FolderID:      folderID,
				HasTestScript: tc.TestScript != nil,
				CustomFields:  tc.CustomFields,
			})
		}
		return len(page), nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}

// TestStep is one entry of a case's step-by-step test steps. IsDelegate
// marks a "call to test" step (delegates execution to another test case)
// — design.md's Non-Goals: TestPulse has no delegate-step concept, so
// these are skipped by the caller rather than mapped. A non-delegate entry
// always carries Description/TestData/ExpectedResult (Zephyr Scale's
// "inline" step shape).
type TestStep struct {
	Description    string
	TestData       string
	ExpectedResult string
	IsDelegate     bool
}

// ListTestSteps returns a case's step-by-step steps, in order. A case
// authored as plain-text or BDD instead of step-by-step returns an empty
// slice — GetTestScript is the counterpart for that representation.
func (c *Client) ListTestSteps(ctx context.Context, testCaseKey string) ([]TestStep, error) {
	var all []TestStep
	path := fmt.Sprintf("/testcases/%s/teststeps", url.PathEscape(testCaseKey))
	err := c.list(ctx, path, nil, func(raw json.RawMessage) (int, error) {
		var page []struct {
			Inline *struct {
				Description    string `json:"description"`
				TestData       string `json:"testData"`
				ExpectedResult string `json:"expectedResult"`
			} `json:"inline"`
		}
		if err := json.Unmarshal(raw, &page); err != nil {
			return 0, fmt.Errorf("decoding Zephyr Scale test steps: %w", err)
		}
		for _, s := range page {
			if s.Inline != nil {
				all = append(all, TestStep{
					Description:    s.Inline.Description,
					TestData:       s.Inline.TestData,
					ExpectedResult: s.Inline.ExpectedResult,
				})
				continue
			}
			all = append(all, TestStep{IsDelegate: true})
		}
		return len(page), nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}

// TestScript is a case's plain-text or BDD procedure — an alternative,
// mutually exclusive representation to step-by-step TestStep entries
// (design.md D-Z3). Type is "plain" or "bdd".
type TestScript struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// GetTestScript fetches a case's test script. Returns nil, nil when the
// case has no script (404) — a case legitimately may have neither steps
// nor a script. Callers should check Case.HasTestScript first to avoid an
// unnecessary request, but this handles a 404 safely either way.
func (c *Client) GetTestScript(ctx context.Context, testCaseKey string) (*TestScript, error) {
	path := fmt.Sprintf("/testcases/%s/testscript", url.PathEscape(testCaseKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("building Zephyr Scale request for %s: %w", path, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling Zephyr Scale %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("zephyr scale %s returned %s", path, resp.Status)
	}
	var script TestScript
	if err := json.NewDecoder(resp.Body).Decode(&script); err != nil {
		return nil, fmt.Errorf("decoding Zephyr Scale %s response: %w", path, err)
	}
	return &script, nil
}
