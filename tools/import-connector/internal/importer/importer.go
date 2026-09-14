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

	"github.com/Barayo/TestPulse/tools/import-connector/internal/qaseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testrailclient"
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
// field's system_name, Qase's is the field's numeric id as a string).
type casePlan struct {
	Title        string
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
// fields as it walks the same hierarchy.
type Plan struct {
	Suites      []*folderPlan
	Unmapped    []string
	fieldTypes  map[string]string // TestRail system_name -> "text"/"select", mappable only
	fieldLabels map[string]string // TestRail system_name -> human label
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

	fieldIDs := map[string]string{}             // TestRail system_name -> TestPulse field id
	optionIDs := map[string]map[string]string{} // TestPulse field id -> raw TestRail value -> option id
	total := countEntities(plan)["cases"]
	current := 0

	var walk func(fp *folderPlan, parentFolderID string) error
	walk = func(fp *folderPlan, parentFolderID string) error {
		folder, err := tp.CreateFolder(ctx, projectKey, fp.Name, parentFolderID)
		if err != nil {
			return fmt.Errorf("creating folder %q: %w", fp.Name, err)
		}

		for _, cp := range fp.Cases {
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
				FolderID:     folder.ID,
				Steps:        toTestPulseSteps(cp.Steps),
				CustomFields: customFields,
			}); err != nil {
				return fmt.Errorf("creating case %q: %w", cp.Title, err)
			}
			current++
			if progress != nil {
				progress(current, total)
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
