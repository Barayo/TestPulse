// Package junitxml parses JUnit XML test reports (as produced by pytest,
// Maven Surefire, Gradle, and jest-junit) into a flat list of test cases
// ready for import matching (add-execution-import).
package junitxml

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// caseKeyProperty is the <properties><property name="..."> key a report
// carries the matching TestPulse case key under (design.md's "Case-key
// transport" decision).
const (
	caseKeyProperty  = "testpulse_case_key"
	platformProperty = "testpulse_platform"
	versionProperty  = "testpulse_version"
	tagsProperty     = "testpulse_tags"
)

// TestCase is one parsed <testcase> entry.
type TestCase struct {
	// CaseKey is the value of the testpulse_case_key property — the
	// TestPulse case this test is expected to match, not the test's own
	// name or classname.
	CaseKey string
	// Name is the literal name the runner reported, independent of
	// whatever case it matches.
	Name      string
	Verdict   domain.Verdict
	Platform  string
	Version   string
	Tags      []string
	StartTime *time.Time
	EndTime   *time.Time
}

// Report is a parsed JUnit XML report, flattened across every <testsuite>
// it contains — an import creates one run from the whole report, regardless
// of how many suites it's split across.
type Report struct {
	// SuiteName is the first <testsuite>'s name, if present.
	SuiteName string
	Cases     []TestCase
}

type testsuitesXML struct {
	Testsuites []testsuiteXML `xml:"testsuite"`
}

type testsuiteXML struct {
	Name      string        `xml:"name,attr"`
	Timestamp string        `xml:"timestamp,attr"`
	Testcases []testcaseXML `xml:"testcase"`
}

type testcaseXML struct {
	Name       string    `xml:"name,attr"`
	Time       string    `xml:"time,attr"`
	Failure    *struct{} `xml:"failure"`
	Error      *struct{} `xml:"error"`
	Skipped    *struct{} `xml:"skipped"`
	Properties struct {
		Property []struct {
			Name  string `xml:"name,attr"`
			Value string `xml:"value,attr"`
		} `xml:"property"`
	} `xml:"properties"`
}

// Parse parses a JUnit XML report, accepting either a <testsuites> root
// wrapping one or more <testsuite> elements, or a single bare <testsuite>
// root (Maven Surefire's shape).
func Parse(data []byte) (Report, error) {
	root, err := rootElementName(data)
	if err != nil {
		return Report{}, fmt.Errorf("malformed report: %w", err)
	}

	var suites []testsuiteXML
	switch root {
	case "testsuites":
		var doc testsuitesXML
		if err := xml.Unmarshal(data, &doc); err != nil {
			return Report{}, fmt.Errorf("malformed report: %w", err)
		}
		suites = doc.Testsuites
	case "testsuite":
		var ts testsuiteXML
		if err := xml.Unmarshal(data, &ts); err != nil {
			return Report{}, fmt.Errorf("malformed report: %w", err)
		}
		suites = []testsuiteXML{ts}
	default:
		return Report{}, fmt.Errorf("malformed report: unexpected root element <%s>", root)
	}

	report := Report{}
	if len(suites) > 0 {
		report.SuiteName = suites[0].Name
	}
	for _, suite := range suites {
		report.Cases = append(report.Cases, suiteCases(suite)...)
	}
	return report, nil
}

func rootElementName(data []byte) (string, error) {
	dec := xml.NewDecoder(bytes.NewReader(data))
	for {
		tok, err := dec.Token()
		if err != nil {
			return "", err
		}
		if se, ok := tok.(xml.StartElement); ok {
			return se.Name.Local, nil
		}
	}
}

func suiteCases(suite testsuiteXML) []TestCase {
	suiteStart, hasSuiteStart := parseTimestamp(suite.Timestamp)
	offset := time.Duration(0)

	cases := make([]TestCase, 0, len(suite.Testcases))
	for _, tc := range suite.Testcases {
		c := TestCase{
			Name:    tc.Name,
			Verdict: verdictOf(tc),
		}
		for _, p := range tc.Properties.Property {
			switch p.Name {
			case caseKeyProperty:
				c.CaseKey = p.Value
			case platformProperty:
				c.Platform = p.Value
			case versionProperty:
				c.Version = p.Value
			case tagsProperty:
				c.Tags = splitTags(p.Value)
			}
		}

		duration, hasDuration := parseDuration(tc.Time)
		if hasSuiteStart {
			start := suiteStart.Add(offset)
			end := start.Add(duration)
			c.StartTime = &start
			c.EndTime = &end
		}
		if hasDuration {
			offset += duration
		}

		cases = append(cases, c)
	}
	return cases
}

func verdictOf(tc testcaseXML) domain.Verdict {
	switch {
	case tc.Failure != nil:
		return domain.VerdictFailed
	case tc.Error != nil:
		return domain.VerdictBlocked
	case tc.Skipped != nil:
		return domain.VerdictSkipped
	default:
		return domain.VerdictPass
	}
}

func splitTags(value string) []string {
	parts := strings.Split(value, ",")
	tags := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}

func parseTimestamp(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func parseDuration(s string) (time.Duration, bool) {
	if s == "" {
		return 0, false
	}
	seconds, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}
	return time.Duration(seconds * float64(time.Second)), true
}
