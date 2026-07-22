package service

import (
	"errors"
	"fmt"
	"time"

	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/junitxml"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// ImportInput carries a bulk-import request (add-execution-import).
type ImportInput struct {
	Format string
	Name   string
	Report string
}

// UnmatchedTest is one reported test whose case key had no matching case in
// the target project.
type UnmatchedTest struct {
	CaseKey string
	Verdict domain.Verdict
}

// ImportResult is the outcome of a bulk import: the run created from
// whatever matched, plus what didn't.
type ImportResult struct {
	Run       domain.Run
	Matched   int
	Unmatched []UnmatchedTest
}

// Import parses a test report and matches each reported test to an existing
// case by its key, creating one run with items/results for every match.
// Unmatched tests are reported back, never turned into new cases, and never
// fail the import (design.md's "match-only, no auto-creation" rule).
func (s *Service) Import(ctx context.Context, projectID string, in ImportInput) (ImportResult, error) {
	if in.Format != "junit-xml" {
		return ImportResult{}, invalid("unsupported format %q: must be junit-xml", in.Format)
	}
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return ImportResult{}, unauthorized("authentication required")
	}

	parsed, err := junitxml.Parse([]byte(in.Report))
	if err != nil {
		return ImportResult{}, invalid("%s", err)
	}

	name := in.Name
	if name == "" {
		if parsed.SuiteName != "" {
			name = parsed.SuiteName
		} else {
			name = fmt.Sprintf("Imported run — %s", time.Now().UTC().Format(time.RFC3339))
		}
	}

	var items []store.ImportItem
	var unmatched []UnmatchedTest
	for _, tc := range parsed.Cases {
		caseID, err := s.store.Cases.IDByKeyInProject(ctx, projectID, tc.CaseKey)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				unmatched = append(unmatched, UnmatchedTest{CaseKey: tc.CaseKey, Verdict: tc.Verdict})
				continue
			}
			return ImportResult{}, err
		}
		items = append(items, store.ImportItem{
			CaseID:   caseID,
			TestName: tc.Name,
			Result: domain.NewResult{
				Actor:     actor.DisplayName,
				Verdict:   tc.Verdict,
				StartTime: tc.StartTime,
				EndTime:   tc.EndTime,
				Platform:  tc.Platform,
				Version:   tc.Version,
				Tags:      tc.Tags,
			},
		})
	}

	run, err := s.store.Runs.Import(ctx, projectID, name, items)
	if err != nil {
		return ImportResult{}, err
	}
	s.audit(ctx, "import", "run", run.ID)
	return ImportResult{Run: run, Matched: len(items), Unmatched: unmatched}, nil
}
