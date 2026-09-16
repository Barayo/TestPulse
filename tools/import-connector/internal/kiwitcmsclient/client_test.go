package kiwitcmsclient

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// rpcHandler decodes an incoming <methodCall>'s methodName so test servers
// can branch on it without hand-parsing the whole request body themselves.
func methodNameOf(t *testing.T, r *http.Request) string {
	t.Helper()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatalf("reading request body: %v", err)
	}
	var call struct {
		MethodName string `xml:"methodName"`
	}
	if err := xml.Unmarshal(body, &call); err != nil {
		t.Fatalf("decoding methodCall: %v", err)
	}
	return call.MethodName
}

func writeResponse(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "text/xml")
	_, _ = fmt.Fprint(w, `<?xml version="1.0"?><methodResponse><params><param><value>`+body+`</value></param></params></methodResponse>`)
}

func TestNewLogsInAndCarriesSessionCookieOnLaterCalls(t *testing.T) {
	var sawCookieOnSecondCall bool
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		switch methodNameOf(t, r) {
		case "Auth.login":
			http.SetCookie(w, &http.Cookie{Name: "sessionid", Value: "sess-abc123"})
			writeResponse(w, "<string>sess-abc123</string>")
		case "Product.filter":
			if _, err := r.Cookie("sessionid"); err == nil {
				sawCookieOnSecondCall = true
			}
			writeResponse(w, `<array><data></data></array>`)
		default:
			t.Fatalf("unexpected method: %s", methodNameOf(t, r))
		}
	}))
	defer srv.Close()

	c, err := New(context.Background(), srv.URL, "admin", "s3cr3t")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if calls != 1 {
		t.Fatalf("calls = %d, want 1 (just Auth.login during New)", calls)
	}

	if _, err := c.FindProduct(context.Background(), "Acme"); err == nil {
		t.Fatal("expected an error for a product with no matches")
	}
	if !sawCookieOnSecondCall {
		t.Error("the sessionid cookie from Auth.login was not carried on the next RPC call")
	}
}

func TestNewReturnsAClearErrorWhenLoginFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/xml")
		_, _ = fmt.Fprint(w, `<?xml version="1.0"?><methodResponse><fault><value><struct>`+
			`<member><name>faultCode</name><value><int>1</int></value></member>`+
			`<member><name>faultString</name><value><string>Please enter a correct username and password.</string></value></member>`+
			`</struct></value></fault></methodResponse>`)
	}))
	defer srv.Close()

	_, err := New(context.Background(), srv.URL, "admin", "wrong-password")
	if err == nil {
		t.Fatal("expected an error for a failed login")
	}
	if !strings.Contains(err.Error(), "login") {
		t.Errorf("err = %v, want it to clearly identify this as a login failure", err)
	}
}

func testClient(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	mux := http.NewServeMux()
	loginThenHandler := func(w http.ResponseWriter, r *http.Request) {
		if methodNameOf(t, r) == "Auth.login" {
			writeResponse(w, "<string>sess-abc123</string>")
			return
		}
		handler(w, r)
	}
	mux.HandleFunc("/", loginThenHandler)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	c, err := New(context.Background(), srv.URL, "admin", "s3cr3t")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c, srv
}

func TestFindProductReturnsMatch(t *testing.T) {
	// re-read the body per call since methodNameOf consumes it once.
	var callCount int
	c, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		callCount++
		writeResponse(w, `<array><data><value><struct>`+
			`<member><name>id</name><value><int>61</int></value></member>`+
			`<member><name>name</name><value><string>Acme Web</string></value></member>`+
			`</struct></value></data></array>`)
	})

	p, err := c.FindProduct(context.Background(), "Acme Web")
	if err != nil {
		t.Fatalf("FindProduct: %v", err)
	}
	if p.ID != 61 || p.Name != "Acme Web" {
		t.Fatalf("product = %+v, want {61 Acme Web}", p)
	}
	if callCount != 1 {
		t.Errorf("calls = %d, want 1", callCount)
	}
}

func TestListTestPlansPreservesParent(t *testing.T) {
	c, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		writeResponse(w, `<array><data>`+
			`<value><struct><member><name>id</name><value><int>1</int></value></member>`+
			`<member><name>name</name><value><string>Master</string></value></member>`+
			`<member><name>parent</name><value><nil/></value></member></struct></value>`+
			`<value><struct><member><name>id</name><value><int>2</int></value></member>`+
			`<member><name>name</name><value><string>Login</string></value></member>`+
			`<member><name>parent</name><value><int>1</int></value></member></struct></value>`+
			`</data></array>`)
	})

	plans, err := c.ListTestPlans(context.Background(), 61)
	if err != nil {
		t.Fatalf("ListTestPlans: %v", err)
	}
	if len(plans) != 2 || plans[0].Name != "Master" || plans[1].ID != 2 {
		t.Fatalf("plans = %+v, want [Master, Login]", plans)
	}
	if plans[0].ParentID != nil {
		t.Errorf("root plan ParentID = %v, want nil", plans[0].ParentID)
	}
	if plans[1].ParentID == nil || *plans[1].ParentID != 1 {
		t.Errorf("nested plan ParentID = %v, want 1", plans[1].ParentID)
	}
}

func TestListTestCasesCapturesTextAndSummary(t *testing.T) {
	c, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		writeResponse(w, `<array><data><value><struct>`+
			`<member><name>id</name><value><int>500</int></value></member>`+
			`<member><name>summary</name><value><string>Login with valid credentials</string></value></member>`+
			`<member><name>text</name><value><string>Enter username and password, submit.</string></value></member>`+
			`</struct></value></data></array>`)
	})

	cases, err := c.ListTestCases(context.Background(), 2)
	if err != nil {
		t.Fatalf("ListTestCases: %v", err)
	}
	if len(cases) != 1 {
		t.Fatalf("cases = %d, want 1", len(cases))
	}
	got := cases[0]
	if got.ID != 500 || got.Summary != "Login with valid credentials" || got.Text != "Enter username and password, submit." {
		t.Fatalf("case = %+v, unexpected fields", got)
	}
}

func TestListPropertiesReturnsNameValuePairs(t *testing.T) {
	c, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		writeResponse(w, `<array><data>`+
			`<value><struct><member><name>name</name><value><string>Automation</string></value></member>`+
			`<member><name>value</name><value><string>Manual</string></value></member></struct></value>`+
			`</data></array>`)
	})
	props, err := c.ListProperties(context.Background(), 500)
	if err != nil {
		t.Fatalf("ListProperties: %v", err)
	}
	if len(props) != 1 || props[0].Name != "Automation" || props[0].Value != "Manual" {
		t.Fatalf("props = %+v, want [{Automation Manual}]", props)
	}
}

func TestErrorResponseSurfacesFault(t *testing.T) {
	c, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/xml")
		_, _ = fmt.Fprint(w, `<?xml version="1.0"?><methodResponse><fault><value><struct>`+
			`<member><name>faultCode</name><value><int>403</int></value></member>`+
			`<member><name>faultString</name><value><string>Permission denied</string></value></member>`+
			`</struct></value></fault></methodResponse>`)
	})
	if _, err := c.FindProduct(context.Background(), "Acme"); err == nil {
		t.Fatal("expected an error for a fault response")
	}
}
