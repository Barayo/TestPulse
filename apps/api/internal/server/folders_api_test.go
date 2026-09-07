package server_test

import (
	"fmt"
	"testing"
)

// API integration tests for the folder amendment (design D8), mapped to
// test-authoring spec scenarios for project-level case folders.

func TestScenario_ProjectHasRootFolderOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var foldersResp struct {
		Items []struct {
			ID             string
			ParentFolderID string `json:"parentFolderId"`
			Name           string
		}
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)
	folders := foldersResp.Items
	if len(folders) != 1 || folders[0].ParentFolderID != "" {
		t.Fatalf("folders after project creation = %+v, want exactly 1 root folder", folders)
	}
}

func TestScenario_CreateNestedFolderOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var foldersResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)
	root := foldersResp.Items[0].ID

	var auth struct {
		ID             string
		ParentFolderID string `json:"parentFolderId"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)
	if auth.ParentFolderID != root {
		t.Errorf("auth folder parent = %q, want root %q", auth.ParentFolderID, root)
	}

	// "parent folder is required" validation scenario.
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), jmap{"name": "Orphan"}, 400, nil)
}

func TestScenario_CaseDefaultsToRootFolderOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var foldersResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)

	var c struct {
		FolderID string `json:"folderId"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Login works"}, 201, &c)
	if c.FolderID != foldersResp.Items[0].ID {
		t.Errorf("case folderId = %q, want root %q", c.FolderID, foldersResp.Items[0].ID)
	}
}

func TestScenario_MoveCaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var foldersResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)
	root := foldersResp.Items[0].ID

	var auth struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)

	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Login works"}, 201, &c)

	// Suite membership must survive the move (folders are orthogonal to suites).
	var suite struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "smoke"}, 201, &suite)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c.Key), nil, 204, nil)

	call(t, h, "PUT", "/api/v1/cases/"+c.Key+"/folder", jmap{"folderId": auth.ID}, 204, nil)

	var got struct {
		FolderID string `json:"folderId"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key, nil, 200, &got)
	if got.FolderID != auth.ID {
		t.Errorf("folderId after move = %q, want %q", got.FolderID, auth.ID)
	}
	var suitesResp struct {
		Items []struct {
			CaseIDs []string `json:"caseIds"`
		}
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), nil, 200, &suitesResp)
	if len(suitesResp.Items) != 1 || len(suitesResp.Items[0].CaseIDs) != 1 {
		t.Errorf("suite membership changed after folder move: %+v", suitesResp.Items)
	}
}

// TestScenario_DeleteFolderCascadesOverHTTP covers add-delete-mode's
// "Deleting a folder cascades to its subtree" requirement, replacing the
// old reparent-on-delete behavior.
func TestScenario_DeleteFolderCascadesOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var foldersResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)
	root := foldersResp.Items[0].ID

	var auth, login struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Login", "parentFolderId": auth.ID}, 201, &login)

	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "case in auth", "folderId": auth.ID}, 201, &c)

	// Preview before deleting: 1 case, 1 subfolder (login) in auth's subtree.
	var preview struct {
		CaseCount   int `json:"caseCount"`
		FolderCount int `json:"folderCount"`
	}
	call(t, h, "GET", "/api/v1/folders/"+auth.ID+"/delete-preview", nil, 200, &preview)
	if preview.CaseCount != 1 || preview.FolderCount != 1 {
		t.Errorf("preview = %+v, want caseCount=1 folderCount=1", preview)
	}

	call(t, h, "DELETE", "/api/v1/folders/"+auth.ID, nil, 204, nil)

	var remainingResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &remainingResp)
	for _, f := range remainingResp.Items {
		if f.ID == auth.ID || f.ID == login.ID {
			t.Errorf("deleted folder %q still listed", f.ID)
		}
	}

	call(t, h, "GET", "/api/v1/cases/"+c.Key, nil, 404, nil)
}

func TestScenario_RootFolderNotDeletableOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var foldersResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)

	call(t, h, "DELETE", "/api/v1/folders/"+foldersResp.Items[0].ID, nil, 400, nil)
}

// TestScenario_MoveFolderOverHTTP covers add-library-folder-selection task
// 2.3: PUT /api/v1/folders/{folderId} reparents a folder.
func TestScenario_MoveFolderOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var foldersResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)
	root := foldersResp.Items[0].ID

	var auth, settings struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Settings", "parentFolderId": root}, 201, &settings)

	var moved struct {
		ParentFolderID string `json:"parentFolderId"`
	}
	call(t, h, "PUT", "/api/v1/folders/"+auth.ID, jmap{"parentFolderId": settings.ID}, 200, &moved)
	if moved.ParentFolderID != settings.ID {
		t.Errorf("parentFolderId after move = %q, want %q", moved.ParentFolderID, settings.ID)
	}
}

// TestScenario_MoveFolderRejectsCyclesOverHTTP covers task 2.4: moving into
// a descendant, into itself, or moving the root folder are all 400s, not a
// 500 or a silent no-op.
func TestScenario_MoveFolderRejectsCyclesOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var foldersResp struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &foldersResp)
	root := foldersResp.Items[0].ID

	var auth, login struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key),
		jmap{"name": "Login", "parentFolderId": auth.ID}, 201, &login)

	call(t, h, "PUT", "/api/v1/folders/"+auth.ID, jmap{"parentFolderId": login.ID}, 400, nil)
	call(t, h, "PUT", "/api/v1/folders/"+auth.ID, jmap{"parentFolderId": auth.ID}, 400, nil)
	call(t, h, "PUT", "/api/v1/folders/"+root, jmap{"parentFolderId": auth.ID}, 400, nil)
}

// TestScenario_MoveFolderRequiresSectionEditOverHTTP covers task 2.5: a role
// without sectionEdit (Tester, which grants neither sectionCreate nor
// sectionDelete) gets 403, not a silent success.
func TestScenario_MoveFolderRequiresSectionEditOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)
	var foldersResp struct{ Items []jmap }
	callAs(t, handler, admin, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", projectKey), nil, 200, &foldersResp)
	root, _ := foldersResp.Items[0]["id"].(string)
	var auth jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", projectKey),
		jmap{"name": "Auth", "parentFolderId": root}, 201, &auth)
	authID, _ := auth["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "tester-mover@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, handler, "tester-mover@example.com", "correcthorse")

	callAs(t, handler, testerCookie, "PUT", "/api/v1/folders/"+authID, jmap{"parentFolderId": root}, 403, nil)
}
