package store

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// FlakyCases lists every currently-flaky case in a project: one aggregation
// query (add-flaky-test-detection, following add-suite-pass-rate-trend's
// precedent — no per-case fetch loop), scoped to each case's *current*
// version only so an edited case's flakiness resets rather than carrying
// forward from a version that's no longer live. pending/skipped/retest
// executions are excluded — they're not a pass/fail verdict on the case.
func (r *CaseRepo) FlakyCases(ctx context.Context, projectID string) ([]domain.FlakyCase, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT c.key, v.title, c.current_version,
		        count(*) FILTER (WHERE i.current_status = 'pass') AS pass_count,
		        count(*) FILTER (WHERE i.current_status IN ('failed', 'blocked')) AS fail_count
		 FROM test_cases c
		 JOIN test_case_versions v ON v.case_id = c.id AND v.version = c.current_version
		 JOIN test_run_items i ON i.case_id = c.id AND i.case_version = c.current_version
		 WHERE c.project_id = $1 AND NOT c.deleted
		 GROUP BY c.id, c.key, v.title, c.current_version
		 HAVING count(*) FILTER (WHERE i.current_status = 'pass') > 0
		    AND count(*) FILTER (WHERE i.current_status IN ('failed', 'blocked')) > 0
		 ORDER BY c.key`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	flaky := []domain.FlakyCase{}
	for rows.Next() {
		var fc domain.FlakyCase
		var passCount, failCount int
		if err := rows.Scan(&fc.CaseKey, &fc.CaseTitle, &fc.CurrentVersion, &passCount, &failCount); err != nil {
			return nil, err
		}
		min := passCount
		if failCount < min {
			min = failCount
		}
		fc.Rate = int(float64(min) / float64(passCount+failCount) * 100)
		flaky = append(flaky, fc)
	}
	return flaky, rows.Err()
}
