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
	if err := ValidatePassword("longenough"); err != nil {
		t.Errorf("valid password rejected: %v", err)
	}
	err := ValidatePassword("short")
	if err == nil {
		t.Fatal("password under 8 characters accepted")
	}
	if !strings.Contains(err.Error(), "8 characters") {
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
