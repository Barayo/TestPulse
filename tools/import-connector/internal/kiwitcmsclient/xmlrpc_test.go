package kiwitcmsclient

import (
	"strings"
	"testing"
)

func TestMarshalCallWithStringParams(t *testing.T) {
	var buf strings.Builder
	if err := marshalCall(&buf, "Auth.login", "admin", "s3cr3t"); err != nil {
		t.Fatalf("marshalCall: %v", err)
	}
	got := buf.String()
	want := `<?xml version="1.0"?><methodCall><methodName>Auth.login</methodName><params>` +
		`<param><value><string>admin</string></value></param>` +
		`<param><value><string>s3cr3t</string></value></param>` +
		`</params></methodCall>`
	if got != want {
		t.Fatalf("marshalCall =\n%s\nwant\n%s", got, want)
	}
}

func TestMarshalCallWithStructParam(t *testing.T) {
	var buf strings.Builder
	// map iteration order isn't guaranteed, so use a single-key struct to
	// keep this test deterministic.
	if err := marshalCall(&buf, "Product.filter", map[string]any{"name": "Acme"}); err != nil {
		t.Fatalf("marshalCall: %v", err)
	}
	got := buf.String()
	want := `<?xml version="1.0"?><methodCall><methodName>Product.filter</methodName><params>` +
		`<param><value><struct><member><name>name</name><value><string>Acme</string></value></member></struct></value></param>` +
		`</params></methodCall>`
	if got != want {
		t.Fatalf("marshalCall =\n%s\nwant\n%s", got, want)
	}
}

func TestMarshalCallEscapesSpecialCharacters(t *testing.T) {
	var buf strings.Builder
	if err := marshalCall(&buf, "Auth.login", "<user>&\"'"); err != nil {
		t.Fatalf("marshalCall: %v", err)
	}
	got := buf.String()
	if strings.Contains(got, "<user>") {
		t.Fatalf("marshalCall did not escape special characters: %s", got)
	}
	if !strings.Contains(got, "&lt;user&gt;&amp;") {
		t.Fatalf("marshalCall = %s, want escaped angle brackets and ampersand", got)
	}
}

func TestUnmarshalResponseStringScalar(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><string>abc123</string></value></param></params></methodResponse>`
	v, err := unmarshalResponse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("unmarshalResponse: %v", err)
	}
	if v.Str == nil || *v.Str != "abc123" {
		t.Fatalf("v = %+v, want Str=abc123", v)
	}
}

func TestUnmarshalResponseStruct(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><struct>` +
		`<member><name>id</name><value><int>1</int></value></member>` +
		`<member><name>name</name><value><string>Master</string></value></member>` +
		`<member><name>parent</name><value><nil/></value></member>` +
		`</struct></value></param></params></methodResponse>`
	v, err := unmarshalResponse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("unmarshalResponse: %v", err)
	}
	if v.Struct == nil {
		t.Fatalf("v.Struct is nil, want a struct")
	}
	if id := v.Struct["id"]; id.Int == nil || *id.Int != 1 {
		t.Errorf("id = %+v, want Int=1", id)
	}
	if name := v.Struct["name"]; name.Str == nil || *name.Str != "Master" {
		t.Errorf("name = %+v, want Str=Master", name)
	}
	if parent := v.Struct["parent"]; !parent.Nil {
		t.Errorf("parent = %+v, want Nil=true", parent)
	}
}

func TestUnmarshalResponseArrayOfStructs(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><array><data>` +
		`<value><struct><member><name>id</name><value><int>1</int></value></member></struct></value>` +
		`<value><struct><member><name>id</name><value><int>2</int></value></member></struct></value>` +
		`</data></array></value></param></params></methodResponse>`
	v, err := unmarshalResponse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("unmarshalResponse: %v", err)
	}
	if len(v.Array) != 2 {
		t.Fatalf("v.Array = %+v, want 2 items", v.Array)
	}
	if id := v.Array[0].Struct["id"]; id.Int == nil || *id.Int != 1 {
		t.Errorf("Array[0].id = %+v, want 1", id)
	}
	if id := v.Array[1].Struct["id"]; id.Int == nil || *id.Int != 2 {
		t.Errorf("Array[1].id = %+v, want 2", id)
	}
}

func TestUnmarshalResponseFaultBecomesError(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><fault><value><struct>` +
		`<member><name>faultCode</name><value><int>1</int></value></member>` +
		`<member><name>faultString</name><value><string>Authentication failed</string></value></member>` +
		`</struct></value></fault></methodResponse>`
	_, err := unmarshalResponse(strings.NewReader(body))
	if err == nil {
		t.Fatal("expected an error for a fault response")
	}
	if !strings.Contains(err.Error(), "Authentication failed") {
		t.Errorf("err = %v, want it to include the fault string", err)
	}
}

func TestUnmarshalResponseBooleanValue(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><boolean>1</boolean></value></param></params></methodResponse>`
	v, err := unmarshalResponse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("unmarshalResponse: %v", err)
	}
	if v.Bool == nil || !*v.Bool {
		t.Fatalf("v = %+v, want Bool=true", v)
	}
}

func TestUnmarshalResponseI4Value(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><i4>42</i4></value></param></params></methodResponse>`
	v, err := unmarshalResponse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("unmarshalResponse: %v", err)
	}
	if v.Int == nil || *v.Int != 42 {
		t.Fatalf("v = %+v, want Int=42", v)
	}
}

func TestUnmarshalResponseImplicitStringValue(t *testing.T) {
	// XML-RPC permits a bare <value>text</value> with no <string> wrapper.
	body := `<?xml version="1.0"?><methodResponse><params><param><value>plain text</value></param></params></methodResponse>`
	v, err := unmarshalResponse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("unmarshalResponse: %v", err)
	}
	if v.Str == nil || *v.Str != "plain text" {
		t.Fatalf("v = %+v, want Str=\"plain text\"", v)
	}
}

func TestUnmarshalResponseEmptyValueIsEmptyString(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value></value></param></params></methodResponse>`
	v, err := unmarshalResponse(strings.NewReader(body))
	if err != nil {
		t.Fatalf("unmarshalResponse: %v", err)
	}
	if v.Str == nil || *v.Str != "" {
		t.Fatalf("v = %+v, want Str=\"\"", v)
	}
}

func TestUnmarshalResponseUnknownTypeIsAnError(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><base64>abc</base64></value></param></params></methodResponse>`
	if _, err := unmarshalResponse(strings.NewReader(body)); err == nil {
		t.Fatal("expected an error for an unsupported XML-RPC value type")
	}
}

func TestUnmarshalResponseEmptyMethodResponseIsAnError(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse></methodResponse>`
	if _, err := unmarshalResponse(strings.NewReader(body)); err == nil {
		t.Fatal("expected an error for a methodResponse with neither params nor fault")
	}
}

func TestUnmarshalResponseUnexpectedElementIsAnError(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><bogus/></methodResponse>`
	if _, err := unmarshalResponse(strings.NewReader(body)); err == nil {
		t.Fatal("expected an error for an unexpected element inside methodResponse")
	}
}

func TestUnmarshalResponseTruncatedBodyIsAnError(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><string>oops`
	if _, err := unmarshalResponse(strings.NewReader(body)); err == nil {
		t.Fatal("expected an error for a truncated response body")
	}
}

func TestUnmarshalResponseInvalidIntIsAnError(t *testing.T) {
	body := `<?xml version="1.0"?><methodResponse><params><param><value><int>not-a-number</int></value></param></params></methodResponse>`
	if _, err := unmarshalResponse(strings.NewReader(body)); err == nil {
		t.Fatal("expected an error for a non-numeric <int> value")
	}
}

func TestMarshalCallRejectsUnsupportedParamType(t *testing.T) {
	var buf strings.Builder
	if err := marshalCall(&buf, "Auth.login", 3.14); err == nil {
		t.Fatal("expected an error for an unsupported param type (float64)")
	}
}
