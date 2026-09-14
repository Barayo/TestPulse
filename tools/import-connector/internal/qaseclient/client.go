// Package qaseclient is a minimal Qase TestOps REST API v1 client — just
// enough to crawl a project's suite/case structure for add-qase-importer
// (design.md D-Q1/D-Q3/D-Q4). Not a general-purpose Qase SDK: no write
// endpoints, since this importer never writes back to Qase.
//
// Verified against Qase's own published OpenAPI source (qase-tms/specs),
// not assumed: auth is a single "Token" header (not Basic auth like
// TestRail's), projects are addressed by a string code (not a numeric
// id), and every list endpoint shares one envelope —
// {status, result: {total, filtered, count, entities}}.
package qaseclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// defaultBaseURL is Qase's public SaaS API. Qase has no self-hosted
// product (design.md D-Q2) — this is only overridden for the minority of
// Enterprise customers on a dedicated-VPC hostname.
const defaultBaseURL = "https://api.qase.io/v1"

// pageSize is the limit/offset page size used for every paginated list
// call. Qase's API caps this at 100 per its own documented limits.
const pageSize = 100

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

type listResult struct {
	Total    int             `json:"total"`
	Filtered int             `json:"filtered"`
	Count    int             `json:"count"`
	Entities json.RawMessage `json:"entities"`
}

type listResponse struct {
	Status bool       `json:"status"`
	Result listResult `json:"result"`
}

// list fetches every page of a limit/offset-paginated endpoint, decoding
// each page's "entities" array via decode and appending the results.
func (c *Client) list(ctx context.Context, path string, query url.Values, decode func(json.RawMessage) error) error {
	offset := 0
	for {
		q := url.Values{}
		for k, v := range query {
			q[k] = v
		}
		q.Set("limit", strconv.Itoa(pageSize))
		q.Set("offset", strconv.Itoa(offset))

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path+"?"+q.Encode(), nil)
		if err != nil {
			return fmt.Errorf("building Qase request for %s: %w", path, err)
		}
		req.Header.Set("Token", c.token)

		resp, err := c.http.Do(req)
		if err != nil {
			return fmt.Errorf("calling Qase %s: %w", path, err)
		}
		func() {
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusOK {
				err = fmt.Errorf("qase %s returned %s", path, resp.Status)
				return
			}
			var page listResponse
			if decErr := json.NewDecoder(resp.Body).Decode(&page); decErr != nil {
				err = fmt.Errorf("decoding Qase %s response: %w", path, decErr)
				return
			}
			if decErr := decode(page.Result.Entities); decErr != nil {
				err = decErr
				return
			}
			offset += page.Result.Count
			if page.Result.Count == 0 || offset >= page.Result.Total {
				offset = -1 // sentinel: no further page
			}
		}()
		if err != nil {
			return err
		}
		if offset < 0 {
			return nil
		}
	}
}

type Suite struct {
	ID       int    `json:"id"`
	Title    string `json:"title"`
	ParentID *int   `json:"parent_id"`
}

// ListSuites returns every suite in a project, preserving Qase's own
// parent_id-linked tree — the mapping target for a nested TestPulse
// Folder tree (design.md D-Q3). Qase has a single suite tree per project,
// unlike TestRail's separate suite/section levels.
func (c *Client) ListSuites(ctx context.Context, projectCode string) ([]Suite, error) {
	var all []Suite
	err := c.list(ctx, fmt.Sprintf("/suites/%s", url.PathEscape(projectCode)), nil, func(raw json.RawMessage) error {
		var page []Suite
		if err := json.Unmarshal(raw, &page); err != nil {
			return fmt.Errorf("decoding Qase suites: %w", err)
		}
		all = append(all, page...)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}

type Step struct {
	Action   string `json:"action"`
	Expected string `json:"expected_result"`
}

// CustomFieldValue is a case's own value for one of the site's global
// custom field definitions, keyed by that definition's numeric id — not
// its name, unlike TestRail's custom_<system_name> keys.
type CustomFieldValue struct {
	ID    int    `json:"id"`
	Value string `json:"value"`
}

// Case is a Qase test case. CustomFields carries the case's own values
// for whichever global custom field definitions apply to it — deciding
// which are text/select (mappable) versus dropped is internal/importer's
// job (design.md D-Q4), not this client's.
type Case struct {
	ID           int
	SuiteID      int
	Title        string
	Steps        []Step
	CustomFields []CustomFieldValue
}

// ListCases returns every case within a project. Paginates until every
// page has been fetched.
func (c *Client) ListCases(ctx context.Context, projectCode string) ([]Case, error) {
	var all []Case
	err := c.list(ctx, fmt.Sprintf("/cases/%s", url.PathEscape(projectCode)), nil, func(raw json.RawMessage) error {
		var page []struct {
			ID           int                `json:"id"`
			SuiteID      int                `json:"suite_id"`
			Title        string             `json:"title"`
			Steps        []Step             `json:"steps"`
			CustomFields []CustomFieldValue `json:"custom_fields"`
		}
		if err := json.Unmarshal(raw, &page); err != nil {
			return fmt.Errorf("decoding Qase cases: %w", err)
		}
		for _, c := range page {
			all = append(all, Case{
				ID:           c.ID,
				SuiteID:      c.SuiteID,
				Title:        c.Title,
				Steps:        c.Steps,
				CustomFields: c.CustomFields,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}

// CustomField describes one of a Qase site's global custom case field
// definitions. Not scoped to any one project.
type CustomField struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Type  string `json:"type"`
}

// ListCaseFields returns the site's custom field definitions that apply
// to cases (entity=case) — used to decide which of a case's
// CustomFields are text/select (mappable) per design.md D-Q4.
func (c *Client) ListCaseFields(ctx context.Context) ([]CustomField, error) {
	var all []CustomField
	err := c.list(ctx, "/custom_fields", url.Values{"entity": {"case"}}, func(raw json.RawMessage) error {
		var page []CustomField
		if err := json.Unmarshal(raw, &page); err != nil {
			return fmt.Errorf("decoding Qase custom fields: %w", err)
		}
		all = append(all, page...)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}
