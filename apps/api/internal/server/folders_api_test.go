package server_test

import (
	"fmt"
	"testing"
)

// API integration tests for the folder amendment (design D8), mapped to
// test-authoring spec scenarios for project-level case folders.

func TestScenario_ProjectHasRootFolderOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var folders []struct {
		ID             string
		ParentFolderID string `json:"parentFolderId"`
		Name           string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), nil, 200, &folders)
	if len(folders) != 1 || folders[0].ParentFolderID != "" {
		t.Fatalf("folders after project creation = %+v, want exactly 1 root folder", folders)
	}
}

func TestScenario_CreateNestedFolderOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var folders []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), nil, 200, &folders)
	root := folders[0].ID

	var auth struct {
		ID             string
		ParentFolderID string `json:"parentFolderId"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)
	if auth.ParentFolderID != root {
		t.Errorf("auth folder parent = %q, want root %q", auth.ParentFolderID, root)
	}

	// "parent folder is required" validation scenario.
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), jmap{"name": "Orphan"}, 400, nil)
}

func TestScenario_CaseDefaultsToRootFolderOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var folders []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), nil, 200, &folders)

	var c struct {
		FolderID string `json:"folderId"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "Login works"}, 201, &c)
	if c.FolderID != folders[0].ID {
		t.Errorf("case folderId = %q, want root %q", c.FolderID, folders[0].ID)
	}
}

func TestScenario_MoveCaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var folders []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), nil, 200, &folders)
	root := folders[0].ID

	var auth struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)

	var c struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "Login works"}, 201, &c)

	// Suite membership must survive the move (folders are orthogonal to suites).
	var suite struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.ID), jmap{"name": "smoke"}, 201, &suite)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.ID, c.ID), nil, 204, nil)

	call(t, h, "PUT", "/api/v1/cases/"+c.ID+"/folder", jmap{"folderId": auth.ID}, 204, nil)

	var got struct {
		FolderID string `json:"folderId"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.ID, nil, 200, &got)
	if got.FolderID != auth.ID {
		t.Errorf("folderId after move = %q, want %q", got.FolderID, auth.ID)
	}
	var suites []struct {
		CaseIDs []string `json:"caseIds"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/suites", p.ID), nil, 200, &suites)
	if len(suites) != 1 || len(suites[0].CaseIDs) != 1 || suites[0].CaseIDs[0] != c.ID {
		t.Errorf("suite membership changed after folder move: %+v", suites)
	}
}

func TestScenario_DeleteFolderReparentsOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var folders []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), nil, 200, &folders)
	root := folders[0].ID

	var auth, login struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID),
		jmap{"name": "Login", "parentFolderId": auth.ID}, 201, &login)

	var c struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID),
		jmap{"title": "case in auth", "folderId": auth.ID}, 201, &c)

	call(t, h, "DELETE", "/api/v1/folders/"+auth.ID, nil, 204, nil)

	var movedFolders []struct {
		ID             string
		ParentFolderID string `json:"parentFolderId"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), nil, 200, &movedFolders)
	for _, f := range movedFolders {
		if f.ID == login.ID && f.ParentFolderID != root {
			t.Errorf("subfolder not reparented: %+v", f)
		}
	}
	var movedCase struct {
		FolderID string `json:"folderId"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.ID, nil, 200, &movedCase)
	if movedCase.FolderID != root {
		t.Errorf("case not reparented: folderId = %q, want root %q", movedCase.FolderID, root)
	}
}

func TestScenario_RootFolderNotDeletableOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var folders []struct{ ID string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.ID), nil, 200, &folders)

	call(t, h, "DELETE", "/api/v1/folders/"+folders[0].ID, nil, 400, nil)
}
