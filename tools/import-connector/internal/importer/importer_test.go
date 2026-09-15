package importer

import (
	"context"
	"fmt"
	"testing"

	"github.com/Barayo/TestPulse/tools/import-connector/internal/qaseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testrailclient"
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
