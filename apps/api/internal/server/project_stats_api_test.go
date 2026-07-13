package server_test

import "testing"

func TestScenario_ProjectSummariesBatchedAcrossProjects(t *testing.T) {
	h := apiServer(t)

	var p1, p2 struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "P1"}, 201, &p1)
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "P2"}, 201, &p2)
	call(t, h, "POST", "/api/v1/projects/"+p1.ID+"/suites", jmap{"name": "Smoke"}, 201, nil)

	var summaries []struct {
		ProjectID  string `json:"projectId"`
		SuiteCount int    `json:"suiteCount"`
		CaseCount  int    `json:"caseCount"`
		PassRate   *int   `json:"passRate"`
	}
	call(t, h, "GET", "/api/v1/projects/summaries", nil, 200, &summaries)

	if len(summaries) != 2 {
		t.Fatalf("summaries = %d entries, want 2", len(summaries))
	}
	byID := map[string]int{}
	for _, s := range summaries {
		byID[s.ProjectID] = s.SuiteCount
		if s.ProjectID == p1.ID && s.PassRate != nil {
			t.Errorf("PassRate for a project with no runs = %v, want nil", s.PassRate)
		}
	}
	if byID[p1.ID] != 1 {
		t.Errorf("p1 suite count = %d, want 1", byID[p1.ID])
	}
	if byID[p2.ID] != 0 {
		t.Errorf("p2 suite count = %d, want 0", byID[p2.ID])
	}
}

func TestScenario_ProjectSummariesExcludeArchivedProjects(t *testing.T) {
	h := apiServer(t)

	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Archived"}, 201, &p)
	call(t, h, "PATCH", "/api/v1/projects/"+p.ID, jmap{"archived": true}, 200, nil)

	var summaries []struct{ ProjectID string `json:"projectId"` }
	call(t, h, "GET", "/api/v1/projects/summaries", nil, 200, &summaries)
	for _, s := range summaries {
		if s.ProjectID == p.ID {
			t.Errorf("archived project %s appeared in summaries", p.ID)
		}
	}
}
