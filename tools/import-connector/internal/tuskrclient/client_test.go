package tuskrclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestClientPacesRequestsAtLeastMinIntervalApart(t *testing.T) {
	var mu sync.Mutex
	var timestamps []time.Time
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		timestamps = append(timestamps, time.Now())
		mu.Unlock()
		_, _ = w.Write([]byte(`{"rows":[],"meta":{"total":0,"pages":1}}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "tenant-1", "token-1")
	ctx := context.Background()
	if _, err := c.ListTestSuites(ctx, "proj-1"); err != nil {
		t.Fatalf("ListTestSuites: %v", err)
	}
	if _, err := c.ListTestSuites(ctx, "proj-1"); err != nil {
		t.Fatalf("ListTestSuites: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(timestamps) != 2 {
		t.Fatalf("timestamps = %v, want 2 requests", timestamps)
	}
	gap := timestamps[1].Sub(timestamps[0])
	// A small tolerance below the exact interval avoids flakiness from
	// OS scheduler/timer imprecision around time.Sleep — the pacer only
	// needs to keep requests *close to* minRequestInterval apart, not to
	// the nanosecond.
	const tolerance = 20 * time.Millisecond
	if gap < minRequestInterval-tolerance {
		t.Errorf("gap between requests = %v, want at least ~%v (D-T4 pacer)", gap, minRequestInterval)
	}
}

func TestListTestSuitesDecodesNestedSectionsAndPaginates(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if !strings.HasSuffix(r.URL.Path, "/test-suite") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.URL.Query().Get("page") == "1" || r.URL.Query().Get("page") == "" {
			_, _ = w.Write([]byte(`{
				"rows": [{"id":"s1","name":"Login","sections":[{"id":"sec1","name":"Happy Path"}]}],
				"meta": {"total": 2, "pages": 2}
			}`))
			return
		}
		_, _ = w.Write([]byte(`{
			"rows": [{"id":"s2","name":"Checkout","sections":[]}],
			"meta": {"total": 2, "pages": 2}
		}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "tenant-1", "token-1")
	suites, err := c.ListTestSuites(context.Background(), "proj-1")
	if err != nil {
		t.Fatalf("ListTestSuites: %v", err)
	}
	if len(suites) != 2 {
		t.Fatalf("suites = %+v, want 2 across two pages", suites)
	}
	if suites[0].Name != "Login" || len(suites[0].Sections) != 1 || suites[0].Sections[0].Name != "Happy Path" {
		t.Errorf("suites[0] = %+v", suites[0])
	}
	if calls != 2 {
		t.Fatalf("calls = %d, want 2 (paginated)", calls)
	}
}

func TestListTestCasesDecodesCustomFieldsAndSectionAssociation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/test-case") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{
			"rows": [
				{"id":"c1","name":"Login with valid credentials","suiteId":"s1","sectionId":"sec1",
				 "customFields": {"stepsWithExpectedResults": [{"step":"Open login page","expectedResult":"Page loads"}], "priority": "High"}}
			],
			"meta": {"total": 1, "pages": 1}
		}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "tenant-1", "token-1")
	cases, err := c.ListTestCases(context.Background(), "proj-1")
	if err != nil {
		t.Fatalf("ListTestCases: %v", err)
	}
	if len(cases) != 1 {
		t.Fatalf("cases = %+v, want 1", cases)
	}
	cs := cases[0]
	if cs.Name != "Login with valid credentials" || cs.SuiteID != "s1" || cs.SectionID != "sec1" {
		t.Errorf("case = %+v", cs)
	}
	if cs.CustomFields["priority"] != "High" {
		t.Errorf("CustomFields = %+v, want priority=High", cs.CustomFields)
	}
	raw, ok := cs.CustomFields["stepsWithExpectedResults"].([]any)
	if !ok || len(raw) != 1 {
		t.Errorf("CustomFields[stepsWithExpectedResults] = %+v, want a 1-entry array", cs.CustomFields["stepsWithExpectedResults"])
	}
}

func TestListTestSuitesReturnsClearErrorOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := New(srv.URL, "tenant-1", "bad-token")
	if _, err := c.ListTestSuites(context.Background(), "proj-1"); err == nil {
		t.Fatal("expected an error for a 403 response")
	} else if !strings.Contains(err.Error(), "403") && !strings.Contains(err.Error(), "Forbidden") {
		t.Errorf("err = %v, want it to mention the failed status", err)
	}
}

func TestClientCarriesBearerTokenAndTenantPath(t *testing.T) {
	var gotAuth, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"rows":[],"meta":{"total":0,"pages":1}}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "acme-tenant", "pat-123")
	if _, err := c.ListTestSuites(context.Background(), "proj-1"); err != nil {
		t.Fatalf("ListTestSuites: %v", err)
	}
	if gotAuth != "Bearer pat-123" {
		t.Errorf("Authorization = %q, want Bearer pat-123", gotAuth)
	}
	if !strings.Contains(gotPath, "/api/tenant/acme-tenant/") {
		t.Errorf("path = %q, want it to contain /api/tenant/acme-tenant/", gotPath)
	}
}

func TestNewDefaultsToTuskrLiveHost(t *testing.T) {
	c := New("", "tenant-1", "token-1")
	if !strings.HasPrefix(c.baseURL, "https://api.tuskr.live") {
		t.Errorf("baseURL = %q, want it to default to https://api.tuskr.live", c.baseURL)
	}
}
