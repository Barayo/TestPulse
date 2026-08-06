import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FileTextIcon, LayersIcon, CirclePlayIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { StatusPill } from '@/components/HealthBar'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']
type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Run = components['schemas']['Run']

// The public, unauthenticated read-only view of a project
// (enable-public-project-access) — reachable at /public/:projectKey outside
// RequireAuth. Deliberately renders no write controls at all (there's
// nothing to hide, since nothing that could mutate anything is ever built
// here) rather than reusing the authenticated ProjectPage/FolderExplorerPage/
// SuitesPage/RunsPage with permissions forced off — scope narrowed during
// implementation; see tasks.md 5.4 for the deferred per-resource
// (suite/run/case) deep-link pages.
export default function PublicProjectPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [project, setProject] = useState<Project>()
  const [cases, setCases] = useState<TestCase[]>()
  const [suites, setSuites] = useState<Suite[]>()
  const [runs, setRuns] = useState<Run[]>()
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!projectKey) return
    let cancelled = false
    void api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }).then(({ data, response }) => {
      if (cancelled) return
      if (!response.ok || !data) {
        setNotFound(true)
        return
      }
      setProject(data)
    })
    void api
      .GET('/api/v1/public/projects/{projectKey}/cases', { params: { path: { projectKey } } })
      .then(({ data }) => !cancelled && setCases(data ?? []))
    void api
      .GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey } } })
      .then(({ data }) => !cancelled && setSuites(data ?? []))
    void api
      .GET('/api/v1/public/projects/{projectKey}/runs', { params: { path: { projectKey } } })
      .then(({ data }) => !cancelled && setRuns(data ?? []))
    return () => {
      cancelled = true
    }
  }, [projectKey])

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          This project isn&apos;t public, or doesn&apos;t exist. Not found.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-4 py-3 sm:px-6 sm:py-4">
          <span className="text-[24px] leading-none font-semibold">
            <span className="tp-wordmark-test">Test</span>
            <span className="text-primary tp-wordmark-pulse">Pulse</span>
          </span>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Log in
          </Link>
        </div>
        <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2 text-sm text-muted-foreground sm:px-6">
          <span>
            You&apos;re viewing this project without an account. Some actions (editing, running tests, commenting)
            require signing in.
          </span>
        </div>
      </header>
      <main className="flex-1 space-y-8 px-6 py-8">
        {project && (
          <div>
            <h1 className="tp-heading text-2xl">{project.name}</h1>
            <p className="text-sm text-muted-foreground">{project.key} · viewing publicly</p>
          </div>
        )}

        <section aria-label="Library" className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileTextIcon className="size-4" aria-hidden="true" />
            Cases
          </h2>
          <ul className="space-y-1">
            {cases?.map((c) => (
              <li key={c.id} className="rounded-md border bg-card px-3 py-2 text-sm">
                {c.content.title}
              </li>
            ))}
            {cases?.length === 0 && <li className="text-sm text-muted-foreground">No cases yet.</li>}
          </ul>
        </section>

        <section aria-label="Suites" className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LayersIcon className="size-4" aria-hidden="true" />
            Suites
          </h2>
          <ul className="space-y-1">
            {suites?.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                <span>{s.name}</span>
                <StatusPill rate={s.passRate} />
              </li>
            ))}
            {suites?.length === 0 && <li className="text-sm text-muted-foreground">No suites yet.</li>}
          </ul>
        </section>

        <section aria-label="Runs" className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CirclePlayIcon className="size-4" aria-hidden="true" />
            Runs
          </h2>
          <ul className="space-y-1">
            {runs?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                <span>{r.name}</span>
                <StatusPill rate={r.passRate ?? null} />
              </li>
            ))}
            {runs?.length === 0 && <li className="text-sm text-muted-foreground">No runs yet.</li>}
          </ul>
        </section>
      </main>
    </div>
  )
}
