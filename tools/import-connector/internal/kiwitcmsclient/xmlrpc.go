// Package kiwitcmsclient is a minimal Kiwi TCMS XML-RPC client — just
// enough to crawl a product's test plan/case structure for
// add-kiwi-tcms-importer (design.md D-K1/D-K2/D-K3/D-K5/D-K6). Not a
// general-purpose Kiwi TCMS SDK, and xmlrpc.go is not a general-purpose
// XML-RPC implementation: it marshals and unmarshals exactly the value
// shapes this importer's four RPC calls (Auth.login, Product.filter,
// TestPlan.filter, TestCase.filter) actually use — string/int/boolean
// scalars, structs, and arrays of structs — deliberately narrower than a
// full XML-RPC library, using only encoding/xml (design.md D-K1: no
// third-party XML-RPC dependency, since the best-known one, kolo/xmlrpc,
// is unmaintained).
package kiwitcmsclient

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

// xmlrpcValue is a decoded XML-RPC value — a small sum type covering
// exactly the shapes this client reads back. Exactly one field is
// meaningfully set for a given value (or Nil is true).
type xmlrpcValue struct {
	Str    *string
	Int    *int
	Bool   *bool
	Struct map[string]xmlrpcValue
	Array  []xmlrpcValue
	Nil    bool
}

// marshalCall writes a complete XML-RPC <methodCall> request for method
// with the given params (each a string, int, bool, or map[string]any for
// a <struct> — the only shapes this importer's RPC calls ever send).
func marshalCall(w io.Writer, method string, params ...any) error {
	var buf bytes.Buffer
	buf.WriteString(`<?xml version="1.0"?><methodCall><methodName>`)
	buf.WriteString(method)
	buf.WriteString(`</methodName><params>`)
	for _, p := range params {
		buf.WriteString("<param>")
		if err := marshalValue(&buf, p); err != nil {
			return err
		}
		buf.WriteString("</param>")
	}
	buf.WriteString("</params></methodCall>")
	_, err := w.Write(buf.Bytes())
	return err
}

func marshalValue(buf *bytes.Buffer, v any) error {
	buf.WriteString("<value>")
	switch val := v.(type) {
	case string:
		buf.WriteString("<string>")
		if err := xml.EscapeText(buf, []byte(val)); err != nil {
			return err
		}
		buf.WriteString("</string>")
	case int:
		buf.WriteString("<int>")
		buf.WriteString(strconv.Itoa(val))
		buf.WriteString("</int>")
	case bool:
		buf.WriteString("<boolean>")
		if val {
			buf.WriteString("1")
		} else {
			buf.WriteString("0")
		}
		buf.WriteString("</boolean>")
	case map[string]any:
		buf.WriteString("<struct>")
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys) // deterministic wire output, easier to test/debug
		for _, k := range keys {
			buf.WriteString("<member><name>")
			if err := xml.EscapeText(buf, []byte(k)); err != nil {
				return err
			}
			buf.WriteString("</name>")
			if err := marshalValue(buf, val[k]); err != nil {
				return err
			}
			buf.WriteString("</member>")
		}
		buf.WriteString("</struct>")
	default:
		return fmt.Errorf("kiwitcmsclient: unsupported XML-RPC param type %T", v)
	}
	buf.WriteString("</value>")
	return nil
}

// unmarshalResponse parses a complete XML-RPC <methodResponse> body,
// returning its single return value, or an error derived from a <fault>
// response (faultString, prefixed with faultCode).
func unmarshalResponse(r io.Reader) (xmlrpcValue, error) {
	dec := xml.NewDecoder(r)
	if err := findStart(dec, "methodResponse"); err != nil {
		return xmlrpcValue{}, err
	}
	for {
		tok, err := dec.Token()
		if err != nil {
			return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: reading methodResponse: %w", err)
		}
		se, ok := tok.(xml.StartElement)
		if !ok {
			if _, ok := tok.(xml.EndElement); ok {
				return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: methodResponse has neither params nor fault")
			}
			continue
		}
		switch se.Name.Local {
		case "params":
			return readParamValue(dec)
		case "fault":
			fv, err := readParamValue(dec)
			if err != nil {
				return xmlrpcValue{}, err
			}
			code := 0
			if c, ok := fv.Struct["faultCode"]; ok && c.Int != nil {
				code = *c.Int
			}
			msg := ""
			if m, ok := fv.Struct["faultString"]; ok && m.Str != nil {
				msg = *m.Str
			}
			return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: XML-RPC fault %d: %s", code, msg)
		default:
			return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: unexpected element %q in methodResponse", se.Name.Local)
		}
	}
}

// readParamValue reads a <params><param><value>...</value></param>...
// block (or, for a fault, the bare <value>...</value> nested directly
// under <fault>) and returns the first value's decoded contents.
func readParamValue(dec *xml.Decoder) (xmlrpcValue, error) {
	if err := findStart(dec, "value"); err != nil {
		return xmlrpcValue{}, err
	}
	return readValue(dec)
}

// findStart advances dec until it sees a StartElement named name.
func findStart(dec *xml.Decoder, name string) error {
	for {
		tok, err := dec.Token()
		if err != nil {
			return fmt.Errorf("kiwitcmsclient: looking for <%s>: %w", name, err)
		}
		if se, ok := tok.(xml.StartElement); ok && se.Name.Local == name {
			return nil
		}
	}
}

// readValue reads the contents of a <value> element — called immediately
// after its opening tag has been consumed — and leaves the decoder
// positioned just past the matching </value>.
func readValue(dec *xml.Decoder) (xmlrpcValue, error) {
	for {
		tok, err := dec.Token()
		if err != nil {
			return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: reading value: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			v, err := readTyped(dec, t)
			if err != nil {
				return xmlrpcValue{}, err
			}
			if err := skipToEnd(dec, "value"); err != nil {
				return xmlrpcValue{}, err
			}
			return v, nil
		case xml.EndElement:
			if t.Name.Local == "value" {
				empty := ""
				return xmlrpcValue{Str: &empty}, nil
			}
		case xml.CharData:
			// XML-RPC permits an implicit string: <value>text</value> with
			// no <string> wrapper. Only significant (non-whitespace) text
			// counts.
			text := strings.TrimSpace(string(t))
			if text != "" {
				if err := skipToEnd(dec, "value"); err != nil {
					return xmlrpcValue{}, err
				}
				return xmlrpcValue{Str: &text}, nil
			}
		}
	}
}

func readTyped(dec *xml.Decoder, t xml.StartElement) (xmlrpcValue, error) {
	switch t.Name.Local {
	case "string":
		s, err := readCharData(dec, "string")
		if err != nil {
			return xmlrpcValue{}, err
		}
		return xmlrpcValue{Str: &s}, nil
	case "int", "i4":
		s, err := readCharData(dec, t.Name.Local)
		if err != nil {
			return xmlrpcValue{}, err
		}
		n, err := strconv.Atoi(strings.TrimSpace(s))
		if err != nil {
			return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: invalid %s value %q: %w", t.Name.Local, s, err)
		}
		return xmlrpcValue{Int: &n}, nil
	case "boolean":
		s, err := readCharData(dec, "boolean")
		if err != nil {
			return xmlrpcValue{}, err
		}
		b := strings.TrimSpace(s) == "1"
		return xmlrpcValue{Bool: &b}, nil
	case "nil":
		if err := skipToEnd(dec, "nil"); err != nil {
			return xmlrpcValue{}, err
		}
		return xmlrpcValue{Nil: true}, nil
	case "struct":
		return readStruct(dec)
	case "array":
		return readArray(dec)
	default:
		return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: unsupported XML-RPC value type %q", t.Name.Local)
	}
}

// readCharData reads text content until the matching end tag for
// elemName, returning the accumulated text.
func readCharData(dec *xml.Decoder, elemName string) (string, error) {
	var sb strings.Builder
	for {
		tok, err := dec.Token()
		if err != nil {
			return "", fmt.Errorf("kiwitcmsclient: reading <%s>: %w", elemName, err)
		}
		switch t := tok.(type) {
		case xml.CharData:
			sb.Write(t)
		case xml.EndElement:
			if t.Name.Local == elemName {
				return sb.String(), nil
			}
		}
	}
}

// skipToEnd discards tokens until the matching end tag for elemName,
// tolerating nested elements of the same name.
func skipToEnd(dec *xml.Decoder, elemName string) error {
	depth := 0
	for {
		tok, err := dec.Token()
		if err != nil {
			return fmt.Errorf("kiwitcmsclient: skipping to </%s>: %w", elemName, err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == elemName {
				depth++
			}
		case xml.EndElement:
			if t.Name.Local == elemName {
				if depth == 0 {
					return nil
				}
				depth--
			}
		}
	}
}

func readStruct(dec *xml.Decoder) (xmlrpcValue, error) {
	m := map[string]xmlrpcValue{}
	for {
		tok, err := dec.Token()
		if err != nil {
			return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: reading struct: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "member" {
				name, val, err := readMember(dec)
				if err != nil {
					return xmlrpcValue{}, err
				}
				m[name] = val
			}
		case xml.EndElement:
			if t.Name.Local == "struct" {
				return xmlrpcValue{Struct: m}, nil
			}
		}
	}
}

func readMember(dec *xml.Decoder) (string, xmlrpcValue, error) {
	var name string
	var val xmlrpcValue
	for {
		tok, err := dec.Token()
		if err != nil {
			return "", xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: reading member: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "name":
				n, err := readCharData(dec, "name")
				if err != nil {
					return "", xmlrpcValue{}, err
				}
				name = n
			case "value":
				v, err := readValue(dec)
				if err != nil {
					return "", xmlrpcValue{}, err
				}
				val = v
			}
		case xml.EndElement:
			if t.Name.Local == "member" {
				return name, val, nil
			}
		}
	}
}

func readArray(dec *xml.Decoder) (xmlrpcValue, error) {
	var items []xmlrpcValue
	for {
		tok, err := dec.Token()
		if err != nil {
			return xmlrpcValue{}, fmt.Errorf("kiwitcmsclient: reading array: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "value" {
				v, err := readValue(dec)
				if err != nil {
					return xmlrpcValue{}, err
				}
				items = append(items, v)
			}
		case xml.EndElement:
			if t.Name.Local == "array" {
				return xmlrpcValue{Array: items}, nil
			}
		}
	}
}
