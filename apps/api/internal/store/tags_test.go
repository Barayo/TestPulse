package store_test

import (
	"context"
	"testing"
)

// --- Tags (add-project-tags, task 2.1) ---

func TestAssignTagCreatesAndLinksIt(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	if err := s.Tags.Assign(ctx, p.ID, "mobile"); err != nil {
		t.Fatalf("Assign: %v", err)
	}

	names, err := s.Tags.NamesForProject(ctx, p.ID)
	if err != nil {
		t.Fatalf("NamesForProject: %v", err)
	}
	if len(names) != 1 || names[0] != "mobile" {
		t.Errorf("NamesForProject = %v, want [mobile]", names)
	}

	all, err := s.Tags.ListNames(ctx)
	if err != nil {
		t.Fatalf("ListNames: %v", err)
	}
	if len(all) != 1 || all[0] != "mobile" {
		t.Errorf("ListNames = %v, want [mobile]", all)
	}
}

func TestAssignIsCaseInsensitiveAndReusesExistingTag(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p1 := mustProject(t, s)
	p2, err := s.Projects.Create(ctx, "Second", "")
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Tags.Assign(ctx, p1.ID, "Mobile"); err != nil {
		t.Fatalf("Assign(Mobile): %v", err)
	}
	if err := s.Tags.Assign(ctx, p2.ID, "mobile"); err != nil {
		t.Fatalf("Assign(mobile): %v", err)
	}

	all, err := s.Tags.ListNames(ctx)
	if err != nil {
		t.Fatalf("ListNames: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("ListNames = %v, want exactly one shared tag", all)
	}
}

func TestAssignTrimsWhitespace(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	if err := s.Tags.Assign(ctx, p.ID, "  mobile  "); err != nil {
		t.Fatalf("Assign: %v", err)
	}

	names, err := s.Tags.NamesForProject(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 || names[0] != "mobile" {
		t.Errorf("NamesForProject = %v, want [mobile]", names)
	}
}

func TestAssignIsIdempotent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	if err := s.Tags.Assign(ctx, p.ID, "mobile"); err != nil {
		t.Fatalf("first Assign: %v", err)
	}
	if err := s.Tags.Assign(ctx, p.ID, "mobile"); err != nil {
		t.Fatalf("second Assign (should be idempotent): %v", err)
	}

	names, err := s.Tags.NamesForProject(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 {
		t.Errorf("NamesForProject = %v, want exactly one entry", names)
	}
}

func TestRemoveTagUnlinksButKeepsVocabulary(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	if err := s.Tags.Assign(ctx, p.ID, "mobile"); err != nil {
		t.Fatal(err)
	}
	if err := s.Tags.Remove(ctx, p.ID, "mobile"); err != nil {
		t.Fatalf("Remove: %v", err)
	}

	names, err := s.Tags.NamesForProject(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 0 {
		t.Errorf("NamesForProject after Remove = %v, want empty", names)
	}

	all, err := s.Tags.ListNames(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 || all[0] != "mobile" {
		t.Errorf("ListNames after Remove = %v, want [mobile] still in vocabulary", all)
	}
}

func TestRemoveNonAssignedTagIsNoop(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	if err := s.Tags.Remove(ctx, p.ID, "never-assigned"); err != nil {
		t.Errorf("Remove with no prior assignment: %v", err)
	}
}

// --- Tags in Summaries (task 2.3) ---

func TestSummariesIncludeProjectTags(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "summ-tags@b.com", false)
	p1 := mustProject(t, s)
	p2, err := s.Projects.Create(ctx, "Second", "")
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Tags.Assign(ctx, p1.ID, "mobile"); err != nil {
		t.Fatal(err)
	}
	if err := s.Tags.Assign(ctx, p1.ID, "internal"); err != nil {
		t.Fatal(err)
	}

	summaries, err := s.Projects.Summaries(ctx, u.ID)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	byID := map[string][]string{}
	for _, sm := range summaries {
		byID[sm.ProjectID] = sm.Tags
	}

	got := byID[p1.ID]
	if len(got) != 2 {
		t.Fatalf("p1 Tags = %v, want 2 entries", got)
	}
	want := map[string]bool{"mobile": true, "internal": true}
	for _, tag := range got {
		if !want[tag] {
			t.Errorf("unexpected tag %q in p1's summary", tag)
		}
	}

	if untagged := byID[p2.ID]; untagged == nil || len(untagged) != 0 {
		t.Errorf("p2 Tags = %v, want non-nil empty slice", untagged)
	}
}

func TestNamesForProjectWithNoTagsIsEmpty(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	names, err := s.Tags.NamesForProject(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 0 {
		t.Errorf("NamesForProject = %v, want empty", names)
	}
}
