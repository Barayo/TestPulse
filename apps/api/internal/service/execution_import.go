package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentimage"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/junitxml"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// ImportInput carries a bulk-import request (add-execution-import).
type ImportInput struct {
	Format string
	Name   string
	Report string
	// Attachments carries images alongside the report, each keyed by the
	// case key of the test it belongs to — the JUnit report itself is never
	// parsed for embedded attachments (add-run-item-screenshot-attachments
	// design.md). An attachment whose case key doesn't match any test that
	// was successfully matched to a case is dropped, not stored, the same
	// as the rest of that unmatched test's data.
	Attachments []domain.NewAttachment
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

	attachmentsByCaseKey := map[string][]domain.NewAttachment{}
	for _, a := range in.Attachments {
		contentType, verr := attachmentimage.ValidateUpload(a.Data)
		if verr != nil {
			return ImportResult{}, invalid("%s", verr)
		}
		a.ContentType = contentType
		attachmentsByCaseKey[a.CaseKey] = append(attachmentsByCaseKey[a.CaseKey], a)
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
	seenKeys := map[string]bool{}
	duplicateSeen := map[string]bool{}
	var duplicateKeys []string
	for _, tc := range parsed.Cases {
		// An untagged testcase carries no testpulse_case_key at all
		// (CaseKey defaults to "") -- it's out of scope for the import
		// entirely, not a failed match, so it must never appear in
		// unmatched (#168).
		if tc.CaseKey == "" {
			continue
		}
		caseID, err := s.store.Cases.IDByKeyInProject(ctx, projectID, tc.CaseKey)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				unmatched = append(unmatched, UnmatchedTest{CaseKey: tc.CaseKey, Verdict: tc.Verdict})
				continue
			}
			return ImportResult{}, err
		}
		if seenKeys[tc.CaseKey] {
			// Two testcases sharing a case key would otherwise reach
			// store.Runs.Import and hit test_run_items' (run_id, case_id)
			// unique constraint, surfacing as an unhandled 500 (#173).
			// Collected (not returned immediately) so every offending key
			// in the report is named at once, not just the first.
			if !duplicateSeen[tc.CaseKey] {
				duplicateSeen[tc.CaseKey] = true
				duplicateKeys = append(duplicateKeys, tc.CaseKey)
			}
			continue
		}
		seenKeys[tc.CaseKey] = true
		items = append(items, store.ImportItem{
			CaseID:   caseID,
			TestName: tc.Name,
			Result: domain.NewResult{
				Actor:       actor.DisplayName,
				Verdict:     tc.Verdict,
				StartTime:   tc.StartTime,
				EndTime:     tc.EndTime,
				Platform:    tc.Platform,
				Version:     tc.Version,
				Tags:        tc.Tags,
				Attachments: attachmentsByCaseKey[tc.CaseKey],
			},
		})
	}
	if len(duplicateKeys) > 0 {
		return ImportResult{}, invalid("duplicate case key(s) in report: %s", strings.Join(duplicateKeys, ", "))
	}

	run, err := s.store.Runs.Import(ctx, projectID, name, items)
	if err != nil {
		return ImportResult{}, err
	}
	s.audit(ctx, "import", "run", run.ID)
	return ImportResult{Run: run, Matched: len(items), Unmatched: unmatched}, nil
}
