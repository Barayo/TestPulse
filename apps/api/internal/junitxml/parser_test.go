package junitxml_test

import (
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/junitxml"
)

func TestParseExtractsCaseKeyAndExecutionMetadataFromProperties(t *testing.T) {
	xml := `<?xml version="1.0"?>
<testsuites>
  <testsuite name="pytest" timestamp="2026-07-22T10:00:00">
    <testcase classname="tests.test_login" name="tests/test_login.py::test_login" time="0.5">
      <properties>
        <property name="testpulse_case_key" value="LOGIN-42"/>
        <property name="testpulse_platform" value="linux"/>
        <property name="testpulse_version" value="1.2.3"/>
        <property name="testpulse_tags" value="smoke,regression"/>
      </properties>
    </testcase>
  </testsuite>
</testsuites>`

	report, err := junitxml.Parse([]byte(xml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(report.Cases) != 1 {
		t.Fatalf("Cases = %d, want 1", len(report.Cases))
	}
	c := report.Cases[0]
	if c.CaseKey != "LOGIN-42" {
		t.Errorf("CaseKey = %q, want LOGIN-42", c.CaseKey)
	}
	if c.Name != "tests/test_login.py::test_login" {
		t.Errorf("Name = %q, want the runner's literal name", c.Name)
	}
	if c.Platform != "linux" || c.Version != "1.2.3" {
		t.Errorf("Platform/Version = %q/%q, want linux/1.2.3", c.Platform, c.Version)
	}
	if len(c.Tags) != 2 || c.Tags[0] != "smoke" || c.Tags[1] != "regression" {
		t.Errorf("Tags = %v, want [smoke regression]", c.Tags)
	}
}

func TestParseMapsOutcomesToVerdicts(t *testing.T) {
	xml := `<testsuites>
  <testsuite name="pytest">
    <testcase name="test_pass"><properties><property name="testpulse_case_key" value="P-1"/></properties></testcase>
    <testcase name="test_fail"><properties><property name="testpulse_case_key" value="P-2"/></properties><failure message="assert False">trace</failure></testcase>
    <testcase name="test_error"><properties><property name="testpulse_case_key" value="P-3"/></properties><error message="boom">trace</error></testcase>
    <testcase name="test_skip"><properties><property name="testpulse_case_key" value="P-4"/></properties><skipped message="not ready"/></testcase>
  </testsuite>
</testsuites>`

	report, err := junitxml.Parse([]byte(xml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	want := map[string]domain.Verdict{
		"P-1": domain.VerdictPass,
		"P-2": domain.VerdictFailed,
		"P-3": domain.VerdictBlocked,
		"P-4": domain.VerdictSkipped,
	}
	if len(report.Cases) != 4 {
		t.Fatalf("Cases = %d, want 4", len(report.Cases))
	}
	for _, c := range report.Cases {
		if c.Verdict != want[c.CaseKey] {
			t.Errorf("Verdict for %s = %q, want %q", c.CaseKey, c.Verdict, want[c.CaseKey])
		}
	}
}

func TestParseExtractsSuiteName(t *testing.T) {
	xml := `<testsuites><testsuite name="pytest"><testcase name="t"/></testsuite></testsuites>`
	report, err := junitxml.Parse([]byte(xml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if report.SuiteName != "pytest" {
		t.Errorf("SuiteName = %q, want pytest", report.SuiteName)
	}
}

func TestParseDerivesStartEndTimeWhenTimestampPresent(t *testing.T) {
	xml := `<testsuites>
  <testsuite name="pytest" timestamp="2026-07-22T10:00:00">
    <testcase name="a" time="1.0"><properties><property name="testpulse_case_key" value="A-1"/></properties></testcase>
    <testcase name="b" time="2.0"><properties><property name="testpulse_case_key" value="A-2"/></properties></testcase>
  </testsuite>
</testsuites>`

	report, err := junitxml.Parse([]byte(xml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	base := time.Date(2026, 7, 22, 10, 0, 0, 0, time.UTC)
	a, b := report.Cases[0], report.Cases[1]
	if a.StartTime == nil || !a.StartTime.Equal(base) {
		t.Errorf("a.StartTime = %v, want %v", a.StartTime, base)
	}
	if a.EndTime == nil || !a.EndTime.Equal(base.Add(time.Second)) {
		t.Errorf("a.EndTime = %v, want %v", a.EndTime, base.Add(time.Second))
	}
	// b starts where a ended — cumulative offset within the suite.
	if b.StartTime == nil || !b.StartTime.Equal(base.Add(time.Second)) {
		t.Errorf("b.StartTime = %v, want %v", b.StartTime, base.Add(time.Second))
	}
	if b.EndTime == nil || !b.EndTime.Equal(base.Add(3*time.Second)) {
		t.Errorf("b.EndTime = %v, want %v", b.EndTime, base.Add(3*time.Second))
	}
}

func TestParseOmitsTimesWhenTimestampAbsent(t *testing.T) {
	xml := `<testsuites>
  <testsuite name="pytest">
    <testcase name="a" time="1.0"><properties><property name="testpulse_case_key" value="A-1"/></properties></testcase>
  </testsuite>
</testsuites>`

	report, err := junitxml.Parse([]byte(xml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if report.Cases[0].StartTime != nil || report.Cases[0].EndTime != nil {
		t.Errorf("StartTime/EndTime = %v/%v, want both nil without a suite timestamp", report.Cases[0].StartTime, report.Cases[0].EndTime)
	}
}

func TestParseAcceptsBareTestsuiteRoot(t *testing.T) {
	// Some runners (e.g. Maven Surefire) emit a single <testsuite> as the
	// document root, without a wrapping <testsuites>.
	xml := `<testsuite name="surefire"><testcase name="t"><properties><property name="testpulse_case_key" value="S-1"/></properties></testcase></testsuite>`
	report, err := junitxml.Parse([]byte(xml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if report.SuiteName != "surefire" || len(report.Cases) != 1 || report.Cases[0].CaseKey != "S-1" {
		t.Errorf("Parse(bare testsuite) = %+v", report)
	}
}

func TestParseRejectsMalformedXML(t *testing.T) {
	if _, err := junitxml.Parse([]byte("not xml at all")); err == nil {
		t.Error("Parse(malformed) = nil error, want an error")
	}
}

func TestParseCapturesClassName(t *testing.T) {
	// add-unit-test-inventory (#34) needs classname to build a unit
	// test's (classname, name) identity — distinct from CaseKey, which
	// stays empty here since no testpulse_case_key property is present.
	xml := `<testsuites>
  <testsuite name="pytest">
    <testcase classname="tests.test_login" name="test_login" time="0.1"/>
  </testsuite>
</testsuites>`

	report, err := junitxml.Parse([]byte(xml))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(report.Cases) != 1 {
		t.Fatalf("Cases = %d, want 1", len(report.Cases))
	}
	c := report.Cases[0]
	if c.ClassName != "tests.test_login" {
		t.Errorf("ClassName = %q, want tests.test_login", c.ClassName)
	}
	if c.CaseKey != "" {
		t.Errorf("CaseKey = %q, want empty (no testpulse_case_key property)", c.CaseKey)
	}
}
