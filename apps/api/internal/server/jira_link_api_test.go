package server_test

import (
	"fmt"
	"testing"
)

// API integration tests for add-jira-connector's test-authoring/test-execution
// delta specs: linking a case/run item to a Jira issue.

func TestScenario_SetAndClearCaseJiraLinkOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "login works"}, 201, &c)

	var updated struct {
		JiraIssueKey     *string
		CurrentVersion   int
		JiraIssueSummary *string
	}
	call(t, h, "PUT", "/api/v1/cases/"+c.Key+"/jira-link", jmap{"jiraIssueKey": "PROJ-1"}, 200, &updated)
	if updated.JiraIssueKey == nil || *updated.JiraIssueKey != "PROJ-1" {
		t.Fatalf("jiraIssueKey = %v, want PROJ-1", updated.JiraIssueKey)
	}
	if updated.CurrentVersion != 1 {
		t.Errorf("currentVersion = %d, want unchanged at 1", updated.CurrentVersion)
	}

	call(t, h, "PUT", "/api/v1/cases/"+c.Key+"/jira-sync",
		jmap{"jiraIssueSummary": "Fix login redirect", "jiraIssueStatus": "In Progress"}, 200, &updated)
	if updated.JiraIssueSummary == nil || *updated.JiraIssueSummary != "Fix login redirect" {
		t.Fatalf("jiraIssueSummary = %v", updated.JiraIssueSummary)
	}

	var cleared struct {
		JiraIssueKey     *string
		JiraIssueSummary *string
	}
	call(t, h, "PUT", "/api/v1/cases/"+c.Key+"/jira-link", jmap{"jiraIssueKey": nil}, 200, &cleared)
	if cleared.JiraIssueKey != nil || cleared.JiraIssueSummary != nil {
		t.Errorf("after clearing = %+v, want both nil", cleared)
	}
}

func TestScenario_CaseJiraSyncWithoutLinkIsConflictOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "login works"}, 201, &c)

	call(t, h, "PUT", "/api/v1/cases/"+c.Key+"/jira-sync",
		jmap{"jiraIssueSummary": "x", "jiraIssueStatus": "y"}, 409, nil)
}

func TestScenario_ListCasesFilteredByJiraLinkedOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "linked"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "unlinked"}, 201, &c2)
	call(t, h, "PUT", "/api/v1/cases/"+c1.Key+"/jira-link", jmap{"jiraIssueKey": "PROJ-1"}, 200, nil)

	var cases []struct{ Key string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases?jiraLinked=true", p.Key), nil, 200, &cases)
	if len(cases) != 1 || cases[0].Key != c1.Key {
		t.Fatalf("jiraLinked=true cases = %+v, want only %v", cases, c1.Key)
	}
}

func TestScenario_SetRunItemJiraLinkOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "login works"}, 201, &c)
	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)

	var updated struct{ JiraIssueKey *string }
	call(t, h, "PUT", "/api/v1/items/"+items[0].ID+"/jira-link", jmap{"jiraIssueKey": "PROJ-2"}, 200, &updated)
	if updated.JiraIssueKey == nil || *updated.JiraIssueKey != "PROJ-2" {
		t.Fatalf("jiraIssueKey = %v, want PROJ-2", updated.JiraIssueKey)
	}

	var linkedItems []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items?jiraLinked=true", run.Key), nil, 200, &linkedItems)
	if len(linkedItems) != 1 || linkedItems[0].ID != items[0].ID {
		t.Fatalf("jiraLinked=true items = %+v, want only %v", linkedItems, items[0].ID)
	}
}

func TestScenario_ClosedRunRejectsItemJiraLinkChangeOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "login works"}, 201, &c)
	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)

	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run.Key), nil, 204, nil)
	call(t, h, "PUT", "/api/v1/items/"+items[0].ID+"/jira-link", jmap{"jiraIssueKey": "PROJ-3"}, 409, nil)
}
