package kiwitcmsclient

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"strings"
)

type Client struct {
	baseURL string
	http    *http.Client
}

// New logs into a Kiwi TCMS instance via Auth.login and returns a Client
// whose *http.Client carries the resulting session cookie on every later
// call (design.md D-K2 — Kiwi TCMS authenticates through Django's own
// session auth, not a bearer token or API key). A login failure is
// returned here, wrapped distinctly from a later data-fetch error, so a
// job failure message can tell "bad site URL/credentials" apart from "a
// fetch failed partway through."
func New(ctx context.Context, siteURL, username, password string) (*Client, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, fmt.Errorf("kiwitcmsclient: creating cookie jar: %w", err)
	}
	c := &Client{
		baseURL: strings.TrimSuffix(siteURL, "/") + "/xml-rpc/",
		http:    &http.Client{Jar: jar},
	}
	if _, err := c.call(ctx, "Auth.login", username, password); err != nil {
		return nil, fmt.Errorf("kiwitcmsclient: login failed: %w", err)
	}
	return c, nil
}

// call marshals an XML-RPC request for method, posts it, and unmarshals
// the response — the shared core every typed method below builds on.
func (c *Client) call(ctx context.Context, method string, params ...any) (xmlrpcValue, error) {
	var body bytes.Buffer
	if err := marshalCall(&body, method, params...); err != nil {
		return xmlrpcValue{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, &body)
	if err != nil {
		return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: building request for %s: %w", method, err)
	}
	req.Header.Set("Content-Type", "text/xml")

	resp, err := c.http.Do(req)
	if err != nil {
		return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: calling %s: %w", method, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: %s returned %s", method, resp.Status)
	}
	v, err := unmarshalResponse(resp.Body)
	if err != nil {
		return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: %s: %w", method, err)
	}
	return v, nil
}

// Product is a Kiwi TCMS product — the unit of import (design.md D-K3),
// analogous to a TestRail/Qase project or a Zephyr Scale project.
type Product struct {
	ID   int
	Name string
}

// FindProduct looks up a product by its exact name.
func (c *Client) FindProduct(ctx context.Context, name string) (Product, error) {
	v, err := c.call(ctx, "Product.filter", map[string]any{"name": name})
	if err != nil {
		return Product{}, err
	}
	if len(v.Array) == 0 {
		return Product{}, fmt.Errorf("kiwitcmsclient: no product named %q", name)
	}
	return productFromValue(v.Array[0])
}

func productFromValue(v xmlrpcValue) (Product, error) {
	id, ok := v.Struct["id"]
	if !ok || id.Int == nil {
		return Product{}, fmt.Errorf("kiwitcmsclient: product response missing id")
	}
	p := Product{ID: *id.Int}
	if n, ok := v.Struct["name"]; ok && n.Str != nil {
		p.Name = *n.Str
	}
	return p, nil
}

// TestPlan is a Kiwi TCMS test plan. ParentID is nil for a root plan —
// the mapping target for a nested TestPulse Folder tree (design.md D-K3).
type TestPlan struct {
	ID       int
	Name     string
	ParentID *int
}

// ListTestPlans returns every test plan belonging to a product, preserving
// each plan's own parent link (Kiwi TCMS's real hierarchy, confirmed via
// its TestPlan.tree() RPC method and parent field).
func (c *Client) ListTestPlans(ctx context.Context, productID int) ([]TestPlan, error) {
	v, err := c.call(ctx, "TestPlan.filter", map[string]any{"product": productID})
	if err != nil {
		return nil, err
	}
	plans := make([]TestPlan, 0, len(v.Array))
	for _, item := range v.Array {
		p, err := testPlanFromValue(item)
		if err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, nil
}

func testPlanFromValue(v xmlrpcValue) (TestPlan, error) {
	id, ok := v.Struct["id"]
	if !ok || id.Int == nil {
		return TestPlan{}, fmt.Errorf("kiwitcmsclient: test plan response missing id")
	}
	p := TestPlan{ID: *id.Int}
	if n, ok := v.Struct["name"]; ok && n.Str != nil {
		p.Name = *n.Str
	}
	if pid, ok := v.Struct["parent"]; ok && !pid.Nil && pid.Int != nil {
		p.ParentID = pid.Int
	}
	return p, nil
}

// TestCase is a Kiwi TCMS test case. Text is its sole freeform procedure
// field (Kiwi TCMS has no structured step concept — design.md D-K5); its
// properties are fetched separately via ListProperties (design.md D-K6),
// mirroring how zephyrscaleclient fetches a case's steps/script separately
// from the case itself.
type TestCase struct {
	ID      int
	Summary string
	Text    string
}

// ListTestCases returns every case linked to a test plan.
func (c *Client) ListTestCases(ctx context.Context, planID int) ([]TestCase, error) {
	v, err := c.call(ctx, "TestCase.filter", map[string]any{"plan": planID})
	if err != nil {
		return nil, err
	}
	cases := make([]TestCase, 0, len(v.Array))
	for _, item := range v.Array {
		tc, err := testCaseFromValue(item)
		if err != nil {
			return nil, err
		}
		cases = append(cases, tc)
	}
	return cases, nil
}

func testCaseFromValue(v xmlrpcValue) (TestCase, error) {
	id, ok := v.Struct["id"]
	if !ok || id.Int == nil {
		return TestCase{}, fmt.Errorf("kiwitcmsclient: test case response missing id")
	}
	tc := TestCase{ID: *id.Int}
	if s, ok := v.Struct["summary"]; ok && s.Str != nil {
		tc.Summary = *s.Str
	}
	if t, ok := v.Struct["text"]; ok && t.Str != nil {
		tc.Text = *t.Str
	}
	return tc, nil
}

// Property is one of a test case's arbitrary key-value properties
// (design.md D-K6 — Kiwi TCMS has no typed custom-field concept, just
// free-form name/value pairs per case).
type Property struct {
	Name  string
	Value string
}

// ListProperties returns every property set on a test case.
func (c *Client) ListProperties(ctx context.Context, caseID int) ([]Property, error) {
	v, err := c.call(ctx, "TestCase.properties", map[string]any{"case": caseID})
	if err != nil {
		return nil, err
	}
	props := make([]Property, 0, len(v.Array))
	for _, item := range v.Array {
		p, err := propertyFromValue(item)
		if err != nil {
			return nil, err
		}
		props = append(props, p)
	}
	return props, nil
}

func propertyFromValue(v xmlrpcValue) (Property, error) {
	var p Property
	if n, ok := v.Struct["name"]; ok && n.Str != nil {
		p.Name = *n.Str
	} else {
		return Property{}, fmt.Errorf("kiwitcmsclient: property response missing name")
	}
	if val, ok := v.Struct["value"]; ok && val.Str != nil {
		p.Value = *val.Str
	}
	return p, nil
}
