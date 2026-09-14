package importer

import (
	"context"
	"fmt"
	"testing"

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
