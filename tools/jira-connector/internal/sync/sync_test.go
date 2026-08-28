package sync

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/Barayo/TestPulse/tools/jira-connector/internal/jiraclient"
	"github.com/Barayo/TestPulse/tools/jira-connector/internal/testpulseclient"
)

type fakeTestPulse struct {
	projects       []testpulseclient.Project
	casesByProject map[string][]testpulseclient.Case
	runsByProject  map[string][]testpulseclient.Run
	itemsByRun     map[string][]testpulseclient.RunItem
	listCasesErr   map[string]error
	listRunsErr    map[string]error
	syncCaseErr    map[string]error
	syncItemErr    map[string]error
	syncedCases    map[string]jiraclient.Issue
	syncedItems    map[string]jiraclient.Issue
}

func newFakeTestPulse() *fakeTestPulse {
	return &fakeTestPulse{
		casesByProject: map[string][]testpulseclient.Case{},
		runsByProject:  map[string][]testpulseclient.Run{},
		itemsByRun:     map[string][]testpulseclient.RunItem{},
		listCasesErr:   map[string]error{},
		listRunsErr:    map[string]error{},
		syncCaseErr:    map[string]error{},
		syncItemErr:    map[string]error{},
		syncedCases:    map[string]jiraclient.Issue{},
		syncedItems:    map[string]jiraclient.Issue{},
	}
}

func (f *fakeTestPulse) ListProjects(ctx context.Context) ([]testpulseclient.Project, error) {
	return f.projects, nil
}
func (f *fakeTestPulse) ListJiraLinkedCases(ctx context.Context, projectKey string) ([]testpulseclient.Case, error) {
	if err := f.listCasesErr[projectKey]; err != nil {
		return nil, err
	}
	return f.casesByProject[projectKey], nil
}
func (f *fakeTestPulse) ListOpenRuns(ctx context.Context, projectKey string) ([]testpulseclient.Run, error) {
	if err := f.listRunsErr[projectKey]; err != nil {
		return nil, err
	}
	return f.runsByProject[projectKey], nil
}
func (f *fakeTestPulse) ListJiraLinkedRunItems(ctx context.Context, runKey string) ([]testpulseclient.RunItem, error) {
	return f.itemsByRun[runKey], nil
}
func (f *fakeTestPulse) SyncCase(ctx context.Context, caseKey, summary, status string) error {
	if err := f.syncCaseErr[caseKey]; err != nil {
		return err
	}
	f.syncedCases[caseKey] = jiraclient.Issue{Summary: summary, Status: status}
	return nil
}
func (f *fakeTestPulse) SyncRunItem(ctx context.Context, itemID, summary, status string) error {
	if err := f.syncItemErr[itemID]; err != nil {
		return err
	}
	f.syncedItems[itemID] = jiraclient.Issue{Summary: summary, Status: status}
	return nil
}

type fakeJira struct {
	issuesByKey map[string]jiraclient.Issue
	err         error
}

func (f *fakeJira) SearchIssues(ctx context.Context, keys []string) ([]jiraclient.Issue, error) {
	if f.err != nil {
		return nil, f.err
	}
	issues := make([]jiraclient.Issue, 0, len(keys))
	for _, k := range keys {
		if issue, ok := f.issuesByKey[k]; ok {
			issues = append(issues, issue)
		}
	}
	return issues, nil
}

func discardLogger() *slog.Logger { return slog.New(slog.DiscardHandler) }

func TestOnceSyncsLinkedCasesAcrossProjects(t *testing.T) {
	tp := newFakeTestPulse()
	tp.projects = []testpulseclient.Project{{Key: "SP"}, {Key: "QA"}}
	tp.casesByProject["SP"] = []testpulseclient.Case{{Key: "SP-1", JiraIssueKey: "PROJ-1"}}
	tp.casesByProject["QA"] = []testpulseclient.Case{{Key: "QA-1", JiraIssueKey: "PROJ-2"}}
	jira := &fakeJira{issuesByKey: map[string]jiraclient.Issue{
		"PROJ-1": {Key: "PROJ-1", Summary: "Fix login redirect", Status: "In Progress"},
		"PROJ-2": {Key: "PROJ-2", Summary: "Add logout button", Status: "Done"},
	}}

	Once(t.Context(), tp, jira, discardLogger())

	if tp.syncedCases["SP-1"].Summary != "Fix login redirect" {
		t.Errorf("SP-1 synced = %+v", tp.syncedCases["SP-1"])
	}
	if tp.syncedCases["QA-1"].Status != "Done" {
		t.Errorf("QA-1 synced = %+v", tp.syncedCases["QA-1"])
	}
}

func TestOnceSyncsLinkedRunItemsInOpenRuns(t *testing.T) {
	tp := newFakeTestPulse()
	tp.projects = []testpulseclient.Project{{Key: "SP"}}
	tp.runsByProject["SP"] = []testpulseclient.Run{{Key: "SP-R1", Status: "open"}}
	tp.itemsByRun["SP-R1"] = []testpulseclient.RunItem{{ID: "item-1", JiraIssueKey: "PROJ-9"}}
	jira := &fakeJira{issuesByKey: map[string]jiraclient.Issue{
		"PROJ-9": {Key: "PROJ-9", Summary: "Refund flow", Status: "To Do"},
	}}

	Once(t.Context(), tp, jira, discardLogger())

	if tp.syncedItems["item-1"].Summary != "Refund flow" {
		t.Errorf("item-1 synced = %+v", tp.syncedItems["item-1"])
	}
}

func TestOnceOneCaseSyncFailureDoesNotBlockTheRestOfTheBatch(t *testing.T) {
	tp := newFakeTestPulse()
	tp.projects = []testpulseclient.Project{{Key: "SP"}}
	tp.casesByProject["SP"] = []testpulseclient.Case{
		{Key: "SP-1", JiraIssueKey: "PROJ-1"},
		{Key: "SP-2", JiraIssueKey: "PROJ-2"},
	}
	tp.syncCaseErr["SP-1"] = errors.New("conflict")
	jira := &fakeJira{issuesByKey: map[string]jiraclient.Issue{
		"PROJ-1": {Key: "PROJ-1", Summary: "s1", Status: "st1"},
		"PROJ-2": {Key: "PROJ-2", Summary: "s2", Status: "st2"},
	}}

	Once(t.Context(), tp, jira, discardLogger())

	if _, ok := tp.syncedCases["SP-1"]; ok {
		t.Error("SP-1 should not have synced (it errored)")
	}
	if tp.syncedCases["SP-2"].Summary != "s2" {
		t.Errorf("SP-2 should still have synced despite SP-1's failure, got %+v", tp.syncedCases["SP-2"])
	}
}

func TestOnceOneProjectsListFailureDoesNotBlockOtherProjects(t *testing.T) {
	tp := newFakeTestPulse()
	tp.projects = []testpulseclient.Project{{Key: "SP"}, {Key: "QA"}}
	tp.listCasesErr["SP"] = errors.New("jira outage")
	tp.casesByProject["QA"] = []testpulseclient.Case{{Key: "QA-1", JiraIssueKey: "PROJ-2"}}
	jira := &fakeJira{issuesByKey: map[string]jiraclient.Issue{
		"PROJ-2": {Key: "PROJ-2", Summary: "s2", Status: "st2"},
	}}

	Once(t.Context(), tp, jira, discardLogger())

	if tp.syncedCases["QA-1"].Summary != "s2" {
		t.Errorf("QA-1 should still have synced despite SP's list failure, got %+v", tp.syncedCases["QA-1"])
	}
}

func TestOnceJiraSearchFailureForOneProjectDoesNotBlockOthers(t *testing.T) {
	tp := newFakeTestPulse()
	tp.projects = []testpulseclient.Project{{Key: "SP"}}
	tp.casesByProject["SP"] = []testpulseclient.Case{{Key: "SP-1", JiraIssueKey: "PROJ-1"}}
	jira := &fakeJira{err: errors.New("jira unreachable")}

	// Should not panic, and should simply leave the case unsynced.
	Once(t.Context(), tp, jira, discardLogger())

	if _, ok := tp.syncedCases["SP-1"]; ok {
		t.Error("SP-1 should not have synced when Jira search itself fails")
	}
}

func TestOnceSkipsAnUnknownOrDeletedIssueKeyWithoutFailing(t *testing.T) {
	tp := newFakeTestPulse()
	tp.projects = []testpulseclient.Project{{Key: "SP"}}
	tp.casesByProject["SP"] = []testpulseclient.Case{{Key: "SP-1", JiraIssueKey: "PROJ-GONE"}}
	jira := &fakeJira{issuesByKey: map[string]jiraclient.Issue{}}

	Once(t.Context(), tp, jira, discardLogger())

	if _, ok := tp.syncedCases["SP-1"]; ok {
		t.Error("SP-1 should not have synced — its Jira issue no longer exists")
	}
}
