// Package testrailclient is a minimal TestRail v2 REST API client — just
// enough to crawl a project's suite/section/case structure for
// add-testrail-importer (design.md D6/D7). Not a general-purpose TestRail
// SDK: no write endpoints, since this importer never writes back to
// TestRail.
//
// TestRail's v2 API encodes the endpoint inside the query string itself
// (e.g. GET /index.php?/api/v2/get_suites/1) rather than the URL path —
// an API design choice from TestRail's own docs, not a client convention
// invented here. Authenticates via HTTP Basic (account email + API key).
package testrailclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type Client struct {
	baseURL string
	email   string
	apiKey  string
	http    *http.Client
}

func New(baseURL, email, apiKey string) *Client {
	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		email:   email,
		apiKey:  apiKey,
		http:    &http.Client{},
	}
}

type Suite struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type Section struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	ParentID *int   `json:"parent_id"`
}

type Step struct {
	Content  string `json:"content"`
	Expected string `json:"expected"`
}

// Case is a TestRail test case. CustomFields carries every "custom_*"
// response key that isn't already mapped to Steps, as raw string values —
// deciding which of those are text/select (mappable) versus dropped is
// internal/importer's job (design.md D7), not this client's.
type Case struct {
	ID           int
	SectionID    int
	Title        string
	Steps        []Step
	CustomFields map[string]string
}

// CaseField describes one of a TestRail site's custom case fields —
// site-wide metadata, not scoped to any one project/suite.
type CaseField struct {
	SystemName string `json:"system_name"`
	Label      string `json:"label"`
	TypeID     int    `json:"type_id"`
}

func (c *Client) get(ctx context.Context, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/index.php?"+endpoint, nil)
	if err != nil {
		return fmt.Errorf("building TestRail request for %s: %w", endpoint, err)
	}
	req.SetBasicAuth(c.email, c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling TestRail %s: %w", endpoint, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("TestRail %s returned %s", endpoint, resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decoding TestRail %s response: %w", endpoint, err)
	}
	return nil
}

// ListSuites returns every suite in a project — a TestRail suite is its
// own independent case-authoring repository with its own section tree
// (design.md D6), never to be conflated with TestPulse's own Suite
// construct. Not paginated in TestRail's own API.
func (c *Client) ListSuites(ctx context.Context, projectID int) ([]Suite, error) {
	var suites []Suite
	if err := c.get(ctx, fmt.Sprintf("/api/v2/get_suites/%d", projectID), &suites); err != nil {
		return nil, err
	}
	return suites, nil
}

type sectionsPage struct {
	Offset int `json:"offset"`
	Limit  int `json:"limit"`
	Links  struct {
		Next *string `json:"next"`
	} `json:"_links"`
	Sections []Section `json:"sections"`
}

// ListSections returns every section within a suite, preserving TestRail's
// section hierarchy via ParentID — the mapping target for a nested
// TestPulse Folder tree (design.md D6). Paginates until TestRail reports
// no further page.
func (c *Client) ListSections(ctx context.Context, projectID, suiteID int) ([]Section, error) {
	var all []Section
	offset := 0
	for {
		var page sectionsPage
		endpoint := fmt.Sprintf("/api/v2/get_sections/%d&suite_id=%d&offset=%d", projectID, suiteID, offset)
		if err := c.get(ctx, endpoint, &page); err != nil {
			return nil, err
		}
		all = append(all, page.Sections...)
		if page.Links.Next == nil {
			break
		}
		offset = page.Offset + page.Limit
	}
	return all, nil
}

type casesPage struct {
	Offset int `json:"offset"`
	Limit  int `json:"limit"`
	Links  struct {
		Next *string `json:"next"`
	} `json:"_links"`
	Cases []json.RawMessage `json:"cases"`
}

// ListCases returns every case within a suite, with steps parsed into
// Step and every other "custom_*" field captured raw in CustomFields.
// Paginates until TestRail reports no further page.
func (c *Client) ListCases(ctx context.Context, projectID, suiteID int) ([]Case, error) {
	var all []Case
	offset := 0
	for {
		var page casesPage
		endpoint := fmt.Sprintf("/api/v2/get_cases/%d&suite_id=%d&offset=%d", projectID, suiteID, offset)
		if err := c.get(ctx, endpoint, &page); err != nil {
			return nil, err
		}
		for _, raw := range page.Cases {
			parsed, err := parseCase(raw)
			if err != nil {
				return nil, err
			}
			all = append(all, parsed)
		}
		if page.Links.Next == nil {
			break
		}
		offset = page.Offset + page.Limit
	}
	return all, nil
}

func parseCase(raw json.RawMessage) (Case, error) {
	var known struct {
		ID             int    `json:"id"`
		SectionID      int    `json:"section_id"`
		Title          string `json:"title"`
		StepsSeparated []Step `json:"custom_steps_separated"`
	}
	if err := json.Unmarshal(raw, &known); err != nil {
		return Case{}, fmt.Errorf("decoding TestRail case: %w", err)
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return Case{}, fmt.Errorf("decoding TestRail case fields: %w", err)
	}
	custom := map[string]string{}
	for key, value := range fields {
		if !strings.HasPrefix(key, "custom_") || key == "custom_steps_separated" || key == "custom_steps" {
			continue
		}
		// Every custom_* value is captured, stringified regardless of its
		// JSON type (a Dropdown field's raw value is a numeric option id,
		// not text) — spec.md's "never silently dropped" guarantee has to
		// hold at this layer too, not just in internal/importer's mapping
		// decision, or a numeric-coded field would vanish before ever
		// reaching the drop-vs-map choice (and the report) at all.
		if s, ok := stringifyCustomFieldValue(value); ok {
			custom[key] = s
		}
	}

	return Case{
		ID:           known.ID,
		SectionID:    known.SectionID,
		Title:        known.Title,
		Steps:        known.StepsSeparated,
		CustomFields: custom,
	}, nil
}

// ListCaseFields returns the site's custom case field definitions — used
// to decide which of a Case's CustomFields are text/select (mappable) per
// design.md D7. Site-wide, not scoped to a project/suite.
func (c *Client) ListCaseFields(ctx context.Context) ([]CaseField, error) {
	var fields []CaseField
	if err := c.get(ctx, "/api/v2/get_case_fields", &fields); err != nil {
		return nil, err
	}
	return fields, nil
}

// stringifyCustomFieldValue renders any JSON scalar/array/object as text,
// using json.Number so large integer ids (a Dropdown field's raw value)
// never pick up float64 rounding artifacts. ok is false only for JSON
// null, TestRail's way of saying "no value set" — indistinguishable from
// the field being absent, so nothing is captured for it either.
func stringifyCustomFieldValue(raw json.RawMessage) (string, bool) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return "", false
	}
	switch t := v.(type) {
	case nil:
		return "", false
	case string:
		return t, true
	case json.Number:
		return t.String(), true
	case bool:
		return strconv.FormatBool(t), true
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return "", false
		}
		return string(b), true
	}
}
