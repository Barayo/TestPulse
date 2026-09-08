import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { useDataRevision } from '@/lib/DataRevision'

export type LandingFolderChild = { id: string; name: string; caseCount: number }
// children holds this section's immediate subsections (enrich-project-landing-panels'
// inline-expand preview) — empty when it has none.
export type LandingFolder = {
  id: string
  name: string
  caseCount: number
  subsectionCount: number
  children: LandingFolderChild[]
}
// LandingSuite/LandingRun.id holds the suite/run's key (add-human-readable-keys),
// not its internal id — every route/link these feed is key-based.
export type LandingSuite = { id: string; name: string; caseCount: number; passRate: number | null }
export type LandingRun = {
  id: string
  name: string
  createdAt: string
  passRate: number | null
  passCount: number
  total: number
}

export type ProjectLanding = {
  folders: LandingFolder[]
  totalFolders: number
  totalCases: number
  suites: LandingSuite[]
  totalSuites: number
  runs: LandingRun[]
  totalRuns: number
  loaded: boolean
  // fetchAllPages caps its drain (add-cursor-pagination task 12.1d) — the
  // computed totals below undercount past that cap. True if any of the
  // four underlying fetches hit it, so the panels can show "N+" instead
  // of a silently wrong exact count.
  truncated: boolean
}

// Raised from 4 (enrich-project-landing design.md) now that the summary
// strip above the panels carries the "how healthy is this project" signal —
// the panels themselves can afford to show a bit more without feeling dense.
const TOP_N = 5
const empty: ProjectLanding = {
  folders: [],
  totalFolders: 0,
  totalCases: 0,
  suites: [],
  totalSuites: 0,
  runs: [],
  totalRuns: 0,
  loaded: false,
  truncated: false,
}

// Top-level folders (children of root) with a recursive case count, top
// suites by creation order with their case count, and the most recent runs
// with a pass rate — all computed client-side from already-fetched project
// data (design.md D4), capped to TOP_N so the landing stays glanceable.
//
// `isMember`/`accessLoading` are passed in explicitly (rather than calling
// useAuth()/useProjectReadAccess internally) so this hook stays usable
// from a bare renderHook() with no AuthProvider wrapper (see
// useProjectLanding.test.tsx) and so the dual-mode branch
// (unify-authenticated-and-public-views design.md D2) is a literal,
// visible fact of the call site, matching every other page's pattern.
// Every dual-mode fetch effect must wait on `!accessLoading` before
// firing either branch — otherwise a caller's first paint (while the
// session check, or D11's confirmed-read-access check, is still in
// flight) would transiently fire the wrong branch instead. `isMember`
// used to be the raw `AuthUser | null` — narrowed to a boolean per D11,
// since a signed-in non-member must take the public branch exactly like
// an anonymous visitor, which the caller (ProjectPage) now resolves via
// useProjectReadAccess before calling in.
export function useProjectLanding(
  projectKey: string | undefined,
  isMember: boolean,
  accessLoading: boolean,
): ProjectLanding {
  const dataRevision = useDataRevision()
  const [landing, setLanding] = useState<ProjectLanding>(empty)

  useEffect(() => {
    if (!projectKey || accessLoading) {
      setLanding(empty)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal

    void Promise.all(
      isMember
        ? [
            fetchAllPages((cursor) =>
              api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/projects/{projectKey}/runs', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
          ]
        : [
            fetchAllPages((cursor) =>
              api.GET('/api/v1/public/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/public/projects/{projectKey}/cases', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
            fetchAllPages((cursor) =>
              api.GET('/api/v1/public/projects/{projectKey}/runs', { params: { path: { projectKey }, query: { cursor, limit: 200 } }, signal }).then(({ data }) => data ?? { items: [], nextCursor: null }),
            ),
          ],
    )
      .then(async ([foldersPage, casesPage, suitesPage, runsPage]) => {
        const folders = foldersPage.items
        const cases = casesPage.items
        const suites = suitesPage.items
        const runs = runsPage.items
        const truncated = foldersPage.truncated || casesPage.truncated || suitesPage.truncated || runsPage.truncated

        const root = folders.find((f) => !f.parentFolderId)
        const topLevel = folders.filter((f) => f.parentFolderId === root?.id)

        function descendantIds(folderId: string): Set<string> {
          const ids = new Set([folderId])
          let added = true
          while (added) {
            added = false
            for (const f of folders) {
              if (f.parentFolderId && ids.has(f.parentFolderId) && !ids.has(f.id)) {
                ids.add(f.id)
                added = true
              }
            }
          }
          return ids
        }

        const landingFolders: LandingFolder[] = topLevel.map((f) => {
          const ids = descendantIds(f.id)
          const caseCount = cases.filter((c) => ids.has(c.folderId)).length
          const subsections = folders.filter((sf) => sf.parentFolderId === f.id)
          const children: LandingFolderChild[] = subsections.map((sf) => {
            const childIds = descendantIds(sf.id)
            return { id: sf.id, name: sf.name, caseCount: cases.filter((c) => childIds.has(c.folderId)).length }
          })
          return { id: f.id, name: f.name, caseCount, subsectionCount: subsections.length, children }
        })

        // Cases created before any subsection existed default into root,
        // which has no row of its own here otherwise — surface them as a
        // pseudo-row so they're never invisible (move-cases-between-folders
        // design.md). Prepended, so it competes for the TOP_N slot like any
        // other row rather than being exempted from the cap.
        const rootCaseCount = root ? cases.filter((c) => c.folderId === root.id).length : 0
        if (root && rootCaseCount > 0) {
          landingFolders.unshift({ id: root.id, name: 'Unsectioned', caseCount: rootCaseCount, subsectionCount: 0, children: [] })
        }

        const landingSuites: LandingSuite[] = suites
          .slice(0, TOP_N)
          .map((s) => ({ id: s.key, name: s.name, caseCount: s.caseIds.length, passRate: s.passRate }))

        const recentRuns = [...runs]
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, TOP_N)
        const landingRuns: LandingRun[] = await Promise.all(
          recentRuns.map(async (r) => {
            const { data: summary } = isMember
              ? await api.GET('/api/v1/runs/{runKey}/summary', { params: { path: { runKey: r.key } }, signal })
              : await api.GET('/api/v1/public/runs/{runKey}/summary', { params: { path: { runKey: r.key } }, signal })
            const total = summary?.total ?? 0
            const passCount = summary?.counts.pass ?? 0
            const passRate = total > 0 ? Math.round((passCount / total) * 100) : null
            return { id: r.key, name: r.name, createdAt: r.createdAt, passRate, passCount, total }
          }),
        )

        if (!cancelled) {
          setLanding({
            folders: landingFolders.slice(0, TOP_N),
            totalFolders: topLevel.length,
            totalCases: cases.length,
            suites: landingSuites,
            totalSuites: suites.length,
            runs: landingRuns,
            totalRuns: runs.length,
            loaded: true,
            truncated,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setLanding({ ...empty, loaded: true })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [projectKey, dataRevision, isMember, accessLoading])

  return landing
}
