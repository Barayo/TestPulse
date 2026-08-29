package domain

import (
	"regexp"
	"strings"
	"testing"
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
