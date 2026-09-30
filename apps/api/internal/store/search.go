package store

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SearchRepo struct{ pool *pgxpool.Pool }

// Search performs cross-entity full-text search over cases (indexed by
// their CURRENT version's content only), suites, runs, projects, releases,
// and test plans, backed by the tsvector+GIN indexes from
// 00012_mcp_search_index.sql (add-mcp-server design.md). Results are
// restricted to projectIDs — the caller (the MCP tool layer) has already
// resolved which projects the requesting actor may see — and ranked by
// relevance, highest first. Offset-paginated (add-mcp-search-listprojects-
// pagination design.md D2): unlike every other *Page store method's true
// (created_at, id) keyset pagination, this is a plain LIMIT/OFFSET
// internally — a stable keyset tiebreak isn't practical across a UNION ALL
// of independently-computed, floating-point ts_rank values from 6
// different tables, and search results aren't append-only growing data
// the way paginated lists elsewhere are. The offset is still wrapped in an
// opaque cursor (encodeOffsetCursor/decodeOffsetCursor) so the caller-
// facing interface matches every *Page method's cursor shape exactly.
// This is Search's only call site (the MCP search tool), so its signature
// is extended directly rather than adding a parallel unpaginated method.
func (r *SearchRepo) Search(ctx context.Context, query string, projectIDs []string, cursor string, limit int) ([]domain.SearchResult, string, error) {
	if len(projectIDs) == 0 {
		return []domain.SearchResult{}, "", nil
	}
	limit = clampLimit(limit)
	offset := 0
	if cursor != "" {
		decoded, err := decodeOffsetCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		offset = decoded
	}
	rows, err := r.pool.Query(ctx, `
		WITH q AS (SELECT plainto_tsquery('english', $1) AS tsq)
		SELECT 'case' AS entity_type, c.key, tcv.title AS name, c.project_id, ts_rank(tcv.search_vector, q.tsq) AS rank
		FROM test_cases c
		JOIN test_case_versions tcv ON tcv.case_id = c.id AND tcv.version = c.current_version
		CROSS JOIN q
		WHERE NOT c.deleted AND c.project_id = ANY($2) AND tcv.search_vector @@ q.tsq
		UNION ALL
		SELECT 'suite', s.key, s.name, s.project_id, ts_rank(s.search_vector, q.tsq)
		FROM test_suites s CROSS JOIN q
		WHERE s.project_id = ANY($2) AND s.search_vector @@ q.tsq
		UNION ALL
		SELECT 'run', tr.key, tr.name, tr.project_id, ts_rank(tr.search_vector, q.tsq)
		FROM test_runs tr CROSS JOIN q
		WHERE tr.project_id = ANY($2) AND tr.search_vector @@ q.tsq
		UNION ALL
		SELECT 'project', p.key, p.name, p.id, ts_rank(p.search_vector, q.tsq)
		FROM projects p CROSS JOIN q
		WHERE p.id = ANY($2) AND p.search_vector @@ q.tsq
		UNION ALL
		SELECT 'release', rel.key, rel.name, rel.project_id, ts_rank(rel.search_vector, q.tsq)
		FROM releases rel CROSS JOIN q
		WHERE rel.project_id = ANY($2) AND rel.search_vector @@ q.tsq
		UNION ALL
		SELECT 'testPlan', tp.key, tp.name, tp.project_id, ts_rank(tp.search_vector, q.tsq)
		FROM test_plans tp CROSS JOIN q
		WHERE tp.project_id = ANY($2) AND tp.search_vector @@ q.tsq
		ORDER BY rank DESC
		LIMIT $3 OFFSET $4`, query, projectIDs, limit+1, offset)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	results := []domain.SearchResult{}
	for rows.Next() {
		var res domain.SearchResult
		if err := rows.Scan(&res.EntityType, &res.Key, &res.Name, &res.ProjectID, &res.Rank); err != nil {
			return nil, "", err
		}
		results = append(results, res)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(results) > limit {
		nextCursor = encodeOffsetCursor(offset + limit)
		results = results[:limit]
	}
	return results, nextCursor, nil
}
