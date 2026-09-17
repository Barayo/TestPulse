// Package tuskrclient is a minimal Tuskr (tuskr.app) REST API client —
// just enough to crawl a project's Test Suite/Section/case structure for
// add-tuskr-importer (design.md D-T1/D-T2/D-T3/D-T4/D-T5). Not a
// general-purpose Tuskr SDK: no write endpoints, since this importer
// never writes back to Tuskr.
//
// Verified against Tuskr's own published documentation
// (tuskr.app/kb/latest/api, tuskr.app/kb/latest/admin/concepts/custom-fields)
// — not assumed: a single SaaS deployment (no self-hosted mode, base host
// https://api.tuskr.live) with the tenant id embedded in the URL path
// (/api/tenant/<tenant-id>/...) and a per-user Bearer Personal Access
// Token; GET .../test-suite returns each suite with its Sections nested
// in the same response (a strict two-level Suite -> Section hierarchy,
// no deeper nesting); pagination is 100 rows/page via a `page` query
// param with `meta.total`/`meta.pages` in the response; a documented,
// enforced account-wide rate limit of 10 requests/second exists. Not
// independently confirmed (the docs never show a full expanded response
// body): the exact "suiteId"/"sectionId"/"customFields" JSON key names
// used below for the test-case response — a reasonable, camelCase-
// consistent inference from the documented field-name conventions
// elsewhere on the same API, not a verified wire format; see design.md's
// Open Questions.
package tuskrclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// defaultBaseURL is Tuskr's fixed, single SaaS host (design.md D-T1) —
// never varies per customer, unlike TestRail's own-instance site URL.
const defaultBaseURL = "https://api.tuskr.live"

// minRequestInterval paces every outgoing request at least this far
// apart, keeping a single client instance comfortably under Tuskr's
// documented account-wide 10 requests/second cap (design.md D-T4) —
// proactive pacing, not reactive backoff-on-429.
const minRequestInterval = 110 * time.Millisecond

// pageSize is the page size Tuskr documents for every paginated list
// endpoint (100 rows/page).
const pageSize = 100

type Client struct {
	baseURL  string
	tenantID string
	token    string
	http     *http.Client

	mu       sync.Mutex
	lastCall time.Time
}

// New returns a Client scoped to one Tuskr tenant. baseURL overrides the
// default host (used by tests against an httptest.Server); empty uses
// Tuskr's real, single SaaS host.
func New(baseURL, tenantID, token string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	return &Client{
		baseURL:  strings.TrimSuffix(baseURL, "/"),
		tenantID: tenantID,
		token:    token,
		http:     &http.Client{},
	}
}

// pace blocks until at least minRequestInterval has elapsed since the
// previous request this client made (design.md D-T4) — process-local,
// not coordinated across concurrent clients against the same account.
func (c *Client) pace() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if wait := minRequestInterval - time.Since(c.lastCall); wait > 0 {
		time.Sleep(wait)
	}
	c.lastCall = time.Now()
}

func (c *Client) get(ctx context.Context, resource string, query url.Values, out any) error {
	c.pace()

	path := fmt.Sprintf("/api/tenant/%s/%s", url.PathEscape(c.tenantID), resource)
	reqURL := c.baseURL + path
	if len(query) > 0 {
		reqURL += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return fmt.Errorf("building Tuskr request for %s: %w", resource, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling Tuskr %s: %w", resource, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("tuskr %s returned %s", resource, resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decoding Tuskr %s response: %w", resource, err)
	}
	return nil
}

type pageMeta struct {
	Total int `json:"total"`
	Pages int `json:"pages"`
}

// list fetches every page of a page-paginated Tuskr endpoint, decoding
// each page's "rows" array via decode (which returns how many rows it
// decoded) and stopping once the reported page count has been reached.
func (c *Client) list(ctx context.Context, resource string, query url.Values, decode func(rows json.RawMessage) (int, error)) error {
	page := 1
	for {
		q := url.Values{}
		for k, v := range query {
			q[k] = v
		}
		q.Set("page", strconv.Itoa(page))
		q.Set("pageSize", strconv.Itoa(pageSize))

		var resp struct {
			Rows json.RawMessage `json:"rows"`
			Meta pageMeta        `json:"meta"`
		}
		if err := c.get(ctx, resource, q, &resp); err != nil {
			return err
		}
		count, err := decode(resp.Rows)
		if err != nil {
			return fmt.Errorf("decoding Tuskr %s rows: %w", resource, err)
		}
		if count == 0 || page >= resp.Meta.Pages {
			return nil
		}
		page++
	}
}

// Section is one Section nested within a Tuskr Test Suite.
type Section struct {
	ID   string
	Name string
}

// TestSuite is a Tuskr Test Suite, carrying its Sections directly —
// Tuskr's own API returns them nested in the same response, no separate
// per-suite call needed (design.md D-T2).
type TestSuite struct {
	ID       string
	Name     string
	Sections []Section
}

// ListTestSuites returns every Test Suite (with its nested Sections) in
// a project.
func (c *Client) ListTestSuites(ctx context.Context, projectID string) ([]TestSuite, error) {
	var all []TestSuite
	err := c.list(ctx, "test-suite", url.Values{"project": {projectID}}, func(rows json.RawMessage) (int, error) {
		var page []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Sections []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"sections"`
		}
		if err := json.Unmarshal(rows, &page); err != nil {
			return 0, err
		}
		for _, s := range page {
			suite := TestSuite{ID: s.ID, Name: s.Name}
			for _, sec := range s.Sections {
				suite.Sections = append(suite.Sections, Section{ID: sec.ID, Name: sec.Name})
			}
			all = append(all, suite)
		}
		return len(page), nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}

// Case is a Tuskr test case. CustomFields is the case's own raw value
// map (design.md D-T3/D-T5) — deciding which value is the shape-detected
// steps field, which are mappable strings, and which are droppable is
// internal/importer's job, not this client's.
type Case struct {
	ID           string
	Name         string
	SuiteID      string
	SectionID    string
	CustomFields map[string]any
}

// ListTestCases returns every case within a project, each carrying its
// suite/section association so callers can group them locally instead of
// issuing a call per section (keeping this client's request volume low
// against Tuskr's account-wide rate limit, design.md D-T4).
func (c *Client) ListTestCases(ctx context.Context, projectID string) ([]Case, error) {
	var all []Case
	err := c.list(ctx, "test-case", url.Values{"project": {projectID}}, func(rows json.RawMessage) (int, error) {
		var page []struct {
			ID           string         `json:"id"`
			Name         string         `json:"name"`
			SuiteID      string         `json:"suiteId"`
			SectionID    string         `json:"sectionId"`
			CustomFields map[string]any `json:"customFields"`
		}
		if err := json.Unmarshal(rows, &page); err != nil {
			return 0, err
		}
		for _, cs := range page {
			all = append(all, Case{
				ID:           cs.ID,
				Name:         cs.Name,
				SuiteID:      cs.SuiteID,
				SectionID:    cs.SectionID,
				CustomFields: cs.CustomFields,
			})
		}
		return len(page), nil
	})
	if err != nil {
		return nil, err
	}
	return all, nil
}
