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

// TestRailReader is the read-only subset of *testrailclient.Client this
// package needs — satisfied structurally, so tests can supply a fake.
type TestRailReader interface {
	ListSuites(ctx context.Context, projectID int) ([]testrailclient.Suite, error)
	ListSections(ctx context.Context, projectID, suiteID int) ([]testrailclient.Section, error)
	ListCases(ctx context.Context, projectID, suiteID int) ([]testrailclient.Case, error)
	ListCaseFields(ctx context.Context) ([]testrailclient.CaseField, error)
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

// casePlan is a TestRail case pared down to what Execute needs: its
// title/steps, and only the custom field values whose type is mappable
// (system_name -> raw TestRail value).
type casePlan struct {
	Title        string
	Steps        []testrailclient.Step
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
				cp := casePlan{Title: c.Title, Steps: c.Steps, CustomFields: map[string]string{}}
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

func toTestPulseSteps(steps []testrailclient.Step) []testpulseclient.Step {
	if len(steps) == 0 {
		return nil
	}
	out := make([]testpulseclient.Step, len(steps))
	for i, s := range steps {
		out[i] = testpulseclient.Step{Action: s.Content, Expected: s.Expected}
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
