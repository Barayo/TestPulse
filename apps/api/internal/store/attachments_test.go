package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestStageForItem_CreatesUnlinkedAttachment(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	att, err := s.Attachments.StageForItem(ctx, items[0].ID, "shot.png", "image/png", []byte("fake-png-bytes"))
	if err != nil {
		t.Fatalf("StageForItem: %v", err)
	}
	if att.ResultID != "" {
		t.Errorf("ResultID = %q, want empty (unlinked)", att.ResultID)
	}
	if att.RunItemID != items[0].ID {
		t.Errorf("RunItemID = %q, want %q", att.RunItemID, items[0].ID)
	}
}

func TestAttachToResult_LinksImmediately(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	res, err := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("AppendResult: %v", err)
	}

	att, err := s.Attachments.AttachToResult(ctx, res.ID, "shot.png", "image/png", []byte("fake-png-bytes"))
	if err != nil {
		t.Fatalf("AttachToResult: %v", err)
	}
	if att.ResultID != res.ID {
		t.Errorf("ResultID = %q, want %q", att.ResultID, res.ID)
	}

	list, err := s.Attachments.ByResult(ctx, res.ID)
	if err != nil || len(list) != 1 {
		t.Fatalf("ByResult = %d, %v; want 1 attachment", len(list), err)
	}
	if list[0].ID != att.ID || list[0].Filename != "shot.png" || list[0].ContentType != "image/png" {
		t.Errorf("ByResult[0] = %+v, want id=%q filename=shot.png contentType=image/png", list[0], att.ID)
	}
}

func TestAttachToResult_RejectsOnClosedRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	res, _ := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, "")
	if err := s.Runs.Close(ctx, run.ID); err != nil {
		t.Fatalf("Close: %v", err)
	}

	_, err := s.Attachments.AttachToResult(ctx, res.ID, "shot.png", "image/png", []byte("fake-png-bytes"))
	if !errors.Is(err, store.ErrRunClosed) {
		t.Fatalf("expected ErrRunClosed, got %v", err)
	}
}

func TestGetAttachment_ReturnsBytes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	staged, _ := s.Attachments.StageForItem(ctx, items[0].ID, "shot.png", "image/png", []byte("fake-png-bytes"))

	att, data, err := s.Attachments.Get(ctx, staged.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(data) != "fake-png-bytes" {
		t.Errorf("Get bytes = %q, want %q", data, "fake-png-bytes")
	}
	if att.Filename != "shot.png" {
		t.Errorf("Get filename = %q, want shot.png", att.Filename)
	}
}

func TestAppendResult_LinksStagedAttachments(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	itemID := items[0].ID

	a1, _ := s.Attachments.StageForItem(ctx, itemID, "shot1.png", "image/png", []byte("one"))
	a2, _ := s.Attachments.StageForItem(ctx, itemID, "shot2.png", "image/png", []byte("two"))

	res, err := s.Runs.AppendResult(ctx, itemID, domain.NewResult{
		Actor: "ana", Verdict: domain.VerdictFailed, AttachmentIDs: []string{a1.ID, a2.ID},
	}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("AppendResult: %v", err)
	}

	list, err := s.Attachments.ByResult(ctx, res.ID)
	if err != nil || len(list) != 2 {
		t.Fatalf("ByResult = %d, %v; want 2", len(list), err)
	}
}

func TestAppendResult_RejectsAttachmentFromDifferentItem(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "Login works")
	c2 := mustCase(t, s, p.ID, "Logout works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c1.ID, c2.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	staged, _ := s.Attachments.StageForItem(ctx, items[0].ID, "shot.png", "image/png", []byte("one"))

	_, err := s.Runs.AppendResult(ctx, items[1].ID, domain.NewResult{
		Actor: "ana", Verdict: domain.VerdictFailed, AttachmentIDs: []string{staged.ID},
	}, domain.ResultActorUnknown, "")
	if !errors.Is(err, store.ErrInvalidAttachment) {
		t.Fatalf("expected ErrInvalidAttachment, got %v", err)
	}

	results, _ := s.Runs.Results(ctx, items[1].ID)
	if len(results) != 0 {
		t.Fatalf("expected no result recorded on rejection, got %d", len(results))
	}
}

func TestAppendResult_WithInlineAttachments(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	res, err := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{
		Actor: "ana", Verdict: domain.VerdictFailed,
		Attachments: []domain.NewAttachment{{Filename: "shot.png", ContentType: "image/png", Data: []byte("inline")}},
	}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("AppendResult: %v", err)
	}

	list, err := s.Attachments.ByResult(ctx, res.ID)
	if err != nil || len(list) != 1 {
		t.Fatalf("ByResult = %d, %v; want 1", len(list), err)
	}
	if list[0].Filename != "shot.png" {
		t.Errorf("Filename = %q, want shot.png", list[0].Filename)
	}
}

func TestResults_IncludesAttachments(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	res, _ := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{
		Actor: "ana", Verdict: domain.VerdictFailed,
		Attachments: []domain.NewAttachment{{Filename: "shot.png", ContentType: "image/png", Data: []byte("inline")}},
	}, domain.ResultActorUnknown, "")

	results, err := s.Runs.Results(ctx, items[0].ID)
	if err != nil || len(results) != 1 {
		t.Fatalf("Results = %d, %v; want 1", len(results), err)
	}
	if len(results[0].Attachments) != 1 || results[0].Attachments[0].Filename != "shot.png" {
		t.Errorf("Results[0].Attachments = %+v, want one shot.png attachment", results[0].Attachments)
	}
	if results[0].ID != res.ID {
		t.Fatalf("sanity: result id mismatch")
	}
}

func TestImport_AttachesScreenshotsKeyedByCaseKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	run, err := s.Runs.Import(ctx, p.ID, "ci run", []store.ImportItem{
		{
			CaseID:   c.ID,
			TestName: "tests/test_login.py::test_login",
			Result: domain.NewResult{
				Actor: "ci", Verdict: domain.VerdictFailed,
				Attachments: []domain.NewAttachment{{Filename: "failure.png", ContentType: "image/png", Data: []byte("evidence")}},
			},
		},
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}

	items, _ := s.Runs.Items(ctx, run.ID, "")
	results, err := s.Runs.Results(ctx, items[0].ID)
	if err != nil || len(results) != 1 {
		t.Fatalf("Results = %d, %v; want 1", len(results), err)
	}
	if len(results[0].Attachments) != 1 || results[0].Attachments[0].Filename != "failure.png" {
		t.Errorf("Results[0].Attachments = %+v, want one failure.png attachment", results[0].Attachments)
	}
}

func TestResultProjectID_Resolves(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	res, _ := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, "")

	projectID, err := s.Runs.ResultProjectID(ctx, res.ID)
	if err != nil {
		t.Fatalf("ResultProjectID: %v", err)
	}
	if projectID != p.ID {
		t.Errorf("ResultProjectID = %q, want %q", projectID, p.ID)
	}
}

func TestResultProjectID_UnknownIsNotFound(t *testing.T) {
	s := testStore(t)
	_, err := s.Runs.ResultProjectID(context.Background(), "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestAttachmentProjectID_Resolves(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	staged, _ := s.Attachments.StageForItem(ctx, items[0].ID, "shot.png", "image/png", []byte("bytes"))

	projectID, err := s.Attachments.ProjectID(ctx, staged.ID)
	if err != nil {
		t.Fatalf("ProjectID: %v", err)
	}
	if projectID != p.ID {
		t.Errorf("ProjectID = %q, want %q", projectID, p.ID)
	}
}

func TestByItem_ListsOnlyStagedAttachments(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	staged, _ := s.Attachments.StageForItem(ctx, items[0].ID, "staged.png", "image/png", []byte("one"))
	res, _ := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, "")
	_, _ = s.Attachments.AttachToResult(ctx, res.ID, "linked.png", "image/png", []byte("two"))

	list, err := s.Attachments.ByItem(ctx, items[0].ID)
	if err != nil || len(list) != 1 {
		t.Fatalf("ByItem = %d, %v; want 1 (only the staged one)", len(list), err)
	}
	if list[0].ID != staged.ID {
		t.Errorf("ByItem[0].ID = %q, want %q", list[0].ID, staged.ID)
	}
}

func TestDeleteAttachment_RemovesIt(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	staged, _ := s.Attachments.StageForItem(ctx, items[0].ID, "shot.png", "image/png", []byte("fake-png-bytes"))

	if err := s.Attachments.Delete(ctx, staged.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, _, err := s.Attachments.Get(ctx, staged.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}
