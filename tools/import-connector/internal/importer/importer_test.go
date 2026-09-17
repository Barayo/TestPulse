package importer

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/tools/import-connector/internal/kiwitcmsclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/qaseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testrailclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/xrayclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/zephyrscaleclient"
)

func intPtr(n int) *int { return &n }

// fakeTestRail serves a fixed suite/section/case/field-metadata fixture,
// keyed exactly like the real client's own method signatures so it
// satisfies TestRailReader structurally.
type fakeTestRail struct {
	suites   []testrailclient.Suite
	sections map[int][]testrailclient.Section
	cases    map[int][]testrailclient.Case
	fields   []testrailclient.CaseField
}

func (f *fakeTestRail) ListSuites(context.Context, int) ([]testrailclient.Suite, error) {
	return f.suites, nil
}
func (f *fakeTestRail) ListSections(_ context.Context, _, suiteID int) ([]testrailclient.Section, error) {
	return f.sections[suiteID], nil
}
func (f *fakeTestRail) ListCases(_ context.Context, _, suiteID int) ([]testrailclient.Case, error) {
	return f.cases[suiteID], nil
}
func (f *fakeTestRail) ListCaseFields(context.Context) ([]testrailclient.CaseField, error) {
	return f.fields, nil
}

// fakeTestPulse records every write call it receives, assigning
// sequential ids — real enough to exercise the "reuse across cases"
// dedup logic in Execute without a real apps/api.
type fakeTestPulse struct {
	rootFolderID    string
	nextID          int
	createdFolders  []createdFolder
	createdCases    []testpulseclient.NewCase
	createdFields   []testpulseclient.CustomField
	createdOptions  []testpulseclient.CustomFieldOption
	failOnAnyMethod bool
}

type createdFolder struct {
	ID, Name, ParentFolderID string
}

func (f *fakeTestPulse) fail(method string) {
	if f.failOnAnyMethod {
		panic(fmt.Sprintf("dry-run made a TestPulse write call: %s", method))
	}
}

func (f *fakeTestPulse) RootFolderID(context.Context, string) (string, error) {
	f.fail("RootFolderID")
	return f.rootFolderID, nil
}

func (f *fakeTestPulse) CreateFolder(_ context.Context, _, name, parentFolderID string) (testpulseclient.Folder, error) {
	f.fail("CreateFolder")
	f.nextID++
	id := fmt.Sprintf("folder-%d", f.nextID)
	f.createdFolders = append(f.createdFolders, createdFolder{ID: id, Name: name, ParentFolderID: parentFolderID})
	return testpulseclient.Folder{ID: id, Name: name, ParentFolderID: parentFolderID}, nil
}

func (f *fakeTestPulse) CreateCase(_ context.Context, _ string, input testpulseclient.NewCase) (testpulseclient.Case, error) {
	f.fail("CreateCase")
	f.nextID++
	f.createdCases = append(f.createdCases, input)
	return testpulseclient.Case{Key: fmt.Sprintf("QA-C%d", f.nextID)}, nil
}

func (f *fakeTestPulse) CreateCustomField(_ context.Context, _, name, fieldType string) (testpulseclient.CustomField, error) {
	f.fail("CreateCustomField")
	f.nextID++
	created := testpulseclient.CustomField{ID: fmt.Sprintf("field-%d", f.nextID), Name: name}
	f.createdFields = append(f.createdFields, created)
	_ = fieldType
	return created, nil
}

func (f *fakeTestPulse) AddCustomFieldOption(_ context.Context, fieldID, value string) (testpulseclient.CustomFieldOption, error) {
	f.fail("AddCustomFieldOption")
	f.nextID++
	created := testpulseclient.CustomFieldOption{ID: fmt.Sprintf("opt-%d", f.nextID), Value: value}
	f.createdOptions = append(f.createdOptions, created)
	_ = fieldID
	return created, nil
}

func fixtureTwoSuitesWithIdenticalSectionNames() *fakeTestRail {
	return &fakeTestRail{
		suites: []testrailclient.Suite{{ID: 1, Name: "Master"}, {ID: 2, Name: "Regression"}},
		sections: map[int][]testrailclient.Section{
			1: {{ID: 10, Name: "Login", ParentID: nil}},
			2: {{ID: 20, Name: "Login", ParentID: nil}},
		},
		cases: map[int][]testrailclient.Case{
			1: {{ID: 100, SectionID: 10, Title: "Master login case"}},
			2: {{ID: 200, SectionID: 20, Title: "Regression login case"}},
		},
	}
}

func TestBuildPlanMapsSuiteAndNestedSectionToFolderHierarchy(t *testing.T) {
	tr := &fakeTestRail{
		suites: []testrailclient.Suite{{ID: 1, Name: "Master"}},
		sections: map[int][]testrailclient.Section{
			1: {
				{ID: 10, Name: "Auth", ParentID: nil},
				{ID: 11, Name: "Login", ParentID: intPtr(10)},
			},
		},
		cases: map[int][]testrailclient.Case{
			1: {{ID: 100, SectionID: 11, Title: "Login with valid credentials"}},
		},
	}

	plan, err := BuildPlan(context.Background(), tr, 1)
	if err != nil {
		t.Fatalf("BuildPlan: %v", err)
	}
	if len(plan.Suites) != 1 || plan.Suites[0].Name != "Master" {
		t.Fatalf("plan.Suites = %+v, want one Master suite folder", plan.Suites)
	}
	authFolder := plan.Suites[0]
	if len(authFolder.Children) != 1 || authFolder.Children[0].Name != "Auth" {
		t.Fatalf("Master's children = %+v, want one Auth folder nested beneath it", authFolder.Children)
	}
	loginFolder := authFolder.Children[0]
	if len(loginFolder.Children) != 1 || loginFolder.Children[0].Name != "Login" {
		t.Fatalf("Auth's children = %+v, want one Login folder nested beneath it", loginFolder.Children)
	}
	if len(loginFolder.Children[0].Cases) != 1 || loginFolder.Children[0].Cases[0].Title != "Login with valid credentials" {
		t.Fatalf("Login's cases = %+v, want the one case placed there", loginFolder.Children[0].Cases)
	}
}

func TestBuildPlanTwoSuitesWithIdenticallyNamedSectionsDoNotCollide(t *testing.T) {
	plan, err := BuildPlan(context.Background(), fixtureTwoSuitesWithIdenticalSectionNames(), 1)
	if err != nil {
		t.Fatalf("BuildPlan: %v", err)
	}
	if len(plan.Suites) != 2 {
		t.Fatalf("plan.Suites = %+v, want 2 suite folders", plan.Suites)
	}
	master, regression := plan.Suites[0], plan.Suites[1]
	if master.Name != "Master" || regression.Name != "Regression" {
		t.Fatalf("suite order/names = %q, %q", master.Name, regression.Name)
	}
	if len(master.Children) != 1 || master.Children[0].Name != "Login" {
		t.Fatalf("Master's children = %+v, want one Login folder", master.Children)
	}
	if len(regression.Children) != 1 || regression.Children[0].Name != "Login" {
		t.Fatalf("Regression's children = %+v, want one Login folder", regression.Children)
	}
	// Two distinct "Login" plan nodes, not one shared/merged node — no
	// case interleaving between them.
	if len(master.Children[0].Cases) != 1 || master.Children[0].Cases[0].Title != "Master login case" {
		t.Fatalf("Master/Login cases = %+v, want only the Master suite's case", master.Children[0].Cases)
	}
	if len(regression.Children[0].Cases) != 1 || regression.Children[0].Cases[0].Title != "Regression login case" {
		t.Fatalf("Regression/Login cases = %+v, want only the Regression suite's case", regression.Children[0].Cases)
	}
}

func TestExecuteCreatesTwoDistinctLoginFoldersUnderTheirOwnSuiteFolder(t *testing.T) {
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildPlan(context.Background(), fixtureTwoSuitesWithIdenticalSectionNames(), 1)
	if err != nil {
		t.Fatalf("BuildPlan: %v", err)
	}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}

	loginFolders := map[string]string{} // parentFolderID -> folder id, one per suite
	for _, f := range tp.createdFolders {
		if f.Name == "Login" {
			loginFolders[f.ParentFolderID] = f.ID
		}
	}
	if len(loginFolders) != 2 {
		t.Fatalf("distinct Login folders = %+v, want 2 (one per suite, never merged)", loginFolders)
	}
	if len(tp.createdCases) != 2 {
		t.Fatalf("created cases = %d, want 2", len(tp.createdCases))
	}
	for _, c := range tp.createdCases {
		if _, ok := loginFolders[""]; ok {
			t.Fatalf("a Login folder had no parent — suite folder nesting broke: %+v", loginFolders)
		}
		if c.FolderID == "" {
			t.Errorf("created case %+v has no FolderID", c)
		}
	}
}

func TestMappableCustomFieldCreatedOnceAndReusedAcrossCases(t *testing.T) {
	tr := &fakeTestRail{
		suites:   []testrailclient.Suite{{ID: 1, Name: "Master"}},
		sections: map[int][]testrailclient.Section{1: {{ID: 10, Name: "Login", ParentID: nil}}},
		cases: map[int][]testrailclient.Case{1: {
			{ID: 100, SectionID: 10, Title: "Case A", CustomFields: map[string]string{"custom_automation_type": "Manual"}},
			{ID: 101, SectionID: 10, Title: "Case B", CustomFields: map[string]string{"custom_automation_type": "Manual"}},
			{ID: 102, SectionID: 10, Title: "Case C", CustomFields: map[string]string{"custom_automation_type": "Automated"}},
		}},
		fields: []testrailclient.CaseField{
			{SystemName: "custom_automation_type", Label: "Automation Type", TypeID: 6},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildPlan(context.Background(), tr, 1)
	if err != nil {
		t.Fatalf("BuildPlan: %v", err)
	}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}

	if len(tp.createdFields) != 1 {
		t.Fatalf("created fields = %+v, want exactly 1 (reused across all 3 cases)", tp.createdFields)
	}
	if tp.createdFields[0].Name != "Automation Type" {
		t.Errorf("field name = %q, want Automation Type (the TestRail label)", tp.createdFields[0].Name)
	}
	if len(tp.createdOptions) != 2 {
		t.Fatalf("created options = %+v, want exactly 2 distinct values (Manual, Automated), each created once", tp.createdOptions)
	}
	for _, c := range tp.createdCases {
		if len(c.CustomFields) != 1 {
			t.Errorf("case %+v missing its mapped custom field", c)
		}
	}
}

func TestUnmappableCustomFieldNamedInReportOnce(t *testing.T) {
	tr := &fakeTestRail{
		suites:   []testrailclient.Suite{{ID: 1, Name: "Master"}},
		sections: map[int][]testrailclient.Section{1: {{ID: 10, Name: "Login", ParentID: nil}}},
		cases: map[int][]testrailclient.Case{1: {
			{ID: 100, SectionID: 10, Title: "Case A", CustomFields: map[string]string{"custom_owner": "42"}},
			{ID: 101, SectionID: 10, Title: "Case B", CustomFields: map[string]string{"custom_owner": "7"}},
		}},
		fields: []testrailclient.CaseField{
			{SystemName: "custom_owner", Label: "Owner", TypeID: 7}, // User type — no TestPulse equivalent
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildPlan(context.Background(), tr, 1)
	if err != nil {
		t.Fatalf("BuildPlan: %v", err)
	}
	if len(plan.Unmapped) != 1 || plan.Unmapped[0] != "Owner" {
		t.Fatalf("plan.Unmapped = %+v, want [\"Owner\"] named once despite 2 cases using it", plan.Unmapped)
	}

	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdFields) != 0 {
		t.Errorf("created fields = %+v, want none — Owner has no TestPulse equivalent", tp.createdFields)
	}
	for _, c := range tp.createdCases {
		if len(c.CustomFields) != 0 {
			t.Errorf("case %+v should have no custom fields — the only one it had is unmappable", c)
		}
	}
}

// TestRail's own documented get_case_fields type_id values (design.md D7's
// full list) — every one exercised here on a single case with several
// fields of each mappable type, so the test proves both "String and Text
// both map to text" and "two distinct fields of the same mappable type
// don't collide," not just one representative field per type.
const (
	trTypeString      = 1  // maps to TestPulse text
	trTypeInteger     = 2  // no equivalent — dropped
	trTypeText        = 3  // maps to TestPulse text
	trTypeURL         = 4  // no equivalent — dropped
	trTypeCheckbox    = 5  // no equivalent — dropped
	trTypeDropdown    = 6  // maps to TestPulse select
	trTypeUser        = 7  // no equivalent — dropped
	trTypeDate        = 8  // no equivalent — dropped
	trTypeMultiSelect = 12 // no equivalent — dropped
)

func TestBuildPlanAndExecuteHandleEveryTestRailCustomFieldType(t *testing.T) {
	tr := &fakeTestRail{
		suites:   []testrailclient.Suite{{ID: 1, Name: "Master"}},
		sections: map[int][]testrailclient.Section{1: {{ID: 10, Name: "Login", ParentID: nil}}},
		cases: map[int][]testrailclient.Case{1: {
			{ID: 100, SectionID: 10, Title: "Case A", CustomFields: map[string]string{
				"custom_notes":          "First run notes", // String
				"custom_precondition":   "Second string field",
				"custom_summary":        "A longer text blob", // Text
				"custom_description":    "Second text field",
				"custom_priority_level": "High",                // Dropdown
				"custom_environment":    "Staging",             // second Dropdown
				"custom_estimate":       "5",                   // Integer — dropped
				"custom_is_smoke":       "true",                // Checkbox — dropped
				"custom_reference_url":  "https://example.com", // URL — dropped
				"custom_owner":          "42",                  // User — dropped
				"custom_due_date":       "2026-12-01",          // Date — dropped
				"custom_platforms":      "ios,android",         // Multi-select — dropped
			}},
		}},
		fields: []testrailclient.CaseField{
			{SystemName: "custom_notes", Label: "Notes", TypeID: trTypeString},
			{SystemName: "custom_precondition", Label: "Precondition", TypeID: trTypeString},
			{SystemName: "custom_summary", Label: "Summary", TypeID: trTypeText},
			{SystemName: "custom_description", Label: "Description", TypeID: trTypeText},
			{SystemName: "custom_priority_level", Label: "Priority Level", TypeID: trTypeDropdown},
			{SystemName: "custom_environment", Label: "Environment", TypeID: trTypeDropdown},
			{SystemName: "custom_estimate", Label: "Estimate", TypeID: trTypeInteger},
			{SystemName: "custom_is_smoke", Label: "Is Smoke", TypeID: trTypeCheckbox},
			{SystemName: "custom_reference_url", Label: "Reference URL", TypeID: trTypeURL},
			{SystemName: "custom_owner", Label: "Owner", TypeID: trTypeUser},
			{SystemName: "custom_due_date", Label: "Due Date", TypeID: trTypeDate},
			{SystemName: "custom_platforms", Label: "Platforms", TypeID: trTypeMultiSelect},
		},
	}

	plan, err := BuildPlan(context.Background(), tr, 1)
	if err != nil {
		t.Fatalf("BuildPlan: %v", err)
	}

	// The 6 unmappable fields are each named individually, by label — never
	// silently dropped, never collapsed into a count.
	wantUnmapped := []string{"Estimate", "Is Smoke", "Reference URL", "Owner", "Due Date", "Platforms"}
	if len(plan.Unmapped) != len(wantUnmapped) {
		t.Fatalf("plan.Unmapped = %+v, want %d entries: %v", plan.Unmapped, len(wantUnmapped), wantUnmapped)
	}
	for _, name := range wantUnmapped {
		found := false
		for _, u := range plan.Unmapped {
			if u == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("plan.Unmapped = %+v, missing %q", plan.Unmapped, name)
		}
	}

	// The 6 mappable fields (2 String, 2 Text, 2 Dropdown) survive into the
	// case plan, keyed by system_name, values untouched.
	if len(plan.Suites) != 1 || len(plan.Suites[0].Children) != 1 {
		t.Fatalf("unexpected plan shape: %+v", plan.Suites)
	}
	caseFields := plan.Suites[0].Children[0].Cases[0].CustomFields
	wantMapped := map[string]string{
		"custom_notes":          "First run notes",
		"custom_precondition":   "Second string field",
		"custom_summary":        "A longer text blob",
		"custom_description":    "Second text field",
		"custom_priority_level": "High",
		"custom_environment":    "Staging",
	}
	if len(caseFields) != len(wantMapped) {
		t.Fatalf("case CustomFields = %+v, want %d mapped entries: %+v", caseFields, len(wantMapped), wantMapped)
	}
	for k, want := range wantMapped {
		if got := caseFields[k]; got != want {
			t.Errorf("case CustomFields[%q] = %q, want %q", k, got, want)
		}
	}

	// execute: exactly 4 text-type fields (2 String + 2 Text) and 2
	// select-type fields (2 Dropdown) get created — one each, never one
	// shared field across distinct TestRail fields of the same type.
	tp := &fakeTestPulse{rootFolderID: "root"}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdFields) != 6 {
		t.Fatalf("created fields = %+v, want 6 (2 String + 2 Text + 2 Dropdown, one each)", tp.createdFields)
	}
	wantFieldNames := []string{"Notes", "Precondition", "Summary", "Description", "Priority Level", "Environment"}
	for _, name := range wantFieldNames {
		found := false
		for _, f := range tp.createdFields {
			if f.Name == name {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("createdFields = %+v, missing %q", tp.createdFields, name)
		}
	}
	// One option per Dropdown field's single value in this one-case fixture.
	if len(tp.createdOptions) != 2 {
		t.Fatalf("created options = %+v, want 2 (one per Dropdown field)", tp.createdOptions)
	}
	if len(tp.createdCases) != 1 || len(tp.createdCases[0].CustomFields) != 6 {
		t.Fatalf("created case = %+v, want exactly 6 populated custom fields (the unmappable ones absent)", tp.createdCases)
	}
}

func TestRunDryRunMakesZeroTestPulseWriteCalls(t *testing.T) {
	tr := fixtureTwoSuitesWithIdenticalSectionNames()
	tp := &fakeTestPulse{rootFolderID: "root", failOnAnyMethod: true}

	report, err := Run(context.Background(), tr, tp, "QA", 1, true, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.Counts["folders"] != 4 { // 2 suite folders + 2 Login folders
		t.Errorf("report.Counts[folders] = %d, want 4", report.Counts["folders"])
	}
	if report.Counts["cases"] != 2 {
		t.Errorf("report.Counts[cases] = %d, want 2", report.Counts["cases"])
	}
	if len(tp.createdFolders) != 0 || len(tp.createdCases) != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%+v cases=%+v", tp.createdFolders, tp.createdCases)
	}
}

func TestRunRealModeCallsExecuteAndReportsProgress(t *testing.T) {
	tr := fixtureTwoSuitesWithIdenticalSectionNames()
	tp := &fakeTestPulse{rootFolderID: "root"}

	var progressCalls [][2]int
	report, err := Run(context.Background(), tr, tp, "QA", 1, false, func(current, total int) {
		progressCalls = append(progressCalls, [2]int{current, total})
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(tp.createdCases) != 2 {
		t.Fatalf("created cases = %d, want 2 (real mode writes)", len(tp.createdCases))
	}
	if report.Counts["cases"] != 2 {
		t.Errorf("report.Counts[cases] = %d, want 2", report.Counts["cases"])
	}
	if len(progressCalls) != 2 || progressCalls[len(progressCalls)-1] != [2]int{2, 2} {
		t.Errorf("progressCalls = %+v, want 2 calls ending at 2/2", progressCalls)
	}
}

// fakeQase serves a fixed suite/case/field-metadata fixture, keyed
// exactly like the real client's own method signatures so it satisfies
// QaseReader structurally.
type fakeQase struct {
	suites []qaseclient.Suite
	cases  []qaseclient.Case
	fields []qaseclient.CustomField
}

func (f *fakeQase) ListSuites(context.Context, string) ([]qaseclient.Suite, error) {
	return f.suites, nil
}
func (f *fakeQase) ListCases(context.Context, string) ([]qaseclient.Case, error) {
	return f.cases, nil
}
func (f *fakeQase) ListCaseFields(context.Context) ([]qaseclient.CustomField, error) {
	return f.fields, nil
}

func TestBuildQasePlanMapsNestedSuiteTreeToFolderHierarchy(t *testing.T) {
	qr := &fakeQase{
		suites: []qaseclient.Suite{
			{ID: 1, Title: "Auth", ParentID: nil},
			{ID: 2, Title: "Login", ParentID: intPtr(1)},
		},
		cases: []qaseclient.Case{
			{ID: 100, SuiteID: 2, Title: "Login with valid credentials"},
		},
	}

	plan, err := BuildQasePlan(context.Background(), qr, "PRJ")
	if err != nil {
		t.Fatalf("BuildQasePlan: %v", err)
	}
	if len(plan.Suites) != 1 || plan.Suites[0].Name != "Auth" {
		t.Fatalf("plan.Suites = %+v, want one top-level Auth folder", plan.Suites)
	}
	authFolder := plan.Suites[0]
	if len(authFolder.Children) != 1 || authFolder.Children[0].Name != "Login" {
		t.Fatalf("Auth's children = %+v, want one nested Login folder", authFolder.Children)
	}
	loginFolder := authFolder.Children[0]
	if len(loginFolder.Cases) != 1 || loginFolder.Cases[0].Title != "Login with valid credentials" {
		t.Fatalf("Login's cases = %+v, want the one case placed there", loginFolder.Cases)
	}
}

func TestBuildQasePlanRootSuiteWithNoParentIsTopLevel(t *testing.T) {
	qr := &fakeQase{
		suites: []qaseclient.Suite{
			{ID: 1, Title: "Smoke", ParentID: nil},
			{ID: 2, Title: "Regression", ParentID: nil},
		},
	}
	plan, err := BuildQasePlan(context.Background(), qr, "PRJ")
	if err != nil {
		t.Fatalf("BuildQasePlan: %v", err)
	}
	if len(plan.Suites) != 2 {
		t.Fatalf("plan.Suites = %+v, want 2 top-level folders (both roots)", plan.Suites)
	}
}

func TestQaseMappableCustomFieldCreatedOnceAndReusedAcrossCases(t *testing.T) {
	qr := &fakeQase{
		suites: []qaseclient.Suite{{ID: 1, Title: "Master", ParentID: nil}},
		cases: []qaseclient.Case{
			{ID: 100, SuiteID: 1, Title: "Case A", CustomFields: []qaseclient.CustomFieldValue{{ID: 7, Value: "Manual"}}},
			{ID: 101, SuiteID: 1, Title: "Case B", CustomFields: []qaseclient.CustomFieldValue{{ID: 7, Value: "Manual"}}},
			{ID: 102, SuiteID: 1, Title: "Case C", CustomFields: []qaseclient.CustomFieldValue{{ID: 7, Value: "Automated"}}},
		},
		fields: []qaseclient.CustomField{
			{ID: 7, Title: "Automation Type", Type: "selectbox"},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildQasePlan(context.Background(), qr, "PRJ")
	if err != nil {
		t.Fatalf("BuildQasePlan: %v", err)
	}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}

	if len(tp.createdFields) != 1 {
		t.Fatalf("created fields = %+v, want exactly 1 (reused across all 3 cases)", tp.createdFields)
	}
	if tp.createdFields[0].Name != "Automation Type" {
		t.Errorf("field name = %q, want Automation Type (the Qase title)", tp.createdFields[0].Name)
	}
	if len(tp.createdOptions) != 2 {
		t.Fatalf("created options = %+v, want exactly 2 distinct values (Manual, Automated), each created once", tp.createdOptions)
	}
}

func TestQaseUnmappableCustomFieldNamedInReportOnce(t *testing.T) {
	qr := &fakeQase{
		suites: []qaseclient.Suite{{ID: 1, Title: "Master", ParentID: nil}},
		cases: []qaseclient.Case{
			{ID: 100, SuiteID: 1, Title: "Case A", CustomFields: []qaseclient.CustomFieldValue{{ID: 8, Value: "42"}}},
			{ID: 101, SuiteID: 1, Title: "Case B", CustomFields: []qaseclient.CustomFieldValue{{ID: 8, Value: "7"}}},
		},
		fields: []qaseclient.CustomField{
			{ID: 8, Title: "Owner", Type: "user"}, // no TestPulse equivalent
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildQasePlan(context.Background(), qr, "PRJ")
	if err != nil {
		t.Fatalf("BuildQasePlan: %v", err)
	}
	if len(plan.Unmapped) != 1 || plan.Unmapped[0] != "Owner" {
		t.Fatalf("plan.Unmapped = %+v, want [\"Owner\"] named once despite 2 cases using it", plan.Unmapped)
	}

	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdFields) != 0 {
		t.Errorf("created fields = %+v, want none — Owner has no TestPulse equivalent", tp.createdFields)
	}
	for _, c := range tp.createdCases {
		if len(c.CustomFields) != 0 {
			t.Errorf("case %+v should have no custom fields — the only one it had is unmappable", c)
		}
	}
}

func TestRunQaseDryRunMakesZeroTestPulseWriteCalls(t *testing.T) {
	qr := &fakeQase{
		suites: []qaseclient.Suite{{ID: 1, Title: "Master", ParentID: nil}},
		cases:  []qaseclient.Case{{ID: 100, SuiteID: 1, Title: "Case A"}},
	}
	tp := &fakeTestPulse{rootFolderID: "root", failOnAnyMethod: true}

	report, err := RunQase(context.Background(), qr, tp, "QA", "PRJ", true, nil)
	if err != nil {
		t.Fatalf("RunQase: %v", err)
	}
	if report.Counts["folders"] != 1 || report.Counts["cases"] != 1 {
		t.Errorf("report.Counts = %+v, want 1 folder + 1 case", report.Counts)
	}
	if len(tp.createdFolders) != 0 || len(tp.createdCases) != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%+v cases=%+v", tp.createdFolders, tp.createdCases)
	}
}

// --- Zephyr Scale (add-zephyr-scale-importer) ---

// fakeZephyrScale serves a fixed folder/case/step/script fixture, keyed
// exactly like the real client's own method signatures so it satisfies
// ZephyrScaleReader structurally.
type fakeZephyrScale struct {
	folders []zephyrscaleclient.Folder
	cases   []zephyrscaleclient.Case
	steps   map[string][]zephyrscaleclient.TestStep
	scripts map[string]*zephyrscaleclient.TestScript
}

func (f *fakeZephyrScale) ListFolders(context.Context, string) ([]zephyrscaleclient.Folder, error) {
	return f.folders, nil
}
func (f *fakeZephyrScale) ListTestCases(context.Context, string) ([]zephyrscaleclient.Case, error) {
	return f.cases, nil
}
func (f *fakeZephyrScale) ListTestSteps(_ context.Context, testCaseKey string) ([]zephyrscaleclient.TestStep, error) {
	return f.steps[testCaseKey], nil
}
func (f *fakeZephyrScale) GetTestScript(_ context.Context, testCaseKey string) (*zephyrscaleclient.TestScript, error) {
	return f.scripts[testCaseKey], nil
}

func TestBuildZephyrScalePlanMapsNestedFolderTree(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{
			{ID: 1, Name: "Auth", ParentID: nil},
			{ID: 2, Name: "Login", ParentID: intPtr(1)},
		},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "Login with valid credentials", FolderID: intPtr(2)},
		},
	}

	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	if len(plan.Suites) != 1 || plan.Suites[0].Name != "Auth" {
		t.Fatalf("plan.Suites = %+v, want one top-level Auth folder", plan.Suites)
	}
	authFolder := plan.Suites[0]
	if len(authFolder.Children) != 1 || authFolder.Children[0].Name != "Login" {
		t.Fatalf("Auth's children = %+v, want one nested Login folder", authFolder.Children)
	}
	loginFolder := authFolder.Children[0]
	if len(loginFolder.Cases) != 1 || loginFolder.Cases[0].Title != "Login with valid credentials" {
		t.Fatalf("Login's cases = %+v, want the one case placed there", loginFolder.Cases)
	}
}

func TestBuildZephyrScalePlanRootFolderWithNoParentIsTopLevel(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{
			{ID: 1, Name: "Smoke", ParentID: nil},
			{ID: 2, Name: "Regression", ParentID: nil},
		},
	}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	if len(plan.Suites) != 2 {
		t.Fatalf("plan.Suites = %+v, want 2 top-level folders (both roots)", plan.Suites)
	}
}

func TestBuildZephyrScalePlanCaseWithNoFolderGoesToProjectRoot(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Auth", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "No folder case", FolderID: nil},
		},
	}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	if len(plan.RootCases) != 1 || plan.RootCases[0].Title != "No folder case" {
		t.Fatalf("plan.RootCases = %+v, want the folderless case", plan.RootCases)
	}
	if len(plan.Suites) != 1 || len(plan.Suites[0].Cases) != 0 {
		t.Fatalf("plan.Suites = %+v, the folderless case must not land inside Auth", plan.Suites)
	}

	tp := &fakeTestPulse{rootFolderID: "root"}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdCases) != 1 || tp.createdCases[0].FolderID != "root" {
		t.Fatalf("created cases = %+v, want the case created directly under the project root folder", tp.createdCases)
	}
}

func TestZephyrScaleStepByStepStepsImportWithTestDataAppended(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Auth", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "Login", FolderID: intPtr(1)},
		},
		steps: map[string][]zephyrscaleclient.TestStep{
			"PROJ-T1": {
				{Description: "Enter username/password", TestData: "user=admin", ExpectedResult: "Logged in"},
				{Description: "Click submit", ExpectedResult: "Redirects to dashboard"},
			},
		},
	}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	steps := plan.Suites[0].Cases[0].Steps
	if len(steps) != 2 {
		t.Fatalf("steps = %+v, want 2", steps)
	}
	if steps[0].Action != "Enter username/password\n\nTest data: user=admin" {
		t.Errorf("steps[0].Action = %q, want description + appended test data", steps[0].Action)
	}
	if steps[0].Expected != "Logged in" {
		t.Errorf("steps[0].Expected = %q, want %q", steps[0].Expected, "Logged in")
	}
	if steps[1].Action != "Click submit" {
		t.Errorf("steps[1].Action = %q, want unmodified description (no test data to append)", steps[1].Action)
	}
}

func TestZephyrScaleDelegateStepIsSkippedWithoutAbortingTheCase(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Auth", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "Login", FolderID: intPtr(1)},
		},
		steps: map[string][]zephyrscaleclient.TestStep{
			"PROJ-T1": {
				{Description: "Enter username/password", ExpectedResult: "Logged in"},
				{IsDelegate: true},
				{Description: "Click submit", ExpectedResult: "Redirects to dashboard"},
			},
		},
	}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	steps := plan.Suites[0].Cases[0].Steps
	if len(steps) != 2 {
		t.Fatalf("steps = %+v, want 2 (the delegate step skipped, not aborting the case)", steps)
	}
	if steps[0].Action != "Enter username/password" || steps[1].Action != "Click submit" {
		t.Fatalf("steps = %+v, want the two non-delegate steps in order", steps)
	}
}

func TestZephyrScaleScriptOnlyCaseProcedurePreservedInDescription(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Auth", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "BDD case", FolderID: intPtr(1), HasTestScript: true},
		},
		scripts: map[string]*zephyrscaleclient.TestScript{
			"PROJ-T1": {Type: "bdd", Text: "Given a user\nWhen they log in\nThen they see the dashboard"},
		},
	}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	cp := plan.Suites[0].Cases[0]
	if len(cp.Steps) != 0 {
		t.Errorf("Steps = %+v, want none for a script-only case", cp.Steps)
	}
	if !strings.Contains(cp.Description, "BDD") || !strings.Contains(cp.Description, "Given a user") {
		t.Errorf("Description = %q, want the BDD script text preserved and identified as BDD", cp.Description)
	}
}

func TestZephyrScaleCaseWithNeitherStepsNorScriptImportsWithEmptyStepsAndDescription(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Auth", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "Bare case", FolderID: intPtr(1)},
		},
	}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	cp := plan.Suites[0].Cases[0]
	if len(cp.Steps) != 0 {
		t.Errorf("Steps = %+v, want none", cp.Steps)
	}
	if cp.Description != "" {
		t.Errorf("Description = %q, want empty", cp.Description)
	}
}

func TestZephyrScaleNativePriorityAndStatusAreNeverAppliedToAnyField(t *testing.T) {
	// design.md D-Z4: matches the established TestRail/Qase precedent of
	// not mapping vendor-native priority/status at all — there is no field
	// on zephyrscaleclient.Case for either, structurally, so there is
	// nothing here to apply. This test guards against a future change
	// accidentally reintroducing a priority/status mapping as "scope
	// creep" without a deliberate design decision to do so: casePlan (and
	// therefore testpulseclient.NewCase) carries no priority/status value
	// derived from Zephyr Scale at all.
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Auth", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "Critical case", FolderID: intPtr(1)},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdCases) != 1 {
		t.Fatalf("created cases = %+v, want 1", tp.createdCases)
	}
	// NewCase has no Priority field at all — Validate()'s default applies
	// server-side, exactly like every other imported case in this project.
}

func TestZephyrScaleStringCustomFieldMappedToText(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Master", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "Case A", FolderID: intPtr(1), CustomFields: map[string]any{"Automation Type": "Manual"}},
			{Key: "PROJ-T2", Name: "Case B", FolderID: intPtr(1), CustomFields: map[string]any{"Automation Type": "Manual"}},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdFields) != 1 {
		t.Fatalf("created fields = %+v, want exactly 1 (reused across both cases)", tp.createdFields)
	}
	if tp.createdFields[0].Name != "Automation Type" {
		t.Errorf("field name = %q, want Automation Type", tp.createdFields[0].Name)
	}
	for _, c := range tp.createdCases {
		if len(c.CustomFields) != 1 {
			t.Errorf("case %+v, want exactly 1 custom field value set", c)
		}
	}
}

func TestZephyrScaleNonStringCustomFieldNamedInReportOnce(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Master", ParentID: nil}},
		cases: []zephyrscaleclient.Case{
			{Key: "PROJ-T1", Name: "Case A", FolderID: intPtr(1), CustomFields: map[string]any{"Story Points": float64(3)}},
			{Key: "PROJ-T2", Name: "Case B", FolderID: intPtr(1), CustomFields: map[string]any{"Story Points": float64(5)}},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildZephyrScalePlan(context.Background(), zr, "PROJ")
	if err != nil {
		t.Fatalf("BuildZephyrScalePlan: %v", err)
	}
	if len(plan.Unmapped) != 1 || plan.Unmapped[0] != "Story Points" {
		t.Fatalf("plan.Unmapped = %+v, want [\"Story Points\"] named once despite 2 cases using it", plan.Unmapped)
	}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdFields) != 0 {
		t.Errorf("created fields = %+v, want none — Story Points is not a plain string value", tp.createdFields)
	}
	for _, c := range tp.createdCases {
		if len(c.CustomFields) != 0 {
			t.Errorf("case %+v should have no custom fields — its only field is unmappable", c)
		}
	}
}

func TestRunZephyrScaleDryRunMakesZeroTestPulseWriteCalls(t *testing.T) {
	zr := &fakeZephyrScale{
		folders: []zephyrscaleclient.Folder{{ID: 1, Name: "Master", ParentID: nil}},
		cases:   []zephyrscaleclient.Case{{Key: "PROJ-T1", Name: "Case A", FolderID: intPtr(1)}},
	}
	tp := &fakeTestPulse{rootFolderID: "root", failOnAnyMethod: true}

	report, err := RunZephyrScale(context.Background(), zr, tp, "QA", "PROJ", true, nil)
	if err != nil {
		t.Fatalf("RunZephyrScale: %v", err)
	}
	if report.Counts["folders"] != 1 || report.Counts["cases"] != 1 {
		t.Errorf("report.Counts = %+v, want 1 folder + 1 case", report.Counts)
	}
	if len(tp.createdFolders) != 0 || len(tp.createdCases) != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%+v cases=%+v", tp.createdFolders, tp.createdCases)
	}
}

// --- Kiwi TCMS (add-kiwi-tcms-importer) ---

// fakeKiwiTCMS serves a fixed product/plan/case/property fixture, keyed
// exactly like the real client's own method signatures so it satisfies
// KiwiTCMSReader structurally.
type fakeKiwiTCMS struct {
	product     kiwitcmsclient.Product
	findErr     error
	plans       []kiwitcmsclient.TestPlan
	casesByPlan map[int][]kiwitcmsclient.TestCase
	propsByCase map[int][]kiwitcmsclient.Property
}

func (f *fakeKiwiTCMS) FindProduct(context.Context, string) (kiwitcmsclient.Product, error) {
	if f.findErr != nil {
		return kiwitcmsclient.Product{}, f.findErr
	}
	return f.product, nil
}
func (f *fakeKiwiTCMS) ListTestPlans(context.Context, int) ([]kiwitcmsclient.TestPlan, error) {
	return f.plans, nil
}
func (f *fakeKiwiTCMS) ListTestCases(_ context.Context, planID int) ([]kiwitcmsclient.TestCase, error) {
	return f.casesByPlan[planID], nil
}
func (f *fakeKiwiTCMS) ListProperties(_ context.Context, caseID int) ([]kiwitcmsclient.Property, error) {
	return f.propsByCase[caseID], nil
}

func TestBuildKiwiTCMSPlanMapsNestedTestPlanTree(t *testing.T) {
	kr := &fakeKiwiTCMS{
		product: kiwitcmsclient.Product{ID: 61, Name: "Acme"},
		plans: []kiwitcmsclient.TestPlan{
			{ID: 1, Name: "Master", ParentID: nil},
			{ID: 2, Name: "Login", ParentID: intPtr(1)},
		},
		casesByPlan: map[int][]kiwitcmsclient.TestCase{
			2: {{ID: 500, Summary: "Login with valid credentials"}},
		},
	}

	plan, err := BuildKiwiTCMSPlan(context.Background(), kr, "Acme")
	if err != nil {
		t.Fatalf("BuildKiwiTCMSPlan: %v", err)
	}
	if len(plan.Suites) != 1 || plan.Suites[0].Name != "Master" {
		t.Fatalf("plan.Suites = %+v, want one top-level Master folder", plan.Suites)
	}
	masterFolder := plan.Suites[0]
	if len(masterFolder.Children) != 1 || masterFolder.Children[0].Name != "Login" {
		t.Fatalf("Master's children = %+v, want one nested Login folder", masterFolder.Children)
	}
	loginFolder := masterFolder.Children[0]
	if len(loginFolder.Cases) != 1 || loginFolder.Cases[0].Title != "Login with valid credentials" {
		t.Fatalf("Login's cases = %+v, want the one case placed there", loginFolder.Cases)
	}
}

func TestBuildKiwiTCMSPlanRootPlanWithNoParentIsTopLevel(t *testing.T) {
	kr := &fakeKiwiTCMS{
		product: kiwitcmsclient.Product{ID: 61, Name: "Acme"},
		plans: []kiwitcmsclient.TestPlan{
			{ID: 1, Name: "Smoke", ParentID: nil},
			{ID: 2, Name: "Regression", ParentID: nil},
		},
	}
	plan, err := BuildKiwiTCMSPlan(context.Background(), kr, "Acme")
	if err != nil {
		t.Fatalf("BuildKiwiTCMSPlan: %v", err)
	}
	if len(plan.Suites) != 2 {
		t.Fatalf("plan.Suites = %+v, want 2 top-level folders (both roots)", plan.Suites)
	}
}

func TestKiwiTCMSCaseLinkedToMultiplePlansImportsOnceAndIsNamedInReport(t *testing.T) {
	kr := &fakeKiwiTCMS{
		product: kiwitcmsclient.Product{ID: 61, Name: "Acme"},
		plans: []kiwitcmsclient.TestPlan{
			{ID: 1, Name: "Smoke", ParentID: nil},
			{ID: 2, Name: "Regression", ParentID: nil},
		},
		casesByPlan: map[int][]kiwitcmsclient.TestCase{
			1: {{ID: 500, Summary: "Shared case"}},
			2: {{ID: 500, Summary: "Shared case"}},
		},
	}

	plan, err := BuildKiwiTCMSPlan(context.Background(), kr, "Acme")
	if err != nil {
		t.Fatalf("BuildKiwiTCMSPlan: %v", err)
	}
	total := len(plan.Suites[0].Cases) + len(plan.Suites[1].Cases)
	if total != 1 {
		t.Fatalf("total cases across both folders = %d, want 1 (imported once, not duplicated)", total)
	}
	if len(plan.Unmapped) != 1 || !strings.Contains(plan.Unmapped[0], "Shared case") {
		t.Fatalf("plan.Unmapped = %+v, want one entry naming the multi-plan case", plan.Unmapped)
	}

	tp := &fakeTestPulse{rootFolderID: "root"}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdCases) != 1 {
		t.Fatalf("created cases = %+v, want exactly 1", tp.createdCases)
	}
}

func TestKiwiTCMSCaseTextBecomesDescriptionWithNoSteps(t *testing.T) {
	kr := &fakeKiwiTCMS{
		product: kiwitcmsclient.Product{ID: 61, Name: "Acme"},
		plans:   []kiwitcmsclient.TestPlan{{ID: 1, Name: "Master", ParentID: nil}},
		casesByPlan: map[int][]kiwitcmsclient.TestCase{
			1: {{ID: 500, Summary: "Case A", Text: "Enter username and password, submit."}},
		},
	}
	plan, err := BuildKiwiTCMSPlan(context.Background(), kr, "Acme")
	if err != nil {
		t.Fatalf("BuildKiwiTCMSPlan: %v", err)
	}
	cp := plan.Suites[0].Cases[0]
	if cp.Description != "Enter username and password, submit." {
		t.Errorf("Description = %q, want the case's text", cp.Description)
	}
	if len(cp.Steps) != 0 {
		t.Errorf("Steps = %+v, want none (Kiwi TCMS has no structured steps)", cp.Steps)
	}
}

func TestKiwiTCMSPropertiesMapToTextCustomFieldsReusedAcrossCases(t *testing.T) {
	kr := &fakeKiwiTCMS{
		product: kiwitcmsclient.Product{ID: 61, Name: "Acme"},
		plans:   []kiwitcmsclient.TestPlan{{ID: 1, Name: "Master", ParentID: nil}},
		casesByPlan: map[int][]kiwitcmsclient.TestCase{
			1: {
				{ID: 500, Summary: "Case A"},
				{ID: 501, Summary: "Case B"},
			},
		},
		propsByCase: map[int][]kiwitcmsclient.Property{
			500: {{Name: "Automation", Value: "Manual"}},
			501: {{Name: "Automation", Value: "Automated"}},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root"}
	plan, err := BuildKiwiTCMSPlan(context.Background(), kr, "Acme")
	if err != nil {
		t.Fatalf("BuildKiwiTCMSPlan: %v", err)
	}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdFields) != 1 {
		t.Fatalf("created fields = %+v, want exactly 1 (reused across both cases)", tp.createdFields)
	}
	if tp.createdFields[0].Name != "Automation" {
		t.Errorf("field name = %q, want Automation", tp.createdFields[0].Name)
	}
	if len(plan.Unmapped) != 0 {
		t.Errorf("plan.Unmapped = %+v, want none — every property maps to text", plan.Unmapped)
	}
}

func TestRunKiwiTCMSDryRunMakesZeroTestPulseWriteCalls(t *testing.T) {
	kr := &fakeKiwiTCMS{
		product: kiwitcmsclient.Product{ID: 61, Name: "Acme"},
		plans:   []kiwitcmsclient.TestPlan{{ID: 1, Name: "Master", ParentID: nil}},
		casesByPlan: map[int][]kiwitcmsclient.TestCase{
			1: {{ID: 500, Summary: "Case A"}},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root", failOnAnyMethod: true}

	report, err := RunKiwiTCMS(context.Background(), kr, tp, "QA", "Acme", true, nil)
	if err != nil {
		t.Fatalf("RunKiwiTCMS: %v", err)
	}
	if report.Counts["folders"] != 1 || report.Counts["cases"] != 1 {
		t.Errorf("report.Counts = %+v, want 1 folder + 1 case", report.Counts)
	}
	if len(tp.createdFolders) != 0 || len(tp.createdCases) != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%+v cases=%+v", tp.createdFolders, tp.createdCases)
	}
}

// --- Xray (add-xray-importer) ---

// fakeXray serves a fixed folder/test/step fixture, keyed exactly like
// the real client's own method signatures so it satisfies XrayReader
// structurally — one fake stands in for both Cloud and Server/DC, since
// design.md D-X1 keeps internal/importer's mapping logic mode-agnostic.
type fakeXray struct {
	folders       []xrayclient.Folder
	testsByFolder map[string][]xrayclient.Test
	stepsByKey    map[string][]xrayclient.TestStep
}

func (f *fakeXray) ListFolders(context.Context) ([]xrayclient.Folder, error) {
	return f.folders, nil
}
func (f *fakeXray) ListTests(_ context.Context, folderID string) ([]xrayclient.Test, error) {
	return f.testsByFolder[folderID], nil
}
func (f *fakeXray) GetTestSteps(_ context.Context, testKey string) ([]xrayclient.TestStep, error) {
	return f.stepsByKey[testKey], nil
}

func strPtr(s string) *string { return &s }

func TestBuildXrayPlanMapsNestedTestRepositoryFolderTree(t *testing.T) {
	xr := &fakeXray{
		folders: []xrayclient.Folder{
			{ID: "/Login", ParentID: nil, Name: "Login"},
			{ID: "/Login/Happy Path", ParentID: strPtr("/Login"), Name: "Happy Path"},
			{ID: "/Checkout", ParentID: nil, Name: "Checkout"},
		},
		testsByFolder: map[string][]xrayclient.Test{
			"/Login/Happy Path": {{Key: "XRAY-1", Summary: "Login with valid credentials", TestType: "Manual"}},
		},
	}

	plan, err := BuildXrayPlan(context.Background(), xr)
	if err != nil {
		t.Fatalf("BuildXrayPlan: %v", err)
	}
	if len(plan.Suites) != 2 {
		t.Fatalf("plan.Suites = %+v, want 2 top-level folders", plan.Suites)
	}
	byName := map[string]*folderPlan{}
	for _, s := range plan.Suites {
		byName[s.Name] = s
	}
	login := byName["Login"]
	if login == nil || len(login.Children) != 1 || login.Children[0].Name != "Happy Path" {
		t.Fatalf("Login folder = %+v, want one Happy Path child", login)
	}
	if len(login.Children[0].Cases) != 1 || login.Children[0].Cases[0].Title != "Login with valid credentials" {
		t.Fatalf("Happy Path cases = %+v", login.Children[0].Cases)
	}
}

func TestBuildXrayPlanManualStepsMapInOrder(t *testing.T) {
	xr := &fakeXray{
		folders: []xrayclient.Folder{{ID: "/Login", ParentID: nil, Name: "Login"}},
		testsByFolder: map[string][]xrayclient.Test{
			"/Login": {{Key: "XRAY-1", Summary: "Login test", Description: "Jira description", TestType: "Manual"}},
		},
		stepsByKey: map[string][]xrayclient.TestStep{
			"XRAY-1": {
				{Action: "Open login page", Data: "", Result: "Page loads"},
				{Action: "Enter credentials", Data: "user/pass", Result: "Logged in"},
			},
		},
	}

	plan, err := BuildXrayPlan(context.Background(), xr)
	if err != nil {
		t.Fatalf("BuildXrayPlan: %v", err)
	}
	cp := plan.Suites[0].Cases[0]
	if len(cp.Steps) != 2 {
		t.Fatalf("cp.Steps = %+v, want 2", cp.Steps)
	}
	if cp.Steps[1].Action != "Enter credentials\n\nTest data: user/pass" || cp.Steps[1].Expected != "Logged in" {
		t.Errorf("cp.Steps[1] = %+v", cp.Steps[1])
	}
	if cp.Description != "Jira description" {
		t.Errorf("Description = %q, want the Jira description unchanged", cp.Description)
	}
}

func TestBuildXrayPlanNonManualDefinitionBecomesDescriptionWithNoSteps(t *testing.T) {
	xr := &fakeXray{
		folders: []xrayclient.Folder{{ID: "/Login", ParentID: nil, Name: "Login"}},
		testsByFolder: map[string][]xrayclient.Test{
			"/Login": {{Key: "XRAY-2", Summary: "Cucumber login test", TestType: "Cucumber", Definition: "Scenario: Login\n  Given ...\n  Then ..."}},
		},
	}

	plan, err := BuildXrayPlan(context.Background(), xr)
	if err != nil {
		t.Fatalf("BuildXrayPlan: %v", err)
	}
	cp := plan.Suites[0].Cases[0]
	if len(cp.Steps) != 0 {
		t.Errorf("cp.Steps = %+v, want none (no structured steps)", cp.Steps)
	}
	if !strings.Contains(cp.Description, "Scenario: Login") {
		t.Errorf("Description = %q, want it to include the Gherkin scenario", cp.Description)
	}
}

func TestBuildXrayPlanCustomFieldMapping(t *testing.T) {
	xr := &fakeXray{
		folders: []xrayclient.Folder{{ID: "/Login", ParentID: nil, Name: "Login"}},
		testsByFolder: map[string][]xrayclient.Test{
			"/Login": {
				{Key: "XRAY-1", Summary: "Case A", CustomFields: map[string]any{"customfield_10010": "High"}},
				{Key: "XRAY-2", Summary: "Case B", CustomFields: map[string]any{"customfield_10020": map[string]any{"value": "Manual"}}},
			},
		},
	}

	plan, err := BuildXrayPlan(context.Background(), xr)
	if err != nil {
		t.Fatalf("BuildXrayPlan: %v", err)
	}
	caseA := plan.Suites[0].Cases[0]
	if caseA.CustomFields["customfield_10010"] != "High" {
		t.Errorf("caseA.CustomFields = %+v, want customfield_10010=High", caseA.CustomFields)
	}
	if len(plan.Unmapped) != 1 || plan.Unmapped[0] != "customfield_10020" {
		t.Errorf("plan.Unmapped = %+v, want one entry naming the non-string field", plan.Unmapped)
	}

	tp := &fakeTestPulse{rootFolderID: "root"}
	if err := execute(context.Background(), tp, "QA", plan, nil); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(tp.createdFields) != 1 || tp.createdFields[0].Name != "customfield_10010" {
		t.Fatalf("created fields = %+v, want exactly 1 string-valued field", tp.createdFields)
	}
}

func TestRunXrayDryRunMakesZeroTestPulseWriteCalls(t *testing.T) {
	xr := &fakeXray{
		folders: []xrayclient.Folder{{ID: "/Login", ParentID: nil, Name: "Login"}},
		testsByFolder: map[string][]xrayclient.Test{
			"/Login": {{Key: "XRAY-1", Summary: "Case A"}},
		},
	}
	tp := &fakeTestPulse{rootFolderID: "root", failOnAnyMethod: true}

	report, err := RunXray(context.Background(), xr, tp, "QA", true, nil)
	if err != nil {
		t.Fatalf("RunXray: %v", err)
	}
	if report.Counts["folders"] != 1 || report.Counts["cases"] != 1 {
		t.Errorf("report.Counts = %+v, want 1 folder + 1 case", report.Counts)
	}
	if len(tp.createdFolders) != 0 || len(tp.createdCases) != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%+v cases=%+v", tp.createdFolders, tp.createdCases)
	}
}
