// add-cursor-pagination: every list endpoint the backend paginates now
// caps a single request at 50 (default) or 200 (max) items. Most callers
// in this codebase use these endpoints as reference-data lookups (case
// pickers, assignee dropdowns, folder trees) that need the *complete* set
// to function correctly, not a paginated display — a picker silently
// missing items past the first page is broken, not paginated. This drains
// pages and returns the concatenated array, preserving the pre-pagination
// "give me everything" behavior at the cost of a few extra fast round
// trips instead of one large one.
//
// MAX_PAGES bounds the drain itself (security review, add-cursor-pagination
// task 12.1d): looping until `nextCursor` is null with no ceiling just moves
// the unbounded-query problem this change was meant to fix from "one big
// SQL query" to "an unbounded number of small ones fired back-to-back from
// the browser" — worse for latency, and a real self-inflicted-availability
// risk for a tenant whose data legitimately grows past the ceiling. At the
// default per-page limit of 200, 25 pages caps a single drain at 5,000
// items. `truncated: true` tells the caller the set was cut off, so callers
// with a searchable picker/dropdown can surface that instead of silently
// showing an incomplete list as if it were complete.
export const DEFAULT_MAX_PAGES = 25

export async function fetchAllPages<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<{ items: T[]; truncated: boolean }> {
  const all: T[] = []
  let cursor: string | undefined
  for (let pageCount = 0; pageCount < maxPages; pageCount++) {
    const page = await fetchPage(cursor)
    all.push(...page.items)
    if (!page.nextCursor) return { items: all, truncated: false }
    cursor = page.nextCursor
  }
  return { items: all, truncated: true }
}
