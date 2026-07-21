import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { StarIcon, Grid2x2, Grid3x3 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { StatusPill, ProgressBar, healthLabel, statusBorderClass } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { useProjectSummaries, type ProjectSummary } from '@/lib/useProjectSummaries'
import { useAuth } from '@/lib/useAuth'
import { useIsMobile } from '@/lib/useIsMobile'
import { useViewModeOverride } from '@/lib/useViewModeOverride'
import { resolveViewMode } from '@/lib/viewMode'
import { useSortOverride } from '@/lib/useSortOverride'
import { sortProjects, DEFAULT_SORT_DIRECTION, type SortKey } from '@/lib/sortProjects'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type StatusFilter = 'Healthy' | 'In progress' | 'At risk' | 'No runs yet'
const STATUS_FILTERS: StatusFilter[] = ['Healthy', 'In progress', 'At risk', 'No runs yet']

const SORT_KEY_LABELS: Record<SortKey, string> = {
  name: 'Name',
  suites: 'Suites',
  cases: 'Cases',
  created: 'Created',
}

function statusOf(p: ProjectSummary): StatusFilter {
  return p.passRate === null ? 'No runs yet' : healthLabel(p.passRate)
}

// Segmented pill control shared by the view-mode toggle and the status
// filter chips — active = solid dark fill, inactive = white/bordered,
// matching the approved mockup's filter-chip treatment throughout.
function Pill({
  active,
  onClick,
  children,
  ...rest
}: { active: boolean; onClick: () => void; children: React.ReactNode } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'className'
>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}

// "+ New project" and the empty-state CTA are kept structurally separate
// from the list itself (design.md D9) — add-project-rbac gates both behind
// isTenantAdmin below, with no layout change from the always-shown version.
export default function ProjectsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const projects = useProjectSummaries()
  const bump = useBumpDataRevision()
  const isMobile = useIsMobile()
  const [manualOverride, setManualOverride] = useViewModeOverride()
  const viewMode = resolveViewMode(projects.length, isMobile, manualOverride)
  const [sort, setSort] = useSortOverride()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string>()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null)

  const isTenantAdmin = user?.isTenantAdmin ?? false
  // Design D6: a non-Tenant-Admin who can see exactly one project (now a
  // real per-project membership list, add-project-rbac) skips the list
  // entirely and lands straight on it.
  const skipToSingleProject = !isTenantAdmin && projects.length === 1

  useEffect(() => {
    if (skipToSingleProject) navigate(`/projects/${projects[0].id}`, { replace: true })
  }, [skipToSingleProject, projects, navigate])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('name is required')
      return
    }
    setError(undefined)
    const { data, error: apiError } = await api.POST('/api/v1/projects', {
      body: {
        name,
        ...(description ? { description } : {}),
      },
    })
    if (apiError) {
      setError((apiError as { error?: string }).error ?? 'failed to create project')
      return
    }
    setName('')
    setDescription('')
    if (data) navigate(`/projects/${data.key}`)
  }

  async function toggleFavorite(p: ProjectSummary) {
    if (p.isFavorite) {
      await api.DELETE('/api/v1/projects/{projectKey}/favorite', { params: { path: { projectKey: p.id } } })
    } else {
      await api.POST('/api/v1/projects/{projectKey}/favorite', { params: { path: { projectKey: p.id } } })
    }
    bump()
  }

  if (skipToSingleProject) return null

  const filtered = projects.filter(
    (p) =>
      (search.trim() === '' || p.name.toLowerCase().includes(search.trim().toLowerCase())) &&
      (statusFilter === null || statusOf(p) === statusFilter),
  )
  const visible = sortProjects(filtered, sort.key, sort.direction)

  const favorites = viewMode === 'expanded' ? visible.filter((p) => p.isFavorite) : []
  const rest = viewMode === 'expanded' ? visible.filter((p) => !p.isFavorite) : visible

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Projects' }]} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="tp-heading text-2xl">Projects</h1>
          {projects.length > 0 && (
            <p className="tp-label mt-1">
              {projects.length} project{projects.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        {isTenantAdmin && <Button onClick={() => setCreating(true)}>+ New project</Button>}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="project-name">Name</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="QA Platform"
                  />
                </div>
                <Button type="submit">Create</Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this project covers (optional)"
                />
              </div>
            </form>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {projects.length > 0 && (
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Search projects"
            placeholder="Search projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-[10px]"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
              <Pill active={statusFilter === null} onClick={() => setStatusFilter(null)}>
                All
              </Pill>
              {STATUS_FILTERS.map((s) => (
                <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                  {s}
                </Pill>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="project-sort-key" className="tp-label">
                  Sort by
                </Label>
                <select
                  id="project-sort-key"
                  value={sort.key}
                  onChange={(e) => {
                    const key = e.target.value as SortKey
                    setSort({ key, direction: DEFAULT_SORT_DIRECTION[key] })
                  }}
                  className="h-9 rounded-[10px] border border-input bg-card px-2.5 text-sm font-semibold"
                >
                  {(Object.keys(SORT_KEY_LABELS) as SortKey[]).map((key) => (
                    <option key={key} value={key}>
                      {SORT_KEY_LABELS[key]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Toggle sort direction"
                  aria-pressed={sort.direction === 'desc'}
                  onClick={() => setSort({ key: sort.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
                  className="flex size-9 items-center justify-center rounded-[10px] border border-input bg-card text-foreground hover:border-primary/40"
                >
                  {sort.direction === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {!isMobile && (
                <div role="group" aria-label="View mode" className="flex items-center gap-1.5">
                  <button
                    type="button"
                    title="Expanded view"
                    aria-label="Expanded view"
                    aria-pressed={viewMode === 'expanded'}
                    onClick={() => setManualOverride('expanded')}
                    className={`flex size-9 items-center justify-center rounded-full border transition-colors ${
                      viewMode === 'expanded'
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Grid2x2 className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Compact view"
                    aria-label="Compact view"
                    aria-pressed={viewMode === 'compact'}
                    onClick={() => setManualOverride('compact')}
                    className={`flex size-9 items-center justify-center rounded-full border transition-colors ${
                      viewMode === 'compact'
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Grid3x3 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="mb-1 text-sm font-medium">
            {isTenantAdmin ? 'No projects yet' : "You don't have access to any projects yet"}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {isTenantAdmin
              ? 'Create the first one to start organizing sections, suites, and runs.'
              : 'Ask a Tenant Admin to add you to a project.'}
          </p>
          {isTenantAdmin && <Button onClick={() => setCreating(true)}>+ Create your first project</Button>}
        </div>
      ) : (
        <>
          {favorites.length > 0 && (
            <section aria-label="Favorites" className="space-y-3">
              <h2 className="tp-label">Favorites</h2>
              <ul className="flex flex-wrap gap-3">
                {favorites.map((p) => (
                  <li key={p.id}>
                    <FavoriteCard
                      project={p}
                      onNavigate={() => navigate(`/projects/${p.id}`)}
                      onToggleFavorite={toggleFavorite}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="space-y-3">
            {favorites.length > 0 && <h2 className="tp-label">All projects</h2>}
            {viewMode === 'expanded' ? (
              <ExpandedGrid
                projects={rest}
                onNavigate={(id) => navigate(`/projects/${id}`)}
                onToggleFavorite={toggleFavorite}
              />
            ) : (
              <CompactList
                projects={rest}
                onNavigate={(id) => navigate(`/projects/${id}`)}
                onToggleFavorite={toggleFavorite}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Small tinted chip-card used only in the Favorites section — mint-tinted
// per the approved mockup, scannable by number rather than by word (the
// main grid uses the opposite: word, no number).
function FavoriteCard({
  project: p,
  onNavigate,
  onToggleFavorite,
}: {
  project: ProjectSummary
  onNavigate: () => void
  onToggleFavorite: (p: ProjectSummary) => void
}) {
  const readout = p.passRate === null ? 'No runs yet' : `${p.passRate}%`
  return (
    <div className="relative flex w-64 flex-col gap-1.5 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:border-primary/50">
      <button type="button" onClick={onNavigate} className="flex flex-col gap-1.5 pr-6 text-left">
        <span className="truncate text-sm font-semibold text-foreground" title={p.name}>
          {p.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {readout} · {p.suiteCount} suites
        </span>
      </button>
      <button
        type="button"
        aria-label={`Unstar ${p.name}`}
        aria-pressed={true}
        onClick={(e) => {
          e.stopPropagation()
          void onToggleFavorite(p)
        }}
        className="absolute right-4 top-4 text-secondary"
      >
        <StarIcon className="size-4 fill-secondary" aria-hidden="true" />
      </button>
    </div>
  )
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-lg bg-muted py-2">
      <span className="text-base font-semibold text-foreground">{value}</span>
      <span className="tp-label">{label}</span>
    </div>
  )
}

function isValidDate(iso: string): boolean {
  return iso !== '' && !Number.isNaN(new Date(iso).getTime())
}

// Rich card grid for expanded view — every field the project has is worth
// showing here: description, when it was created, suite/case counts as
// scannable stat tiles, alongside the status pill/bar (design D10).
function ExpandedGrid({
  projects,
  onNavigate,
  onToggleFavorite,
}: {
  projects: ProjectSummary[]
  onNavigate: (id: string) => void
  onToggleFavorite: (p: ProjectSummary) => void
}) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => {
        const created = isValidDate(p.createdAt) ? timeAgo(p.createdAt) : null
        const lastRun = p.lastRunAt && isValidDate(p.lastRunAt) ? timeAgo(p.lastRunAt) : null
        return (
          <li key={p.id}>
            <div className="group relative flex w-full flex-col gap-3.5 overflow-hidden rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
              <span
                className={`absolute inset-y-0 left-0 w-1 ${statusBorderClass(p.passRate)}`}
                aria-hidden="true"
              />
              <button type="button" onClick={() => onNavigate(p.id)} className="flex flex-col gap-3.5 text-left">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <h2 className="truncate text-base font-semibold leading-snug text-foreground" title={p.name}>
                      {p.name}
                    </h2>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                  </span>
                  {/* Spacer matching the star button's footprint so the title never runs under it. */}
                  <span className="size-4 shrink-0" aria-hidden="true" />
                </span>

                <StatusPill rate={p.passRate} />
                <ProgressBar rate={p.passRate} />

                <span className="flex gap-2">
                  <StatTile value={p.suiteCount} label="suites" />
                  <StatTile value={p.caseCount} label="cases" />
                </span>

                {(created || lastRun) && (
                  <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    <span className="truncate">
                      {lastRun ? `Last run ${lastRun}` : `Created ${created}`}
                    </span>
                  </span>
                )}
              </button>

              <button
                type="button"
                aria-label={p.isFavorite ? `Unstar ${p.name}` : `Star ${p.name}`}
                aria-pressed={p.isFavorite}
                onClick={(e) => {
                  e.stopPropagation()
                  void onToggleFavorite(p)
                }}
                className="absolute right-4 top-4 text-muted-foreground hover:text-secondary"
              >
                <StarIcon
                  className={`size-4 ${p.isFavorite ? 'fill-secondary text-secondary' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Compact card grid (design D12, reverted from D10/D11 per direct
// feedback): the same core card as ExpandedGrid — title, status pill,
// progress bar, suite/case footer — just without the extras reserved for
// expanded (description, created date, stat-tile captions, the
// left accent bar). Same content shape as the original approved mockup
// (D8), packed into a denser grid than expanded so density is still the
// real difference between the two modes.
function CompactList({
  projects,
  onNavigate,
  onToggleFavorite,
}: {
  projects: ProjectSummary[]
  onNavigate: (id: string) => void
  onToggleFavorite: (p: ProjectSummary) => void
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {projects.map((p) => (
        <li key={p.id}>
          <div className="group relative flex w-full flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <button type="button" onClick={() => onNavigate(p.id)} className="flex flex-col gap-3.5 text-left">
              <span className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 truncate text-base font-semibold leading-snug text-foreground" title={p.name}>
                  {p.name}
                </h2>
                <span className="size-4 shrink-0" aria-hidden="true" />
              </span>

              <StatusPill rate={p.passRate} />
              <ProgressBar rate={p.passRate} />

              <span className="text-xs text-muted-foreground">
                {p.suiteCount} suites · {p.caseCount} cases
              </span>
            </button>

            <button
              type="button"
              aria-label={p.isFavorite ? `Unstar ${p.name}` : `Star ${p.name}`}
              aria-pressed={p.isFavorite}
              onClick={(e) => {
                e.stopPropagation()
                void onToggleFavorite(p)
              }}
              className="absolute right-4 top-4 text-muted-foreground hover:text-secondary"
            >
              <StarIcon
                className={`size-4 ${p.isFavorite ? 'fill-secondary text-secondary' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
