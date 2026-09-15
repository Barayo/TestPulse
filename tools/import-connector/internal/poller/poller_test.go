package poller

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Barayo/TestPulse/tools/import-connector/internal/importer"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/qaseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testpulseclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/testrailclient"
	"github.com/Barayo/TestPulse/tools/import-connector/internal/zephyrscaleclient"
)

func discardLogger() *slog.Logger { return slog.New(slog.DiscardHandler) }

// fakeTestPulse implements TestPulseClient — job lifecycle calls plus the
// write methods importer.Run needs, all recorded for assertions.
type fakeTestPulse struct {
	claimed        *testpulseclient.ClaimedJob
	claimErr       error
	projects       []testpulseclient.Project
	reportedCalls  []struct{ current, total int }
	completedWith  *completion
	nextFolderID   int
	createdFolders int
	createdCases   int
}

type completion struct {
	jobID, status string
	report        *testpulseclient.ImportReport
	errMsg        *string
}

func (f *fakeTestPulse) ClaimPendingJob(context.Context, string) (*testpulseclient.ClaimedJob, error) {
	return f.claimed, f.claimErr
}
func (f *fakeTestPulse) ListProjects(context.Context) ([]testpulseclient.Project, error) {
	return f.projects, nil
}
func (f *fakeTestPulse) ReportProgress(_ context.Context, _ string, current, total int) error {
	f.reportedCalls = append(f.reportedCalls, struct{ current, total int }{current, total})
	return nil
}
func (f *fakeTestPulse) CompleteJob(_ context.Context, jobID, status string, report *testpulseclient.ImportReport, errMsg *string) error {
	f.completedWith = &completion{jobID: jobID, status: status, report: report, errMsg: errMsg}
	return nil
}
func (f *fakeTestPulse) RootFolderID(context.Context, string) (string, error) { return "root", nil }
func (f *fakeTestPulse) CreateFolder(_ context.Context, _, name, parentFolderID string) (testpulseclient.Folder, error) {
	f.createdFolders++
	f.nextFolderID++
	return testpulseclient.Folder{ID: name, Name: name, ParentFolderID: parentFolderID}, nil
}
func (f *fakeTestPulse) CreateCase(context.Context, string, testpulseclient.NewCase) (testpulseclient.Case, error) {
	f.createdCases++
	return testpulseclient.Case{Key: "QA-C1"}, nil
}
func (f *fakeTestPulse) CreateCustomField(context.Context, string, string, string) (testpulseclient.CustomField, error) {
	return testpulseclient.CustomField{ID: "field-1"}, nil
}
func (f *fakeTestPulse) AddCustomFieldOption(context.Context, string, string) (testpulseclient.CustomFieldOption, error) {
	return testpulseclient.CustomFieldOption{ID: "opt-1"}, nil
}

type fakeTestRail struct{}

func (fakeTestRail) ListSuites(context.Context, int) ([]testrailclient.Suite, error) {
	return []testrailclient.Suite{{ID: 1, Name: "Master"}}, nil
}
func (fakeTestRail) ListSections(context.Context, int, int) ([]testrailclient.Section, error) {
	return []testrailclient.Section{{ID: 10, Name: "Login"}}, nil
}
func (fakeTestRail) ListCases(context.Context, int, int) ([]testrailclient.Case, error) {
	return []testrailclient.Case{{ID: 100, SectionID: 10, Title: "Login case"}}, nil
}
func (fakeTestRail) ListCaseFields(context.Context) ([]testrailclient.CaseField, error) {
	return nil, nil
}

func newFakeTestRail(_, _, _ string) importer.TestRailReader { return fakeTestRail{} }

type fakeQase struct{}

func (fakeQase) ListSuites(context.Context, string) ([]qaseclient.Suite, error) {
	return []qaseclient.Suite{{ID: 1, Title: "Master"}}, nil
}
func (fakeQase) ListCases(context.Context, string) ([]qaseclient.Case, error) {
	return []qaseclient.Case{{ID: 100, SuiteID: 1, Title: "Login case"}}, nil
}
func (fakeQase) ListCaseFields(context.Context) ([]qaseclient.CustomField, error) {
	return nil, nil
}

func newFakeQase(_, _ string) importer.QaseReader { return fakeQase{} }

type fakeZephyrScale struct{}

func (fakeZephyrScale) ListFolders(context.Context, string) ([]zephyrscaleclient.Folder, error) {
	return []zephyrscaleclient.Folder{{ID: 1, Name: "Master"}}, nil
}
func (fakeZephyrScale) ListTestCases(context.Context, string) ([]zephyrscaleclient.Case, error) {
	i := 1
	return []zephyrscaleclient.Case{{Key: "PROJ-T1", Name: "Login case", FolderID: &i}}, nil
}
func (fakeZephyrScale) ListTestSteps(context.Context, string) ([]zephyrscaleclient.TestStep, error) {
	return nil, nil
}
func (fakeZephyrScale) GetTestScript(context.Context, string) (*zephyrscaleclient.TestScript, error) {
	return nil, nil
}

func newFakeZephyrScale(_, _ string) importer.ZephyrScaleReader { return fakeZephyrScale{} }

func claimedJob(mode string) *testpulseclient.ClaimedJob {
	return &testpulseclient.ClaimedJob{
		Job: testpulseclient.ImportJob{ID: "job-1", ProjectID: "proj-1", Mode: mode},
		Credentials: map[string]string{
			"siteUrl": "https://x.testrail.io", "email": "bot@example.com", "apiKey": "key-123",
			"testRailProjectId": "1",
		},
	}
}

func claimedQaseJob(mode string) *testpulseclient.ClaimedJob {
	return &testpulseclient.ClaimedJob{
		Job:         testpulseclient.ImportJob{ID: "job-2", ProjectID: "proj-1", Mode: mode},
		Credentials: map[string]string{"apiToken": "token-123", "projectCode": "PRJ"},
	}
}

func claimedZephyrScaleJob(mode string) *testpulseclient.ClaimedJob {
	return &testpulseclient.ClaimedJob{
		Job:         testpulseclient.ImportJob{ID: "job-3", ProjectID: "proj-1", Mode: mode},
		Credentials: map[string]string{"apiToken": "token-123", "projectKey": "PROJ"},
	}
}

func TestOnceReturnsFalseWhenNothingPending(t *testing.T) {
	tp := &fakeTestPulse{}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "testrail", discardLogger())
	if ran {
		t.Error("Once returned true with nothing pending")
	}
	if tp.completedWith != nil {
		t.Errorf("CompleteJob called with nothing to run: %+v", tp.completedWith)
	}
}

func TestOnceCompletesDryRunJobWithoutTestPulseWrites(t *testing.T) {
	tp := &fakeTestPulse{claimed: claimedJob("dry_run"), projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "testrail", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true (a job was claimed)")
	}
	if tp.createdFolders != 0 || tp.createdCases != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%d cases=%d", tp.createdFolders, tp.createdCases)
	}
	if tp.completedWith == nil || tp.completedWith.status != "succeeded" {
		t.Fatalf("completedWith = %+v, want succeeded", tp.completedWith)
	}
	if tp.completedWith.report.Counts["cases"] != 1 {
		t.Errorf("report = %+v, want 1 case counted", tp.completedWith.report)
	}
}

func TestOnceRealRunCreatesEntitiesAndReportsProgress(t *testing.T) {
	tp := &fakeTestPulse{claimed: claimedJob("real"), projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "testrail", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true")
	}
	if tp.createdCases != 1 {
		t.Errorf("createdCases = %d, want 1", tp.createdCases)
	}
	if len(tp.reportedCalls) == 0 {
		t.Error("ReportProgress was never called during a real run")
	}
	if tp.completedWith == nil || tp.completedWith.status != "succeeded" {
		t.Fatalf("completedWith = %+v, want succeeded", tp.completedWith)
	}
}

func TestOnceReportsFailureWhenProjectUnresolvable(t *testing.T) {
	// The token's own ListProjects doesn't include the claimed job's
	// project — should never happen (design.md D4's scoping), but must
	// fail loudly (job marked failed) rather than silently import into
	// the wrong project or panic.
	tp := &fakeTestPulse{claimed: claimedJob("real"), projects: nil}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "testrail", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true (a job was claimed, even though it failed)")
	}
	if tp.completedWith == nil || tp.completedWith.status != "failed" {
		t.Fatalf("completedWith = %+v, want failed", tp.completedWith)
	}
	if tp.completedWith.errMsg == nil || *tp.completedWith.errMsg == "" {
		t.Error("failed completion has no error message")
	}
	if tp.createdCases != 0 {
		t.Errorf("createdCases = %d, want 0 (never got as far as writing)", tp.createdCases)
	}
}

func TestOnceReportsFailureWhenCredentialsMissing(t *testing.T) {
	claimed := claimedJob("real")
	claimed.Credentials = map[string]string{"siteUrl": "https://x.testrail.io"} // missing email/apiKey/projectId
	tp := &fakeTestPulse{claimed: claimed, projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "testrail", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true")
	}
	if tp.completedWith == nil || tp.completedWith.status != "failed" {
		t.Fatalf("completedWith = %+v, want failed", tp.completedWith)
	}
}

func TestOnceCompletesQaseDryRunJobWithoutTestPulseWrites(t *testing.T) {
	tp := &fakeTestPulse{claimed: claimedQaseJob("dry_run"), projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "qase", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true (a job was claimed)")
	}
	if tp.createdFolders != 0 || tp.createdCases != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%d cases=%d", tp.createdFolders, tp.createdCases)
	}
	if tp.completedWith == nil || tp.completedWith.status != "succeeded" {
		t.Fatalf("completedWith = %+v, want succeeded", tp.completedWith)
	}
	if tp.completedWith.report.Counts["cases"] != 1 {
		t.Errorf("report = %+v, want 1 case counted", tp.completedWith.report)
	}
}

func TestOnceQaseRealRunCreatesEntitiesAndReportsProgress(t *testing.T) {
	tp := &fakeTestPulse{claimed: claimedQaseJob("real"), projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "qase", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true")
	}
	if tp.createdCases != 1 {
		t.Errorf("createdCases = %d, want 1", tp.createdCases)
	}
	if len(tp.reportedCalls) == 0 {
		t.Error("ReportProgress was never called during a real run")
	}
	if tp.completedWith == nil || tp.completedWith.status != "succeeded" {
		t.Fatalf("completedWith = %+v, want succeeded", tp.completedWith)
	}
}

func TestOnceQaseReportsFailureWhenCredentialsMissing(t *testing.T) {
	claimed := claimedQaseJob("real")
	claimed.Credentials = map[string]string{"apiToken": "token-123"} // missing projectCode
	tp := &fakeTestPulse{claimed: claimed, projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "qase", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true")
	}
	if tp.completedWith == nil || tp.completedWith.status != "failed" {
		t.Fatalf("completedWith = %+v, want failed", tp.completedWith)
	}
	if tp.createdCases != 0 {
		t.Errorf("createdCases = %d, want 0 (never got as far as writing)", tp.createdCases)
	}
}

func TestOnceCompletesZephyrScaleDryRunJobWithoutTestPulseWrites(t *testing.T) {
	tp := &fakeTestPulse{claimed: claimedZephyrScaleJob("dry_run"), projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "zephyr-scale", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true (a job was claimed)")
	}
	if tp.createdFolders != 0 || tp.createdCases != 0 {
		t.Errorf("dry run made TestPulse writes: folders=%d cases=%d", tp.createdFolders, tp.createdCases)
	}
	if tp.completedWith == nil || tp.completedWith.status != "succeeded" {
		t.Fatalf("completedWith = %+v, want succeeded", tp.completedWith)
	}
	if tp.completedWith.report.Counts["cases"] != 1 {
		t.Errorf("report = %+v, want 1 case counted", tp.completedWith.report)
	}
}

func TestOnceZephyrScaleRealRunCreatesEntitiesAndReportsProgress(t *testing.T) {
	tp := &fakeTestPulse{claimed: claimedZephyrScaleJob("real"), projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "zephyr-scale", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true")
	}
	if tp.createdCases != 1 {
		t.Errorf("createdCases = %d, want 1", tp.createdCases)
	}
	if len(tp.reportedCalls) == 0 {
		t.Error("ReportProgress was never called during a real run")
	}
	if tp.completedWith == nil || tp.completedWith.status != "succeeded" {
		t.Fatalf("completedWith = %+v, want succeeded", tp.completedWith)
	}
}

func TestOnceZephyrScaleReportsFailureWhenCredentialsMissing(t *testing.T) {
	claimed := claimedZephyrScaleJob("real")
	claimed.Credentials = map[string]string{"apiToken": "token-123"} // missing projectKey
	tp := &fakeTestPulse{claimed: claimed, projects: []testpulseclient.Project{{ID: "proj-1", Key: "QA"}}}
	ran := Once(context.Background(), tp, newFakeTestRail, newFakeQase, newFakeZephyrScale, "zephyr-scale", discardLogger())
	if !ran {
		t.Fatal("Once returned false, want true")
	}
	if tp.completedWith == nil || tp.completedWith.status != "failed" {
		t.Fatalf("completedWith = %+v, want failed", tp.completedWith)
	}
	if tp.createdCases != 0 {
		t.Errorf("createdCases = %d, want 0 (never got as far as writing)", tp.createdCases)
	}
}
