package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/junitxml"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// unitTestResultsImportToolName keys idempotency-key lookups
// (Service.IdempotentResult/SaveIdempotentResult, design.md D7) — fixed,
// not derived from the actual route name, since this endpoint has no
// "tool" concept of its own the way MCP calls do.
const unitTestResultsImportToolName = "unit_test_results.import"

// ImportUnitTestResultsOutcome is the outcome of ingesting a native JUnit
// XML report into the unit-test-inventory capability (add-unit-test-
// inventory, #34) — every parsed <testcase> is ingested; there is no
// match-or-skip branch like execution-import's, since identity is
// auto-created, not matched against a pre-existing case (design.md D1).
type ImportUnitTestResultsOutcome struct {
	Imported int `json:"imported"`
	Created  int `json:"created"`
	Updated  int `json:"updated"`
}

// ImportUnitTestResults parses a native JUnit XML report — no TestPulse-
// specific property required (design.md D5) — and auto-creates/updates a
// unit test identity plus a bounded result-history row for every reported
// <testcase>. An optional idempotencyKey makes a retried call (CI's
// at-least-once delivery norm) return the original outcome instead of
// re-ingesting, since a duplicate insert would otherwise silently evict
// real history under the bounded retention this capability enforces
// (design.md D7).
func (s *Service) ImportUnitTestResults(ctx context.Context, projectID, report, idempotencyKey string) (ImportUnitTestResultsOutcome, error) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return ImportUnitTestResultsOutcome{}, unauthorized("authentication required")
	}

	if idempotencyKey != "" {
		if raw, found, err := s.IdempotentResult(ctx, actor.ID, unitTestResultsImportToolName, idempotencyKey); err != nil {
			return ImportUnitTestResultsOutcome{}, err
		} else if found {
			var cached ImportUnitTestResultsOutcome
			if err := json.Unmarshal(raw, &cached); err != nil {
				return ImportUnitTestResultsOutcome{}, err
			}
			return cached, nil
		}
	}

	parsed, err := junitxml.Parse([]byte(report))
	if err != nil {
		return ImportUnitTestResultsOutcome{}, invalid("%s", err)
	}

	items := make([]store.UnitTestResultItem, 0, len(parsed.Cases))
	for _, tc := range parsed.Cases {
		if tc.ClassName == "" || tc.Name == "" {
			// Nothing to build an identity from — skip rather than
			// fabricate a partial key (mirrors execution-import's own
			// "out of scope, not unmatched" treatment of testcases
			// lacking the identifying property it needs).
			continue
		}
		var durationMs *int
		if tc.StartTime != nil && tc.EndTime != nil {
			ms := int(tc.EndTime.Sub(*tc.StartTime).Milliseconds())
			durationMs = &ms
		}
		occurredAt := time.Now().UTC()
		if tc.StartTime != nil {
			occurredAt = *tc.StartTime
		}
		items = append(items, store.UnitTestResultItem{
			ClassName:  tc.ClassName,
			Name:       tc.Name,
			Verdict:    tc.Verdict,
			DurationMs: durationMs,
			OccurredAt: occurredAt,
		})
	}

	imported, err := s.store.UnitTestResults.Import(ctx, projectID, items)
	if err != nil {
		return ImportUnitTestResultsOutcome{}, err
	}

	outcome := ImportUnitTestResultsOutcome{Imported: len(items), Created: imported.Created, Updated: imported.Updated}
	if idempotencyKey != "" {
		if err := s.SaveIdempotentResult(ctx, actor.ID, unitTestResultsImportToolName, idempotencyKey, outcome); err != nil {
			return ImportUnitTestResultsOutcome{}, err
		}
	}
	return outcome, nil
}

// ListUnitTestResults returns a project's unit tests' cached current
// status, cursor-paginated and optionally filtered to one verdict —
// permission (PermRead) is enforced by requirePermission at the routing
// layer, not here, matching every other list-style service method.
func (s *Service) ListUnitTestResults(ctx context.Context, projectID string, verdict *domain.Verdict, cursor string, limit int) ([]domain.UnitTest, string, error) {
	return s.store.UnitTestResults.List(ctx, projectID, verdict, cursor, limit)
}

// UnitTestResultHistory returns one unit test's bounded result history,
// newest first.
func (s *Service) UnitTestResultHistory(ctx context.Context, projectID, className, name string) ([]domain.UnitTestResult, error) {
	return s.store.UnitTestResults.History(ctx, projectID, className, name)
}
