// Package importer ties testrailclient and testpulseclient together via
// the mapping rules from add-testrail-importer design.md D6/D7: TestRail
// Suite -> top-level Folder, Section -> nested Folder (preserving
// TestRail's hierarchy), Case -> Case; a text/select-typed custom field
// maps and is reused across cases in the same import, anything else is
// dropped and named individually in the report, never silently.
//
// BuildPlan is a read-only crawl of TestRail — it never touches
// TestPulseWriter. Only Execute (called from Run when mode isn't dry-run)
// performs writes, which is what makes a dry-run's "zero TestPulse writes"
// guarantee (spec.md) structural rather than a runtime flag threaded
// through every write call.
package importer

import (
	"context"
	"fmt"
	"strconv"

	"github.com/Barayo/TestPulse/tools/import-connector/internal/kiwitcmsclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/qaseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testrailclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/zephyrscaleclient"
)

// TestRail custom field type ids (get_case_fields' type_id) that map onto
// TestPulse's text/select custom field types (design.md D7). Every other
// type id (Integer, User, Date, Milestone, Steps, Status, Checkbox, URL,
// Multi-select, ...) has no TestPulse equivalent and is dropped.
const (
	trFieldTypeString   = 1
	trFieldTypeText     = 3
	trFieldTypeDropdown = 6
)

func mapFieldType(typeID int) (fieldType string, ok bool) {
	switch typeID {
	case trFieldTypeString, trFieldTypeText:
		return "text", true
	case trFieldTypeDropdown:
		return "select", true
	default:
		return "", false
	}
}

// Qase custom field type strings (get_custom_fields' "type") that map
// onto TestPulse's text/select custom field types (design.md D-Q4).
// Every other type ("number", "checkbox", "multiselect", "url", "user",
// "datetime") has no TestPulse equivalent and is dropped.
func mapQaseFieldType(fieldType string) (string, bool) {
	switch fieldType {
	case "string", "text":
		return "text", true
	case "selectbox", "radio":
		return "select", true
	default:
		return "", false
	}
}

// TestRailReader is the read-only subset of *testrailclient.Client this
// package needs — satisfied structurally, so tests can supply a fake.
type TestRailReader interface {
	ListSuites(ctx context.Context, projectID int) ([]testrailclient.Suite, error)
	ListSections(ctx context.Context, projectID, suiteID int) ([]testrailclient.Section, error)
	ListCases(ctx context.Context, projectID, suiteID int) ([]testrailclient.Case, error)
	ListCaseFields(ctx context.Context) ([]testrailclient.CaseField, error)
}

// QaseReader is the read-only subset of *qaseclient.Client this package
// needs — satisfied structurally, so tests can supply a fake.
type QaseReader interface {
	ListSuites(ctx context.Context, projectCode string) ([]qaseclient.Suite, error)
	ListCases(ctx context.Context, projectCode string) ([]qaseclient.Case, error)
	ListCaseFields(ctx context.Context) ([]qaseclient.CustomField, error)
}

// ZephyrScaleReader is the read-only subset of *zephyrscaleclient.Client
// this package needs — satisfied structurally, so tests can supply a fake.
type ZephyrScaleReader interface {
	ListFolders(ctx context.Context, projectKey string) ([]zephyrscaleclient.Folder, error)
	ListTestCases(ctx context.Context, projectKey string) ([]zephyrscaleclient.Case, error)
	ListTestSteps(ctx context.Context, testCaseKey string) ([]zephyrscaleclient.TestStep, error)
	GetTestScript(ctx context.Context, testCaseKey string) (*zephyrscaleclient.TestScript, error)
}

// KiwiTCMSReader is the read-only subset of *kiwitcmsclient.Client this
// package needs — satisfied structurally, so tests can supply a fake.
type KiwiTCMSReader interface {
	FindProduct(ctx context.Context, name string) (kiwitcmsclient.Product, error)
	ListTestPlans(ctx context.Context, productID int) ([]kiwitcmsclient.TestPlan, error)
	ListTestCases(ctx context.Context, planID int) ([]kiwitcmsclient.TestCase, error)
	ListProperties(ctx context.Context, caseID int) ([]kiwitcmsclient.Property, error)
}

// TestPulseWriter is the write subset of *testpulseclient.Client this
// package needs — satisfied structurally, so tests can supply a fake that
// asserts it is never called during a dry run.
type TestPulseWriter interface {
	RootFolderID(ctx context.Context, projectKey string) (string, error)
	CreateFolder(ctx context.Context, projectKey, name, parentFolderID string) (testpulseclient.Folder, error)
	CreateCase(ctx context.Context, projectKey string, input testpulseclient.NewCase) (testpulseclient.Case, error)
	CreateCustomField(ctx context.Context, projectKey, name, fieldType string) (testpulseclient.CustomField, error)
	AddCustomFieldOption(ctx context.Context, fieldID, value string) (testpulseclient.CustomFieldOption, error)
}

// stepPlan is a source-agnostic case step — the mapping target for both
// TestRail's Content/Expected and Qase's Action/Expected shapes.
type stepPlan struct {
	Action   string
	Expected string
}

// casePlan is a source case pared down to what execute needs: its
// title/steps, and only the custom field values whose type is mappable
// (a source-specific field key -> raw source value; TestRail's is the
// field's system_name, Qase's is the field's numeric id as a string,
// Zephyr Scale's is the field's own name). Description is empty for
// TestRail/Qase (they never populate it); Zephyr Scale populates it for a
// script-only case with no step-by-step steps (design.md D-Z3).
type casePlan struct {
	Title        string
	Description  string
	Steps        []stepPlan
	CustomFields map[string]string
}

// folderPlan is one node of the Suite/Section folder hierarchy —
// top-level nodes are suites, every descendant is a section.
type folderPlan struct {
	Name     string
	Cases    []casePlan
	Children []*folderPlan
}

// Plan is BuildPlan's read-only result: the folder hierarchy plus the
// deduped field-mapping metadata Execute needs to create/reuse custom
// fields as it walks the same hierarchy. RootCases holds cases with no
// folder at all (Zephyr Scale only, design.md D-Z2 — TestRail/Qase never
// populate it) — created directly under the project's root folder rather
// than inside any folderPlan node.
type Plan struct {
	Suites      []*folderPlan
	RootCases   []casePlan
	Unmapped    []string
	fieldTypes  map[string]string // source field key -> "text"/"select", mappable only
	fieldLabels map[string]string // source field key -> human label
}

// BuildPlan crawls a TestRail project's full suite/section/case structure
// and its site-wide custom field metadata, producing the folder hierarchy
// design.md D6 describes plus the unmapped-field list D7 requires — purely
// from TestRail reads, no TestPulseWriter involved.
func BuildPlan(ctx context.Context, tr TestRailReader, testRailProjectID int) (Plan, error) {
	fieldsMeta, err := tr.ListCaseFields(ctx)
	if err != nil {
		return Plan{}, fmt.Errorf("listing TestRail case fields: %w", err)
	}
	plan := Plan{
		Unmapped:    []string{},
		fieldTypes:  map[string]string{},
		fieldLabels: map[string]string{},
	}
	for _, f := range fieldsMeta {
		plan.fieldLabels[f.SystemName] = f.Label
		if ft, ok := mapFieldType(f.TypeID); ok {
			plan.fieldTypes[f.SystemName] = ft
		}
	}

	suites, err := tr.ListSuites(ctx, testRailProjectID)
	if err != nil {
		return Plan{}, fmt.Errorf("listing TestRail suites: %w", err)
	}

	unmappedSeen := map[string]bool{}
	for _, suite := range suites {
		sections, err := tr.ListSections(ctx, testRailProjectID, suite.ID)
		if err != nil {
			return Plan{}, fmt.Errorf("listing sections for suite %d: %w", suite.ID, err)
		}
		cases, err := tr.ListCases(ctx, testRailProjectID, suite.ID)
		if err != nil {
			return Plan{}, fmt.Errorf("listing cases for suite %d: %w", suite.ID, err)
		}

		casesBySection := map[int][]testrailclient.Case{}
		for _, c := range cases {
			casesBySection[c.SectionID] = append(casesBySection[c.SectionID], c)
		}
		const rootParent = 0
		childrenByParent := map[int][]testrailclient.Section{}
		for _, s := range sections {
			parent := rootParent
			if s.ParentID != nil {
				parent = *s.ParentID
			}
			childrenByParent[parent] = append(childrenByParent[parent], s)
		}

		var buildFolder func(sectionID int, name string) *folderPlan
		buildFolder = func(sectionID int, name string) *folderPlan {
			fp := &folderPlan{Name: name}
			for _, c := range casesBySection[sectionID] {
				cp := casePlan{Title: c.Title, Steps: toStepPlanFromTestRail(c.Steps), CustomFields: map[string]string{}}
				for key, value := range c.CustomFields {
					if _, mappable := plan.fieldTypes[key]; mappable {
						cp.CustomFields[key] = value
						continue
					}
					label := plan.fieldLabels[key]
					if label == "" {
						label = key
					}
					if !unmappedSeen[label] {
						unmappedSeen[label] = true
						plan.Unmapped = append(plan.Unmapped, label)
					}
				}
				fp.Cases = append(fp.Cases, cp)
			}
			for _, child := range childrenByParent[sectionID] {
				fp.Children = append(fp.Children, buildFolder(child.ID, child.Name))
			}
			return fp
		}

		suiteFolder := &folderPlan{Name: suite.Name}
		for _, root := range childrenByParent[rootParent] {
			suiteFolder.Children = append(suiteFolder.Children, buildFolder(root.ID, root.Name))
		}
		plan.Suites = append(plan.Suites, suiteFolder)
	}

	return plan, nil
}

// countEntities walks the plan's folder tree, counting every folder
// (suite + section) and case it describes — used for both the dry-run
// report and the real-run progress total.
func countEntities(plan Plan) map[string]int {
	counts := map[string]int{"folders": 0, "cases": 0}
	var walk func(fp *folderPlan)
	walk = func(fp *folderPlan) {
		counts["folders"]++
		counts["cases"] += len(fp.Cases)
		for _, child := range fp.Children {
			walk(child)
		}
	}
	for _, suite := range plan.Suites {
		walk(suite)
	}
	counts["cases"] += len(plan.RootCases)
	return counts
}

func toStepPlanFromTestRail(steps []testrailclient.Step) []stepPlan {
	if len(steps) == 0 {
		return nil
	}
	out := make([]stepPlan, len(steps))
	for i, s := range steps {
		out[i] = stepPlan{Action: s.Content, Expected: s.Expected}
	}
	return out
}

func toStepPlanFromQase(steps []qaseclient.Step) []stepPlan {
	if len(steps) == 0 {
		return nil
	}
	out := make([]stepPlan, len(steps))
	for i, s := range steps {
		out[i] = stepPlan{Action: s.Action, Expected: s.Expected}
	}
	return out
}

func toTestPulseSteps(steps []stepPlan) []testpulseclient.Step {
	if len(steps) == 0 {
		return nil
	}
	out := make([]testpulseclient.Step, len(steps))
	for i, s := range steps {
		out[i] = testpulseclient.Step{Action: s.Action, Expected: s.Expected}
	}
	return out
}

// execute walks a Plan depth-first, creating each folder (parent always
// before its children) and the cases within it, creating/reusing custom
// fields and select options as it goes. Called only for a real-mode run —
// a dry run never calls this at all.
func execute(ctx context.Context, tp TestPulseWriter, projectKey string, plan Plan, progress func(current, total int)) error {
	rootFolderID, err := tp.RootFolderID(ctx, projectKey)
	if err != nil {
		return fmt.Errorf("resolving project root folder: %w", err)
	}

	fieldIDs := map[string]string{}             // source field key -> TestPulse field id
	optionIDs := map[string]map[string]string{} // TestPulse field id -> raw source value -> option id
	total := countEntities(plan)["cases"]
	current := 0

	createCase := func(folderID string, cp casePlan) error {
		customFields := map[string]string{}
		for systemName, rawValue := range cp.CustomFields {
			fieldID, ok := fieldIDs[systemName]
			if !ok {
				label := plan.fieldLabels[systemName]
				if label == "" {
					label = systemName
				}
				created, err := tp.CreateCustomField(ctx, projectKey, label, plan.fieldTypes[systemName])
				if err != nil {
					return fmt.Errorf("creating custom field %q: %w", label, err)
				}
				fieldID = created.ID
				fieldIDs[systemName] = fieldID
			}

			value := rawValue
			if plan.fieldTypes[systemName] == "select" {
				if optionIDs[fieldID] == nil {
					optionIDs[fieldID] = map[string]string{}
				}
				optionID, ok := optionIDs[fieldID][rawValue]
				if !ok {
					createdOpt, err := tp.AddCustomFieldOption(ctx, fieldID, rawValue)
					if err != nil {
						return fmt.Errorf("adding custom field option %q: %w", rawValue, err)
					}
					optionID = createdOpt.ID
					optionIDs[fieldID][rawValue] = optionID
				}
				value = optionID
			}
			customFields[fieldID] = value
		}

		if _, err := tp.CreateCase(ctx, projectKey, testpulseclient.NewCase{
			Title:        cp.Title,
			Description:  cp.Description,
			FolderID:     folderID,
			Steps:        toTestPulseSteps(cp.Steps),
			CustomFields: customFields,
		}); err != nil {
			return fmt.Errorf("creating case %q: %w", cp.Title, err)
		}
		current++
		if progress != nil {
			progress(current, total)
		}
		return nil
	}

	var walk func(fp *folderPlan, parentFolderID string) error
	walk = func(fp *folderPlan, parentFolderID string) error {
		folder, err := tp.CreateFolder(ctx, projectKey, fp.Name, parentFolderID)
		if err != nil {
			return fmt.Errorf("creating folder %q: %w", fp.Name, err)
		}

		for _, cp := range fp.Cases {
			if err := createCase(folder.ID, cp); err != nil {
				return err
			}
		}

		for _, child := range fp.Children {
			if err := walk(child, folder.ID); err != nil {
				return err
			}
		}
		return nil
	}

	for _, suiteFolder := range plan.Suites {
		if err := walk(suiteFolder, rootFolderID); err != nil {
			return err
		}
	}
	for _, cp := range plan.RootCases {
		if err := createCase(rootFolderID, cp); err != nil {
			return err
		}
	}
	return nil
}

// Report is the per-entity created counts plus individually-named
// unmapped fields — mirrors testpulseclient.ImportReport / apps/api's
// domain.ImportReport.
type Report struct {
	Counts   map[string]int
	Unmapped []string
}

// Run crawls testRailProjectID via tr and, unless dryRun, writes the
// resulting folder/case structure into TestPulse project projectKey via
// tp. progress (optional) is called after each case is created in real
// mode; it is never called during a dry run, since nothing is created.
func Run(ctx context.Context, tr TestRailReader, tp TestPulseWriter, projectKey string, testRailProjectID int, dryRun bool, progress func(current, total int)) (Report, error) {
	plan, err := BuildPlan(ctx, tr, testRailProjectID)
	if err != nil {
		return Report{}, err
	}
	report := Report{Counts: countEntities(plan), Unmapped: plan.Unmapped}
	if dryRun {
		return report, nil
	}
	if err := execute(ctx, tp, projectKey, plan, progress); err != nil {
		return report, err
	}
	return report, nil
}

// BuildQasePlan crawls a Qase project's full suite/case structure and its
// site-wide custom field metadata, producing the folder hierarchy
// design.md D-Q3 describes plus the unmapped-field list D-Q4 requires —
// purely from Qase reads, no TestPulseWriter involved. Unlike TestRail,
// Qase has a single suite tree per project (no separate suite/section
// levels): each root suite (ParentID == nil) becomes a top-level folder,
// and each child suite nests beneath its parent's mapped folder,
// recursively.
func BuildQasePlan(ctx context.Context, qr QaseReader, projectCode string) (Plan, error) {
	fieldsMeta, err := qr.ListCaseFields(ctx)
	if err != nil {
		return Plan{}, fmt.Errorf("listing Qase case fields: %w", err)
	}
	plan := Plan{
		Unmapped:    []string{},
		fieldTypes:  map[string]string{},
		fieldLabels: map[string]string{},
	}
	for _, f := range fieldsMeta {
		key := strconv.Itoa(f.ID)
		plan.fieldLabels[key] = f.Title
		if ft, ok := mapQaseFieldType(f.Type); ok {
			plan.fieldTypes[key] = ft
		}
	}

	suites, err := qr.ListSuites(ctx, projectCode)
	if err != nil {
		return Plan{}, fmt.Errorf("listing Qase suites: %w", err)
	}
	cases, err := qr.ListCases(ctx, projectCode)
	if err != nil {
		return Plan{}, fmt.Errorf("listing Qase cases: %w", err)
	}

	casesBySuite := map[int][]qaseclient.Case{}
	for _, c := range cases {
		casesBySuite[c.SuiteID] = append(casesBySuite[c.SuiteID], c)
	}
	childrenByParent := map[int][]qaseclient.Suite{}
	var roots []qaseclient.Suite
	for _, s := range suites {
		if s.ParentID == nil {
			roots = append(roots, s)
			continue
		}
		childrenByParent[*s.ParentID] = append(childrenByParent[*s.ParentID], s)
	}

	unmappedSeen := map[string]bool{}
	var buildFolder func(suite qaseclient.Suite) *folderPlan
	buildFolder = func(suite qaseclient.Suite) *folderPlan {
		fp := &folderPlan{Name: suite.Title}
		for _, c := range casesBySuite[suite.ID] {
			cp := casePlan{Title: c.Title, Steps: toStepPlanFromQase(c.Steps), CustomFields: map[string]string{}}
			for _, cfv := range c.CustomFields {
				key := strconv.Itoa(cfv.ID)
				if _, mappable := plan.fieldTypes[key]; mappable {
					cp.CustomFields[key] = cfv.Value
					continue
				}
				label := plan.fieldLabels[key]
				if label == "" {
					label = key
				}
				if !unmappedSeen[label] {
					unmappedSeen[label] = true
					plan.Unmapped = append(plan.Unmapped, label)
				}
			}
			fp.Cases = append(fp.Cases, cp)
		}
		for _, child := range childrenByParent[suite.ID] {
			fp.Children = append(fp.Children, buildFolder(child))
		}
		return fp
	}

	for _, root := range roots {
		plan.Suites = append(plan.Suites, buildFolder(root))
	}

	return plan, nil
}

// RunQase crawls a Qase project (projectCode) via qr and, unless dryRun,
// writes the resulting folder/case structure into TestPulse project
// projectKey via tp — the Qase counterpart to Run, sharing the same
// execute/Report/dry-run-never-writes machinery.
func RunQase(ctx context.Context, qr QaseReader, tp TestPulseWriter, projectKey, projectCode string, dryRun bool, progress func(current, total int)) (Report, error) {
	plan, err := BuildQasePlan(ctx, qr, projectCode)
	if err != nil {
		return Report{}, err
	}
	report := Report{Counts: countEntities(plan), Unmapped: plan.Unmapped}
	if dryRun {
		return report, nil
	}
	if err := execute(ctx, tp, projectKey, plan, progress); err != nil {
		return report, err
	}
	return report, nil
}

// zephyrScaleScriptLabel identifies which of Zephyr Scale's two freeform
// script types (design.md D-Z3) a case's preserved procedure text came
// from, since neither reads clearly as a "step" on its own.
func zephyrScaleScriptLabel(scriptType string) string {
	if scriptType == "bdd" {
		return "Zephyr Scale BDD script"
	}
	return "Zephyr Scale test script"
}

// toZephyrScaleCasePlan resolves one Zephyr Scale case's steps/script and
// custom fields into a casePlan (design.md D-Z3/D-Z5): step-by-step steps
// map directly (test data appended to the action text, delegate/"call to
// test" steps skipped); absent those, a plain-text or BDD script's text is
// preserved in Description instead of being dropped; a custom field whose
// raw value is a JSON string maps to TestPulse text, anything else is
// dropped and named in plan.Unmapped (deduped across cases by the caller's
// unmappedSeen set).
func toZephyrScaleCasePlan(ctx context.Context, zr ZephyrScaleReader, c zephyrscaleclient.Case, plan *Plan, unmappedSeen map[string]bool) (casePlan, error) {
	cp := casePlan{Title: c.Name, CustomFields: map[string]string{}}

	steps, err := zr.ListTestSteps(ctx, c.Key)
	if err != nil {
		return casePlan{}, fmt.Errorf("listing steps for case %s: %w", c.Key, err)
	}
	for _, s := range steps {
		if s.IsDelegate {
			continue
		}
		action := s.Description
		if s.TestData != "" {
			action += "\n\nTest data: " + s.TestData
		}
		cp.Steps = append(cp.Steps, stepPlan{Action: action, Expected: s.ExpectedResult})
	}

	if len(cp.Steps) == 0 && c.HasTestScript {
		script, err := zr.GetTestScript(ctx, c.Key)
		if err != nil {
			return casePlan{}, fmt.Errorf("fetching test script for case %s: %w", c.Key, err)
		}
		if script != nil {
			cp.Description = zephyrScaleScriptLabel(script.Type) + ":\n\n" + script.Text
		}
	}

	for name, raw := range c.CustomFields {
		s, ok := raw.(string)
		if !ok {
			if !unmappedSeen[name] {
				unmappedSeen[name] = true
				plan.Unmapped = append(plan.Unmapped, name)
			}
			continue
		}
		plan.fieldTypes[name] = "text"
		plan.fieldLabels[name] = name
		cp.CustomFields[name] = s
	}

	return cp, nil
}

// BuildZephyrScalePlan crawls a Zephyr Scale project's TEST_CASE-type
// folder tree and its cases, producing the folder hierarchy design.md D-Z2
// describes plus the unmapped-field list D-Z5 requires — purely from
// Zephyr Scale reads, no TestPulseWriter involved. A folder with a nil
// ParentID is top-level; every other folder nests beneath its parent's
// mapped folder, recursively. A case with no folder at all lands in
// plan.RootCases instead of any folderPlan (design.md D-Z2).
func BuildZephyrScalePlan(ctx context.Context, zr ZephyrScaleReader, projectKey string) (Plan, error) {
	folders, err := zr.ListFolders(ctx, projectKey)
	if err != nil {
		return Plan{}, fmt.Errorf("listing Zephyr Scale folders: %w", err)
	}
	cases, err := zr.ListTestCases(ctx, projectKey)
	if err != nil {
		return Plan{}, fmt.Errorf("listing Zephyr Scale test cases: %w", err)
	}

	plan := Plan{
		Unmapped:    []string{},
		fieldTypes:  map[string]string{},
		fieldLabels: map[string]string{},
	}

	childrenByParent := map[int][]zephyrscaleclient.Folder{}
	var roots []zephyrscaleclient.Folder
	for _, f := range folders {
		if f.ParentID == nil {
			roots = append(roots, f)
			continue
		}
		childrenByParent[*f.ParentID] = append(childrenByParent[*f.ParentID], f)
	}

	casesByFolder := map[int][]zephyrscaleclient.Case{}
	var rootCasesSrc []zephyrscaleclient.Case
	for _, c := range cases {
		if c.FolderID == nil {
			rootCasesSrc = append(rootCasesSrc, c)
			continue
		}
		casesByFolder[*c.FolderID] = append(casesByFolder[*c.FolderID], c)
	}

	unmappedSeen := map[string]bool{}
	var buildFolder func(f zephyrscaleclient.Folder) (*folderPlan, error)
	buildFolder = func(f zephyrscaleclient.Folder) (*folderPlan, error) {
		fp := &folderPlan{Name: f.Name}
		for _, c := range casesByFolder[f.ID] {
			cp, err := toZephyrScaleCasePlan(ctx, zr, c, &plan, unmappedSeen)
			if err != nil {
				return nil, err
			}
			fp.Cases = append(fp.Cases, cp)
		}
		for _, child := range childrenByParent[f.ID] {
			childPlan, err := buildFolder(child)
			if err != nil {
				return nil, err
			}
			fp.Children = append(fp.Children, childPlan)
		}
		return fp, nil
	}

	for _, root := range roots {
		fp, err := buildFolder(root)
		if err != nil {
			return Plan{}, err
		}
		plan.Suites = append(plan.Suites, fp)
	}

	for _, c := range rootCasesSrc {
		cp, err := toZephyrScaleCasePlan(ctx, zr, c, &plan, unmappedSeen)
		if err != nil {
			return Plan{}, err
		}
		plan.RootCases = append(plan.RootCases, cp)
	}

	return plan, nil
}

// RunZephyrScale crawls a Zephyr Scale project (zephyrScaleProjectKey) via
// zr and, unless dryRun, writes the resulting folder/case structure into
// TestPulse project projectKey via tp — the Zephyr Scale counterpart to
// Run/RunQase, sharing the same execute/Report/dry-run-never-writes
// machinery.
func RunZephyrScale(ctx context.Context, zr ZephyrScaleReader, tp TestPulseWriter, projectKey, zephyrScaleProjectKey string, dryRun bool, progress func(current, total int)) (Report, error) {
	plan, err := BuildZephyrScalePlan(ctx, zr, zephyrScaleProjectKey)
	if err != nil {
		return Report{}, err
	}
	report := Report{Counts: countEntities(plan), Unmapped: plan.Unmapped}
	if dryRun {
		return report, nil
	}
	if err := execute(ctx, tp, projectKey, plan, progress); err != nil {
		return report, err
	}
	return report, nil
}

// toKiwiTCMSCasePlan resolves one Kiwi TCMS case's text and properties
// into a casePlan (design.md D-K5/D-K6): the case's freeform text (Kiwi
// TCMS has no structured step concept at all) is preserved in Description
// rather than force-fit into a fake step; every property maps to a
// TestPulse text custom field, since Kiwi TCMS properties are untyped
// name/value pairs with no downgrade-or-drop decision to make.
func toKiwiTCMSCasePlan(ctx context.Context, kr KiwiTCMSReader, c kiwitcmsclient.TestCase, plan *Plan) (casePlan, error) {
	cp := casePlan{Title: c.Summary, Description: c.Text, CustomFields: map[string]string{}}

	props, err := kr.ListProperties(ctx, c.ID)
	if err != nil {
		return casePlan{}, fmt.Errorf("listing properties for case %d: %w", c.ID, err)
	}
	for _, p := range props {
		plan.fieldTypes[p.Name] = "text"
		plan.fieldLabels[p.Name] = p.Name
		cp.CustomFields[p.Name] = p.Value
	}

	return cp, nil
}

// BuildKiwiTCMSPlan crawls a Kiwi TCMS product's test plan tree and its
// cases, producing the folder hierarchy design.md D-K3 describes — purely
// from Kiwi TCMS reads, no TestPulseWriter involved. A test plan with a
// nil ParentID is top-level; every other plan nests beneath its parent's
// mapped folder, recursively. A case linked to more than one plan within
// the imported scope (a real many-to-many relationship in Kiwi TCMS,
// unlike every other source) is created once, in the first plan
// encountered by this depth-first walk — every such case is named
// individually in plan.Unmapped rather than duplicated or silently
// deduped (design.md D-K4).
func BuildKiwiTCMSPlan(ctx context.Context, kr KiwiTCMSReader, productName string) (Plan, error) {
	product, err := kr.FindProduct(ctx, productName)
	if err != nil {
		return Plan{}, fmt.Errorf("finding Kiwi TCMS product %q: %w", productName, err)
	}
	allPlans, err := kr.ListTestPlans(ctx, product.ID)
	if err != nil {
		return Plan{}, fmt.Errorf("listing Kiwi TCMS test plans: %w", err)
	}

	childrenByParent := map[int][]kiwitcmsclient.TestPlan{}
	var roots []kiwitcmsclient.TestPlan
	for _, p := range allPlans {
		if p.ParentID == nil {
			roots = append(roots, p)
			continue
		}
		childrenByParent[*p.ParentID] = append(childrenByParent[*p.ParentID], p)
	}

	plan := Plan{
		Unmapped:    []string{},
		fieldTypes:  map[string]string{},
		fieldLabels: map[string]string{},
	}
	placedCaseIDs := map[int]bool{}
	multiPlanNoted := map[int]bool{}

	var buildFolder func(p kiwitcmsclient.TestPlan) (*folderPlan, error)
	buildFolder = func(p kiwitcmsclient.TestPlan) (*folderPlan, error) {
		fp := &folderPlan{Name: p.Name}
		cases, err := kr.ListTestCases(ctx, p.ID)
		if err != nil {
			return nil, fmt.Errorf("listing cases for test plan %d: %w", p.ID, err)
		}
		for _, c := range cases {
			if placedCaseIDs[c.ID] {
				if !multiPlanNoted[c.ID] {
					multiPlanNoted[c.ID] = true
					plan.Unmapped = append(plan.Unmapped, fmt.Sprintf("%q (linked to multiple test plans; imported once)", c.Summary))
				}
				continue
			}
			placedCaseIDs[c.ID] = true
			cp, err := toKiwiTCMSCasePlan(ctx, kr, c, &plan)
			if err != nil {
				return nil, err
			}
			fp.Cases = append(fp.Cases, cp)
		}
		for _, child := range childrenByParent[p.ID] {
			childFp, err := buildFolder(child)
			if err != nil {
				return nil, err
			}
			fp.Children = append(fp.Children, childFp)
		}
		return fp, nil
	}

	for _, root := range roots {
		fp, err := buildFolder(root)
		if err != nil {
			return Plan{}, err
		}
		plan.Suites = append(plan.Suites, fp)
	}

	return plan, nil
}

// RunKiwiTCMS crawls a Kiwi TCMS product (kiwiProductName) via kr and,
// unless dryRun, writes the resulting folder/case structure into
// TestPulse project projectKey via tp — the Kiwi TCMS counterpart to
// Run/RunQase/RunZephyrScale, sharing the same execute/Report/dry-run-
// never-writes machinery.
func RunKiwiTCMS(ctx context.Context, kr KiwiTCMSReader, tp TestPulseWriter, projectKey, kiwiProductName string, dryRun bool, progress func(current, total int)) (Report, error) {
	plan, err := BuildKiwiTCMSPlan(ctx, kr, kiwiProductName)
	if err != nil {
		return Report{}, err
	}
	report := Report{Counts: countEntities(plan), Unmapped: plan.Unmapped}
	if dryRun {
		return report, nil
	}
	if err := execute(ctx, tp, projectKey, plan, progress); err != nil {
		return report, err
	}
	return report, nil
}
