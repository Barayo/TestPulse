package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DefaultUnitTestResultRetention bounds how many of a unit test's most
// recent results are retained (add-unit-test-inventory design.md D4) —
// overridable per call via ImportWithRetention, so tests can exercise the
// bound without waiting for hundreds of inserts.
const DefaultUnitTestResultRetention = 100

// UnitTestResultItem is one reported result to ingest, identified by its
// (ClassName, Name) pair — the JUnit <testcase classname/name> attributes,
// read with no TestPulse-specific property required (design.md D5).
type UnitTestResultItem struct {
	ClassName  string
	Name       string
	Verdict    domain.Verdict
	DurationMs *int
	OccurredAt time.Time
	ImportRef  string
}

// UnitTestResultRepo backs the unit-test-inventory capability: a lean,
// auto-created identity per (project, classname, name) with a bounded
// history of reported results (add-unit-test-inventory, #34) — kept
// deliberately separate from CaseRepo/RunRepo, which carry a full
// versioned content snapshot per row, the wrong cost model for this
// table's expected cardinality.
type UnitTestResultRepo struct {
	pool *pgxpool.Pool
}

// ImportResult tells the caller how many distinct identities in the
// batch were brand-new versus already known — surfaced in the ingestion
// endpoint's response (design.md, task 5.1).
type ImportResult struct {
	Created int
	Updated int
}

// Import upserts each item's identity and appends a result row, pruning
// each touched identity's history to DefaultUnitTestResultRetention.
func (r *UnitTestResultRepo) Import(ctx context.Context, projectID string, items []UnitTestResultItem) (ImportResult, error) {
	return r.ImportWithRetention(ctx, projectID, items, DefaultUnitTestResultRetention)
}

// importItemJSON is UnitTestResultItem's wire shape for the batched
// jsonb_array_elements-based statements below — a report can carry tens
// of thousands of <testcase> entries, so every statement in
// ImportWithRetention executes once per call regardless of batch size,
// never once per item (design.md's batch-ingestion-performance risk).
type importItemJSON struct {
	ClassName  string `json:"className"`
	Name       string `json:"name"`
	Verdict    string `json:"verdict"`
	DurationMs *int   `json:"durationMs"`
	OccurredAt string `json:"occurredAt"`
	ImportRef  string `json:"importRef"`
}

// ImportWithRetention is Import with an explicit retention bound —
// exported so tests can exercise pruning without hundreds of inserts.
func (r *UnitTestResultRepo) ImportWithRetention(ctx context.Context, projectID string, items []UnitTestResultItem, retention int) (ImportResult, error) {
	if len(items) == 0 {
		return ImportResult{}, nil
	}

	wire := make([]importItemJSON, len(items))
	for i, item := range items {
		wire[i] = importItemJSON{
			ClassName:  item.ClassName,
			Name:       item.Name,
			Verdict:    string(item.Verdict),
			DurationMs: item.DurationMs,
			OccurredAt: item.OccurredAt.UTC().Format(time.RFC3339Nano),
			ImportRef:  item.ImportRef,
		}
	}
	payload, err := json.Marshal(wire)
	if err != nil {
		return ImportResult{}, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return ImportResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Count how many of the batch's distinct identities already exist,
	// before the upsert below creates any new ones — the only reliable
	// way to split created vs. updated across an INSERT ... ON CONFLICT
	// DO UPDATE (its RETURNING set can't distinguish the two branches).
	distinctIdentities := map[string]struct{}{}
	for _, item := range items {
		distinctIdentities[item.ClassName+"\x00"+item.Name] = struct{}{}
	}
	var alreadyExisted int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM unit_tests t
		 JOIN (
		   SELECT DISTINCT (elem->>'className') AS class_name, (elem->>'name') AS name
		   FROM jsonb_array_elements($2::jsonb) AS elem
		 ) i ON t.project_id = $1 AND t.class_name = i.class_name AND t.name = i.name`,
		projectID, string(payload),
	).Scan(&alreadyExisted); err != nil {
		return ImportResult{}, err
	}
	result := ImportResult{
		Created: len(distinctIdentities) - alreadyExisted,
		Updated: alreadyExisted,
	}

	// One upsert per distinct (class_name, name) in the batch — when the
	// same test is reported more than once in one import, the
	// occurrence with the latest occurred_at wins the cached last_*
	// fields (DISTINCT ON ... ORDER BY occurred_at DESC).
	if _, err := tx.Exec(ctx,
		`WITH input AS (
		   SELECT (elem->>'className') AS class_name,
		          (elem->>'name') AS name,
		          (elem->>'verdict') AS verdict,
		          (elem->>'durationMs')::int AS duration_ms,
		          (elem->>'occurredAt')::timestamptz AS occurred_at
		   FROM jsonb_array_elements($2::jsonb) AS elem
		 ),
		 representative AS (
		   SELECT DISTINCT ON (class_name, name) class_name, name, verdict, duration_ms, occurred_at
		   FROM input
		   ORDER BY class_name, name, occurred_at DESC
		 )
		 INSERT INTO unit_tests (project_id, class_name, name, first_seen_at, last_seen_at, last_verdict, last_duration_ms, last_occurred_at)
		 SELECT $1, class_name, name, occurred_at, occurred_at, verdict, duration_ms, occurred_at
		 FROM representative
		 ON CONFLICT (project_id, class_name, name) DO UPDATE SET
		   last_seen_at = EXCLUDED.last_seen_at,
		   last_verdict = EXCLUDED.last_verdict,
		   last_duration_ms = EXCLUDED.last_duration_ms,
		   last_occurred_at = EXCLUDED.last_occurred_at`,
		projectID, string(payload),
	); err != nil {
		return ImportResult{}, err
	}

	// Every original occurrence (not deduplicated) becomes its own
	// history row, resolved to its identity's now-guaranteed-to-exist id.
	if _, err := tx.Exec(ctx,
		`WITH input AS (
		   SELECT (elem->>'className') AS class_name,
		          (elem->>'name') AS name,
		          (elem->>'verdict') AS verdict,
		          (elem->>'durationMs')::int AS duration_ms,
		          (elem->>'occurredAt')::timestamptz AS occurred_at,
		          (elem->>'importRef') AS import_ref
		   FROM jsonb_array_elements($2::jsonb) AS elem
		 )
		 INSERT INTO unit_test_results (unit_test_id, verdict, duration_ms, occurred_at, import_ref)
		 SELECT t.id, i.verdict, i.duration_ms, i.occurred_at, i.import_ref
		 FROM input i
		 JOIN unit_tests t ON t.project_id = $1 AND t.class_name = i.class_name AND t.name = i.name`,
		projectID, string(payload),
	); err != nil {
		return ImportResult{}, err
	}

	// Prune every identity touched by this batch in one statement,
	// regardless of how many distinct identities or results that
	// touches (design.md D4 — bound is per-key, pruned inline on write).
	if _, err := tx.Exec(ctx,
		`WITH touched AS (
		   SELECT DISTINCT t.id
		   FROM unit_tests t
		   JOIN (
		     SELECT DISTINCT (elem->>'className') AS class_name, (elem->>'name') AS name
		     FROM jsonb_array_elements($2::jsonb) AS elem
		   ) i ON t.project_id = $1 AND t.class_name = i.class_name AND t.name = i.name
		 ),
		 ranked AS (
		   SELECT r.id, row_number() OVER (PARTITION BY r.unit_test_id ORDER BY r.occurred_at DESC) AS rn
		   FROM unit_test_results r
		   JOIN touched ON touched.id = r.unit_test_id
		 )
		 DELETE FROM unit_test_results WHERE id IN (SELECT id FROM ranked WHERE rn > $3)`,
		projectID, string(payload), retention,
	); err != nil {
		return ImportResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return ImportResult{}, err
	}
	return result, nil
}

// List returns every unit test's cached current status for a project,
// cursor-paginated and optionally filtered to one verdict — reading only
// unit_tests' cached last_* columns, never joining against
// unit_test_results (design.md D2).
func (r *UnitTestResultRepo) List(ctx context.Context, projectID string, verdict *domain.Verdict, cursor string, limit int) ([]domain.UnitTest, string, error) {
	limit = clampLimit(limit)
	var cursorFirstSeenAt any
	var cursorID any
	if cursor != "" {
		firstSeenAt, id, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		cursorFirstSeenAt, cursorID = firstSeenAt, id
	}
	var verdictFilter any
	if verdict != nil {
		verdictFilter = string(*verdict)
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id, class_name, name, first_seen_at, last_seen_at, last_verdict, last_duration_ms, last_occurred_at
		 FROM unit_tests
		 WHERE project_id = $1
		   AND ($2::text IS NULL OR last_verdict = $2)
		   AND ($3::timestamptz IS NULL OR (first_seen_at, id) > ($3, $4))
		 ORDER BY first_seen_at ASC, id ASC
		 LIMIT $5`,
		projectID, verdictFilter, cursorFirstSeenAt, cursorID, limit+1,
	)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	tests := []domain.UnitTest{}
	for rows.Next() {
		var ut domain.UnitTest
		var lastVerdict string
		if err := rows.Scan(&ut.ID, &ut.ProjectID, &ut.ClassName, &ut.Name, &ut.FirstSeenAt, &ut.LastSeenAt, &lastVerdict, &ut.LastDurationMs, &ut.LastOccurredAt); err != nil {
			return nil, "", err
		}
		ut.LastVerdict = domain.Verdict(lastVerdict)
		tests = append(tests, ut)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(tests) > limit {
		last := tests[limit-1]
		nextCursor = encodeCursor(last.FirstSeenAt, last.ID)
		tests = tests[:limit]
	}
	return tests, nextCursor, nil
}

// History returns one unit test's bounded result history, newest first.
func (r *UnitTestResultRepo) History(ctx context.Context, projectID, className, name string) ([]domain.UnitTestResult, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT r.id, r.unit_test_id, r.verdict, r.duration_ms, r.occurred_at, r.import_ref
		 FROM unit_test_results r
		 JOIN unit_tests t ON t.id = r.unit_test_id
		 WHERE t.project_id = $1 AND t.class_name = $2 AND t.name = $3
		 ORDER BY r.occurred_at DESC`,
		projectID, className, name,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []domain.UnitTestResult{}
	for rows.Next() {
		var res domain.UnitTestResult
		var verdict string
		var importRef *string
		if err := rows.Scan(&res.ID, &res.UnitTestID, &verdict, &res.DurationMs, &res.OccurredAt, &importRef); err != nil {
			return nil, err
		}
		res.Verdict = domain.Verdict(verdict)
		if importRef != nil {
			res.ImportRef = *importRef
		}
		results = append(results, res)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
