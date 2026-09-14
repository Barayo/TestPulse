package domain

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestStatusValidation(t *testing.T) {
	for _, valid := range []string{"pending", "pass", "failed", "skipped", "blocked", "retest"} {
		if _, err := ParseStatus(valid); err != nil {
			t.Errorf("ParseStatus(%q) = %v, want nil", valid, err)
		}
	}
	for _, invalid := range []string{"", "bogus", "PASS", "done"} {
		if _, err := ParseStatus(invalid); err == nil {
			t.Errorf("ParseStatus(%q) = nil error, want error", invalid)
		}
	}
}

func TestVerdictValidation(t *testing.T) {
	for _, valid := range []string{"pass", "failed", "skipped", "blocked"} {
		if _, err := ParseVerdict(valid); err != nil {
			t.Errorf("ParseVerdict(%q) = %v, want nil", valid, err)
		}
	}
	// retest and pending are statuses, never verdicts.
	for _, invalid := range []string{"retest", "pending", "", "bogus"} {
		if _, err := ParseVerdict(invalid); err == nil {
			t.Errorf("ParseVerdict(%q) = nil error, want error", invalid)
		}
	}
}

func TestVerdictBecomesStatus(t *testing.T) {
	v, err := ParseVerdict("failed")
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Status(); got != StatusFailed {
		t.Errorf("verdict failed → status %q, want %q", got, StatusFailed)
	}
}

func TestStepResultValidation(t *testing.T) {
	valid := StepResult{StepIndex: 0, Verdict: VerdictPass}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid step result rejected: %v", err)
	}

	negativeIndex := StepResult{StepIndex: -1, Verdict: VerdictPass}
	err := negativeIndex.Validate()
	if err == nil {
		t.Fatal("step result with a negative index accepted")
	}
	if !strings.Contains(err.Error(), "index") {
		t.Errorf("error %q does not name the invalid index", err)
	}

	invalidVerdict := StepResult{StepIndex: 0, Verdict: "bogus"}
	err = invalidVerdict.Validate()
	if err == nil {
		t.Fatal("step result with an invalid verdict accepted")
	}
}

func TestCaseContentValidation(t *testing.T) {
	valid := CaseContent{Title: "Login works", Priority: PriorityMedium}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid content rejected: %v", err)
	}

	missingTitle := CaseContent{Priority: PriorityMedium}
	err := missingTitle.Validate()
	if err == nil {
		t.Fatal("content without title accepted")
	}
	if !strings.Contains(err.Error(), "title") {
		t.Errorf("error %q does not name the missing field", err)
	}

	badPriority := CaseContent{Title: "x", Priority: "urgent"}
	if err := badPriority.Validate(); err == nil {
		t.Error("invalid priority accepted")
	}
}

func TestCaseContentFormatValidation(t *testing.T) {
	unset := CaseContent{Title: "Login works", Priority: PriorityMedium}
	if err := unset.Validate(); err != nil {
		t.Errorf("content with no format rejected: %v", err)
	}
	if unset.Format != "" {
		t.Errorf("Format zero value = %q, want empty (defaulting happens at storage layer)", unset.Format)
	}

	for _, valid := range []Format{FormatSteps, FormatText, FormatGherkin} {
		c := CaseContent{Title: "x", Priority: PriorityMedium, Format: valid}
		if err := c.Validate(); err != nil {
			t.Errorf("Format %q rejected: %v", valid, err)
		}
	}

	badFormat := CaseContent{Title: "x", Priority: PriorityMedium, Format: "bogus"}
	err := badFormat.Validate()
	if err == nil {
		t.Fatal("invalid format accepted")
	}
	if !strings.Contains(err.Error(), "format") {
		t.Errorf("error %q does not name the invalid field", err)
	}
}

func TestStepGroupValidation(t *testing.T) {
	valid := StepGroup{Name: "Log in as admin", Steps: []Step{{Action: "open login page"}}}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid step group rejected: %v", err)
	}

	missingName := StepGroup{Steps: []Step{{Action: "x"}}}
	err := missingName.Validate()
	if err == nil {
		t.Fatal("step group without name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the missing field", err)
	}

	noSteps := StepGroup{Name: "Empty"}
	err = noSteps.Validate()
	if err == nil {
		t.Fatal("step group with zero steps accepted")
	}
	if !strings.Contains(err.Error(), "step") {
		t.Errorf("error %q does not name the missing steps", err)
	}

	missingAction := StepGroup{Name: "x", Steps: []Step{{Expected: "something happens"}}}
	err = missingAction.Validate()
	if err == nil {
		t.Fatal("step group with a step missing action accepted")
	}
	if !strings.Contains(err.Error(), "action") {
		t.Errorf("error %q does not name the missing action", err)
	}
}

func TestStepGroupRefRoundTripsThroughJSON(t *testing.T) {
	snapshotTime := time.Date(2026, 9, 8, 12, 0, 0, 0, time.UTC)
	step := Step{
		GroupRef: &StepGroupRef{GroupID: "sg1", GroupKey: "log-in-as-admin", SnapshotUpdatedAt: snapshotTime},
	}
	data, err := json.Marshal(step)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded Step
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.GroupRef == nil {
		t.Fatal("GroupRef = nil after round-trip, want non-nil")
	}
	if decoded.GroupRef.GroupID != "sg1" || decoded.GroupRef.GroupKey != "log-in-as-admin" {
		t.Errorf("GroupRef = %+v, want GroupID=sg1 GroupKey=log-in-as-admin", decoded.GroupRef)
	}
	if !decoded.GroupRef.SnapshotUpdatedAt.Equal(snapshotTime) {
		t.Errorf("SnapshotUpdatedAt = %v, want %v", decoded.GroupRef.SnapshotUpdatedAt, snapshotTime)
	}

	plain := Step{Action: "click submit"}
	data, err = json.Marshal(plain)
	if err != nil {
		t.Fatalf("marshal plain: %v", err)
	}
	if strings.Contains(string(data), "groupRef") {
		t.Errorf("plain step JSON = %s, want no groupRef key when unset", data)
	}
}

func TestReleaseValidation(t *testing.T) {
	valid := Release{Name: "2026.1", Status: ReleaseStatusActive}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid release rejected: %v", err)
	}

	missingName := Release{Status: ReleaseStatusActive}
	err := missingName.Validate()
	if err == nil {
		t.Fatal("release without a name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the missing field", err)
	}

	badStatus := Release{Name: "2026.1", Status: "shipped"}
	if err := badStatus.Validate(); err == nil {
		t.Error("invalid status accepted")
	}

	unset := Release{Name: "2026.1"}
	if err := unset.Validate(); err != nil {
		t.Errorf("release with no status rejected: %v", err)
	}
}

func TestCaseContentParametersValidation(t *testing.T) {
	valid := CaseContent{
		Title:  "Login works",
		Format: FormatSteps,
		Steps:  []Step{{Action: "Enter {username}", Expected: "{username} is accepted"}},
		Parameters: &CaseParameters{
			Columns: []string{"Name", "username"},
			Rows: []map[string]string{
				{"Name": "valid", "username": "admin@example.com"},
				{"Name": "invalid", "username": "nobody@example.com"},
			},
		},
	}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid parameterized content rejected: %v", err)
	}

	duplicateNames := valid
	duplicateNames.Parameters = &CaseParameters{
		Columns: []string{"Name", "username"},
		Rows: []map[string]string{
			{"Name": "valid", "username": "a@example.com"},
			{"Name": "valid", "username": "b@example.com"},
		},
	}
	err := duplicateNames.Validate()
	if err == nil {
		t.Fatal("duplicate row names accepted")
	}
	if !strings.Contains(err.Error(), "valid") {
		t.Errorf("error %q does not name the duplicated row", err)
	}

	unmatchedPlaceholder := valid
	unmatchedPlaceholder.Steps = []Step{{Action: "Enter {password}"}}
	err = unmatchedPlaceholder.Validate()
	if err == nil {
		t.Fatal("unmatched placeholder accepted")
	}
	if !strings.Contains(err.Error(), "password") {
		t.Errorf("error %q does not name the unmatched placeholder", err)
	}

	nonStepsFormat := valid
	nonStepsFormat.Format = FormatText
	if err := nonStepsFormat.Validate(); err == nil {
		t.Error("parameters on a non-steps format accepted")
	}

	missingNameColumn := valid
	missingNameColumn.Parameters = &CaseParameters{
		Columns: []string{"username"},
		Rows:    []map[string]string{{"username": "a@example.com"}},
	}
	if err := missingNameColumn.Validate(); err == nil {
		t.Error("parameter table missing a Name first column accepted")
	}

	duplicateColumns := valid
	duplicateColumns.Parameters = &CaseParameters{
		Columns: []string{"Name", "username", "username"},
		Rows:    []map[string]string{{"Name": "valid", "username": "a@example.com"}},
	}
	err = duplicateColumns.Validate()
	if err == nil {
		t.Fatal("duplicate column names accepted")
	}
	if !strings.Contains(err.Error(), "username") {
		t.Errorf("error %q does not name the duplicated column", err)
	}

	zeroRowsWithLiteralBraces := CaseContent{
		Title: "x",
		Steps: []Step{{Action: "Enter {anything}"}},
	}
	if err := zeroRowsWithLiteralBraces.Validate(); err != nil {
		t.Errorf("zero-row case with literal braces rejected: %v", err)
	}

	tooManyRows := valid
	rows := make([]map[string]string, maxParameterRows+1)
	for i := range rows {
		rows[i] = map[string]string{"Name": fmt.Sprintf("row%d", i), "username": "a@example.com"}
	}
	tooManyRows.Parameters = &CaseParameters{Columns: []string{"Name", "username"}, Rows: rows}
	if err := tooManyRows.Validate(); err == nil {
		t.Errorf("parameter table with %d rows accepted, want rejected above %d", len(rows), maxParameterRows)
	}

	tooManyColumns := valid
	columns := make([]string, maxParameterColumns+1)
	columns[0] = "Name"
	for i := 1; i < len(columns); i++ {
		columns[i] = fmt.Sprintf("col%d", i)
	}
	tooManyColumns.Parameters = &CaseParameters{Columns: columns, Rows: []map[string]string{{"Name": "x"}}}
	if err := tooManyColumns.Validate(); err == nil {
		t.Errorf("parameter table with %d columns accepted, want rejected above %d", len(columns), maxParameterColumns)
	}
}

func TestSubstituteParams(t *testing.T) {
	steps := []Step{
		{Action: "Enter {username} and {password}", Expected: "{username} is logged in"},
		{Action: "Click submit", Expected: "no placeholders here"},
	}
	row := map[string]string{"Name": "valid", "username": "admin", "password": "hunter2"}

	got := SubstituteParams(steps, row)

	if got[0].Action != "Enter admin and hunter2" {
		t.Errorf("Action = %q, want substituted", got[0].Action)
	}
	if got[0].Expected != "admin is logged in" {
		t.Errorf("Expected = %q, want substituted", got[0].Expected)
	}
	if got[1].Action != "Click submit" || got[1].Expected != "no placeholders here" {
		t.Errorf("step with no placeholders changed: %+v", got[1])
	}

	rowMissingValue := map[string]string{"Name": "partial", "username": "admin"}
	gotMissing := SubstituteParams([]Step{{Action: "Enter {username} / {password}"}}, rowMissingValue)
	if gotMissing[0].Action != "Enter admin / " {
		t.Errorf("Action with missing column value = %q, want empty substitution not a panic", gotMissing[0].Action)
	}
}

func TestRequirementValidation(t *testing.T) {
	valid := Requirement{Name: "Checkout supports guest users"}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid requirement rejected: %v", err)
	}

	missingName := Requirement{}
	err := missingName.Validate()
	if err == nil {
		t.Fatal("requirement without a name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the missing field", err)
	}
}

func TestTestPlanValidation(t *testing.T) {
	valid := TestPlan{Name: "iOS", ReleaseID: "rel-1"}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid test plan rejected: %v", err)
	}

	missingName := TestPlan{ReleaseID: "rel-1"}
	err := missingName.Validate()
	if err == nil {
		t.Fatal("test plan without a name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the missing field", err)
	}
}

func TestResultValidation(t *testing.T) {
	valid := NewResult{Actor: "ana", Verdict: VerdictPass}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid result rejected: %v", err)
	}

	// Actor is optional (link-result-actor-to-identity): the service
	// resolves it from the authenticated caller, not Validate().
	omittedActor := NewResult{Verdict: VerdictPass}
	if err := omittedActor.Validate(); err != nil {
		t.Errorf("result without actor rejected: %v", err)
	}

	badVerdict := NewResult{Actor: "ana", Verdict: "retest"}
	err := badVerdict.Validate()
	if err == nil {
		t.Fatal("invalid verdict accepted")
	}
}

func TestFolderNameRequired(t *testing.T) {
	if err := ValidateFolderName("Auth"); err != nil {
		t.Errorf("valid name rejected: %v", err)
	}
	err := ValidateFolderName("")
	if err == nil {
		t.Fatal("empty folder name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the field", err)
	}
}

// add-folder-slug-urls: a name that slugifies to nothing (emoji/punctuation
// only) would silently produce a meaningless URL segment if allowed, so
// it's rejected at validation time instead of given a fallback slug.
func TestFolderNameRejectsUnslugifiableName(t *testing.T) {
	err := ValidateFolderName("🎉🎉🎉")
	if err == nil {
		t.Fatal("name with no slugifiable characters accepted")
	}
}

// add-folder-slug-urls: once the sibling-uniqueness index exists, an
// unbounded name becomes an unbounded slug, which can fail Postgres's
// btree index row-size limit with a generic 500 rather than a clean 4xx —
// capped here instead so that failure mode is unreachable.
func TestFolderNameRejectsOverMaxLength(t *testing.T) {
	if err := ValidateFolderName(strings.Repeat("a", 255)); err != nil {
		t.Errorf("255-character name rejected: %v", err)
	}
	err := ValidateFolderName(strings.Repeat("a", 256))
	if err == nil {
		t.Fatal("256-character name accepted")
	}
}

func TestNewFolderRequiresParent(t *testing.T) {
	// A user can never directly create a root folder — only the DB trigger
	// creates roots, on project creation.
	valid := NewFolder{Name: "Auth", ParentFolderID: "root-id"}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid folder rejected: %v", err)
	}

	missingParent := NewFolder{Name: "Auth"}
	err := missingParent.Validate()
	if err == nil {
		t.Fatal("folder without a parent accepted")
	}
	if !strings.Contains(err.Error(), "parent") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestProjectNameRequired(t *testing.T) {
	if err := ValidateProjectName("QA Platform"); err != nil {
		t.Errorf("valid name rejected: %v", err)
	}
	err := ValidateProjectName("")
	if err == nil {
		t.Fatal("empty project name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestRoleHasPermission(t *testing.T) {
	// design.md D11: ten concrete, per-resource flags — the seeded roles
	// below reproduce the net permissions of the original three fixed
	// roles, just expressed via the finer-grained flags.
	tester := Role{Name: "Tester", CanRead: true, CanRunCreate: true, CanRunRecordResult: true}
	contributor := Role{
		Name: "Contributor", CanRead: true, CanRunCreate: true, CanRunRecordResult: true,
		CanCaseCreate: true, CanCaseEdit: true, CanSectionCreate: true, CanSuiteCreate: true, CanSuiteEditMembership: true,
	}
	projectAdmin := Role{
		Name: "Project Admin", CanRead: true, CanRunCreate: true, CanRunRecordResult: true,
		CanCaseCreate: true, CanCaseEdit: true, CanSectionCreate: true, CanSuiteCreate: true, CanSuiteEditMembership: true,
		CanCaseDelete: true, CanSectionDelete: true, CanManageProject: true,
	}

	if !tester.Has(PermRead) || !tester.Has(PermRunCreate) || !tester.Has(PermRunRecordResult) {
		t.Errorf("Tester = %+v, want read+runCreate+runRecordResult", tester)
	}
	if tester.Has(PermCaseCreate) || tester.Has(PermCaseDelete) || tester.Has(PermManageProject) {
		t.Errorf("Tester = %+v, want no caseCreate/caseDelete/manageProject", tester)
	}
	if !contributor.Has(PermCaseCreate) || !contributor.Has(PermSuiteEditMembership) {
		t.Errorf("Contributor = %+v, want caseCreate+suiteEditMembership", contributor)
	}
	if contributor.Has(PermCaseDelete) {
		t.Errorf("Contributor = %+v, want no caseDelete", contributor)
	}
	if !projectAdmin.Has(PermCaseDelete) || !projectAdmin.Has(PermManageProject) {
		t.Errorf("Project Admin = %+v, want caseDelete+manageProject", projectAdmin)
	}
}

func TestRoleHasRunDeleteAndProjectDelete(t *testing.T) {
	// design.md D3 (add-data-retention): two new flags, twelve total —
	// runDelete is not implied by runCreate/runRecordResult, and
	// projectDelete is kept separate from manageProject.
	projectAdmin := Role{Name: "Project Admin", CanManageProject: true, CanRunDelete: true, CanProjectDelete: true}
	contributor := Role{Name: "Contributor", CanRunCreate: true, CanRunRecordResult: true}

	if !projectAdmin.Has(PermRunDelete) || !projectAdmin.Has(PermProjectDelete) {
		t.Errorf("Project Admin = %+v, want runDelete+projectDelete", projectAdmin)
	}
	if contributor.Has(PermRunDelete) || contributor.Has(PermProjectDelete) {
		t.Errorf("Contributor = %+v, want no runDelete/projectDelete", contributor)
	}

	p := projectAdmin.Permissions()
	if !p.Has(PermRunDelete) || !p.Has(PermProjectDelete) {
		t.Errorf("Permissions() = %+v, want runDelete+projectDelete", p)
	}
}

func TestActorKindSystemIsAValidActorKind(t *testing.T) {
	// design.md D8 (add-data-retention): a third ActorKind, alongside
	// user/agent, for audit entries recorded by an unattended background
	// process rather than a resolved request-time actor.
	actor := Actor{Kind: ActorKindSystem, ID: "retention-worker"}
	if actor.Kind != ActorKind("system") {
		t.Errorf("ActorKindSystem = %q, want %q", actor.Kind, "system")
	}
}

func TestInstanceSettingsUpdateAppliesOnlyNonNilFields(t *testing.T) {
	// design.md D8: InstanceSettingsUpdate generalizes the previous
	// single-field (PublicProjectsEnabled-only) update into a partial
	// update carrying both settable fields.
	enabled := true
	days := 30
	upd := InstanceSettingsUpdate{PublicProjectsEnabled: &enabled, RunRetentionDays: &days}
	if upd.PublicProjectsEnabled == nil || *upd.PublicProjectsEnabled != true {
		t.Errorf("PublicProjectsEnabled = %v, want true", upd.PublicProjectsEnabled)
	}
	if upd.RunRetentionDays == nil || *upd.RunRetentionDays != 30 {
		t.Errorf("RunRetentionDays = %v, want 30", upd.RunRetentionDays)
	}

	settings := InstanceSettings{RunRetentionDays: 30}
	if settings.RunRetentionDays != 30 {
		t.Errorf("InstanceSettings.RunRetentionDays = %d, want 30", settings.RunRetentionDays)
	}
}

func TestInstanceSettingsCarriesAutoArchiveInactiveDays(t *testing.T) {
	// design.md D9 (add-data-retention): a third instance-wide threshold,
	// same 0-means-off convention as RunRetentionDays.
	days := 45
	upd := InstanceSettingsUpdate{AutoArchiveInactiveDays: &days}
	if upd.AutoArchiveInactiveDays == nil || *upd.AutoArchiveInactiveDays != 45 {
		t.Errorf("AutoArchiveInactiveDays = %v, want 45", upd.AutoArchiveInactiveDays)
	}

	settings := InstanceSettings{AutoArchiveInactiveDays: 45}
	if settings.AutoArchiveInactiveDays != 45 {
		t.Errorf("InstanceSettings.AutoArchiveInactiveDays = %d, want 45", settings.AutoArchiveInactiveDays)
	}
}

func TestProjectCarriesAutoArchiveExempt(t *testing.T) {
	// design.md D9: a Tenant-Admin-only exemption from the instance-wide
	// auto-archive policy.
	p := Project{AutoArchiveExempt: true}
	if !p.AutoArchiveExempt {
		t.Errorf("Project.AutoArchiveExempt = %v, want true", p.AutoArchiveExempt)
	}
}

func TestPermissionsUnionAcrossRoles(t *testing.T) {
	// A user holding two non-nested custom roles gets the union of both —
	// not just the "higher" one (design.md D10: there's no ordinal ranking
	// to pick a winner from once roles are fully custom).
	var perms Permissions
	roleA := Role{CanRead: true, CanCaseDelete: true}
	roleB := Role{CanRead: true, CanCaseCreate: true}
	for _, r := range []Role{roleA, roleB} {
		perms.Read = perms.Read || r.CanRead
		perms.CaseCreate = perms.CaseCreate || r.CanCaseCreate
		perms.CaseDelete = perms.CaseDelete || r.CanCaseDelete
	}
	if !perms.Has(PermCaseCreate) {
		t.Error("union should include CaseCreate from roleB")
	}
	if !perms.Has(PermCaseDelete) {
		t.Error("union should include CaseDelete from roleA")
	}
	if perms.Has(PermManageProject) {
		t.Error("union should not grant manageProject — neither role has it")
	}
}

// --- Scoped API tokens (backlog #117, design.md D1/D3) ---

func TestRolePermissionsConvertsFlags(t *testing.T) {
	r := Role{CanRead: true, CanCaseEdit: true, CanRunCreate: true}
	p := r.Permissions()
	if !p.Read || !p.CaseEdit || !p.RunCreate {
		t.Errorf("Permissions() = %+v, want Read/CaseEdit/RunCreate true", p)
	}
	if p.CaseCreate || p.CaseDelete || p.ManageProject {
		t.Errorf("Permissions() = %+v, want every unset role flag false", p)
	}
}

func TestPermissionsIsSubsetOf(t *testing.T) {
	broad := Permissions{Read: true, CaseCreate: true, CaseEdit: true, ManageProject: true}
	narrow := Permissions{Read: true, CaseEdit: true}
	if !narrow.IsSubsetOf(broad) {
		t.Error("narrow should be a subset of broad")
	}
	if broad.IsSubsetOf(narrow) {
		t.Error("broad should not be a subset of narrow — it grants CaseCreate/ManageProject narrow doesn't")
	}
	if !narrow.IsSubsetOf(narrow) {
		t.Error("a set is always a subset of itself")
	}
}

func TestPermissionsIntersect(t *testing.T) {
	roleGrants := Permissions{Read: true, CaseCreate: true, CaseEdit: true, RunCreate: true}
	creatorHas := Permissions{Read: true, CaseEdit: true, ManageProject: true}
	got := roleGrants.Intersect(creatorHas)
	want := Permissions{Read: true, CaseEdit: true} // only what's in both
	if got != want {
		t.Errorf("Intersect = %+v, want %+v", got, want)
	}
}

func TestRoleNameRequired(t *testing.T) {
	if err := ValidateRoleName("QA Reviewer"); err != nil {
		t.Errorf("valid name rejected: %v", err)
	}
	err := ValidateRoleName("")
	if err == nil {
		t.Fatal("empty role name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestTeamNameRequired(t *testing.T) {
	if err := ValidateTeamName("QA Core"); err != nil {
		t.Errorf("valid name rejected: %v", err)
	}
	err := ValidateTeamName("")
	if err == nil {
		t.Fatal("empty team name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestPasswordValidation(t *testing.T) {
	if err := ValidatePassword("longenoughpassword"); err != nil {
		t.Errorf("valid password rejected: %v", err)
	}
	// Exactly at the boundary must pass (backlog #118 — length-based
	// policy, NIST/OWASP current guidance favors length over forced
	// complexity rules).
	if err := ValidatePassword("twelvecharsx"); err != nil {
		t.Errorf("12-character password rejected: %v", err)
	}
	err := ValidatePassword("short")
	if err == nil {
		t.Fatal("password under 12 characters accepted")
	}
	if !strings.Contains(err.Error(), "12 characters") {
		t.Errorf("error %q does not explain the minimum length", err)
	}
}

func TestEmailRequired(t *testing.T) {
	if err := ValidateEmail("a@b.com"); err != nil {
		t.Errorf("valid email rejected: %v", err)
	}
	err := ValidateEmail("")
	if err == nil {
		t.Fatal("empty email accepted")
	}
	if !strings.Contains(err.Error(), "email") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestEmailFormatValidation(t *testing.T) {
	for _, valid := range []string{"a@b.com", "jane.doe+test@example.co.uk", "agent_1@sub.example.com"} {
		if err := ValidateEmail(valid); err != nil {
			t.Errorf("ValidateEmail(%q) = %v, want nil", valid, err)
		}
	}
	for _, invalid := range []string{"not-an-email", "missing-domain@", "@missing-local.com", "no-at-sign.com", "spaces in@email.com"} {
		err := ValidateEmail(invalid)
		if err == nil {
			t.Errorf("ValidateEmail(%q) accepted, want error", invalid)
			continue
		}
		if !strings.Contains(err.Error(), "email") {
			t.Errorf("error %q does not name the field", err)
		}
	}
}

func TestTokenNameRequired(t *testing.T) {
	if err := ValidateTokenName("ci-agent"); err != nil {
		t.Errorf("valid token name rejected: %v", err)
	}
	err := ValidateTokenName("")
	if err == nil {
		t.Fatal("empty token name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestDeriveProjectKey(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"Customer Payments Api", "CPA"},
		{"Login Service", "LS"},
		{"Checkout", "CHEC"},
		{"Go", "GO"},
		{"a b c d e f g", "ABCDE"},
		{"???", "PROJ"},
		{"", "PROJ"},
	}
	for _, c := range cases {
		if got := DeriveProjectKey(c.name); got != c.want {
			t.Errorf("DeriveProjectKey(%q) = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestDeriveProjectKeyIsAlwaysUppercaseAlphanumeric(t *testing.T) {
	alphanumeric := regexp.MustCompile(`^[A-Z0-9]+$`)
	for _, name := range []string{"login-service", "Payments_Api", "Café Menu", "1st Project"} {
		got := DeriveProjectKey(name)
		if !alphanumeric.MatchString(got) {
			t.Errorf("DeriveProjectKey(%q) = %q, not uppercase alphanumeric", name, got)
		}
	}
}

func TestParseImportMode(t *testing.T) {
	for _, valid := range []string{"dry_run", "real"} {
		if _, err := ParseImportMode(valid); err != nil {
			t.Errorf("ParseImportMode(%q) = %v, want nil", valid, err)
		}
	}
	if _, err := ParseImportMode("preview"); err == nil {
		t.Error("ParseImportMode(\"preview\") accepted, want rejected")
	}
}

func TestParseImportJobStatus(t *testing.T) {
	for _, valid := range []string{"pending", "running", "succeeded", "failed"} {
		if _, err := ParseImportJobStatus(valid); err != nil {
			t.Errorf("ParseImportJobStatus(%q) = %v, want nil", valid, err)
		}
	}
	if _, err := ParseImportJobStatus("done"); err == nil {
		t.Error("ParseImportJobStatus(\"done\") accepted, want rejected")
	}
}

func TestImportJobStatusTerminal(t *testing.T) {
	nonTerminal := []ImportJobStatus{ImportJobStatusPending, ImportJobStatusRunning}
	for _, s := range nonTerminal {
		if s.Terminal() {
			t.Errorf("%q.Terminal() = true, want false", s)
		}
	}
	terminal := []ImportJobStatus{ImportJobStatusSucceeded, ImportJobStatusFailed}
	for _, s := range terminal {
		if !s.Terminal() {
			t.Errorf("%q.Terminal() = false, want true", s)
		}
	}
}

func TestImportJobZeroValueIsUsable(t *testing.T) {
	// Sanity check the struct shape compiles and a report round-trips
	// through its fields as expected — the real persistence round-trip is
	// covered at the store layer (section 2).
	job := ImportJob{
		ID:        "job1",
		ProjectID: "p1",
		Source:    "testrail",
		Mode:      ImportModeDryRun,
		Status:    ImportJobStatusPending,
		Report: &ImportReport{
			Counts:   map[string]int{"folders": 3, "cases": 340},
			Unmapped: []string{"Automation Type", "Priority Matrix"},
		},
		CreatedBy: "u1",
	}
	if job.Report.Counts["cases"] != 340 {
		t.Errorf("Report.Counts[cases] = %d, want 340", job.Report.Counts["cases"])
	}
	if len(job.Report.Unmapped) != 2 {
		t.Errorf("len(Report.Unmapped) = %d, want 2", len(job.Report.Unmapped))
	}
}

func TestDefaultDisplayName(t *testing.T) {
	cases := []struct {
		email string
		want  string
	}{
		{"rgriffiths@example.com", "Rgriffiths"},
		{"jane.doe@example.com", "Jane Doe"},
		{"j_smith99@example.com", "J Smith99"},
		{"ana-maria@example.com", "Ana Maria"},
		{"jane+work@example.com", "Jane Work"},
		{"admin@example.com", "Admin"},
	}
	for _, c := range cases {
		if got := DefaultDisplayName(c.email); got != c.want {
			t.Errorf("DefaultDisplayName(%q) = %q, want %q", c.email, got, c.want)
		}
	}
}
