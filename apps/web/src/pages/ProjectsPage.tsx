import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { StarIcon, Grid2x2, Grid3x3, XIcon, TagIcon, PlusIcon, DatabaseIcon, UploadIcon, GlobeIcon, type LucideIcon } from 'lucide-react'
import { TagChipsEditor } from '@/components/TagChipsEditor'
import { useTagVocabulary } from '@/lib/useTagVocabulary'
import { useFloatingPosition } from '@/lib/useFloatingPosition'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StatusPill, ProgressBar, healthLabel, statusBorderClass } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { useProjectSummaries, type ProjectSummary } from '@/lib/useProjectSummaries'
import { useAuth } from '@/lib/useAuth'
import { PRODUCT_HEADLINE, PRODUCT_PROOF_POINTS } from '@/lib/productProofPoints'
import { useIsMobile } from '@/lib/useIsMobile'
import { useViewModeOverride } from '@/lib/useViewModeOverride'
import { resolveViewMode } from '@/lib/viewMode'
import { useSortOverride } from '@/lib/useSortOverride'
import { sortProjects, DEFAULT_SORT_DIRECTION, type SortKey } from '@/lib/sortProjects'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Pill } from '@/components/ui/Pill'
import { tagPills } from '@/components/Pills'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']

type StatusFilter = 'Healthy' | 'In progress' | 'At risk' | 'No runs yet'
const STATUS_FILTERS: StatusFilter[] = ['Healthy', 'In progress', 'At risk', 'No runs yet']

// One entry per way to start a new project (add-testrail-importer tasks.md
// 7.1) — "Start from scratch" plus one entry per structural-import
// connector. Deliberately data-driven: the next connector (Qase, Zephyr,
// Kiwi TCMS, Tuskr — #190-193) is one more array entry, never a new branch
// of menu markup. No icon color (design-system.md: color marks meaningful
// state, and these are two equally-weighted, non-stateful choices).
type NewProjectSource = {
  key: string
  label: string
  description: string
  icon: LucideIcon
  onSelect: () => void
}

const SORT_KEY_LABELS: Record<SortKey, string> = {
  name: 'Name',
  suites: 'Suites',
  cases: 'Cases',
  created: 'Created',
}

function statusOf(p: ProjectSummary): StatusFilter {
  return p.passRate === null ? 'No runs yet' : healthLabel(p.passRate)
}

// "+ New project" and the empty-state CTA are kept structurally separate
// from the list itself (design.md D9) — add-project-rbac gates both behind
// isTenantAdmin below, with no layout change from the always-shown version.
export default function ProjectsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, publicProjectsEnabled, setupRequiredLoading } = useAuth()
  const projects = useProjectSummaries()
  const tagVocabulary = useTagVocabulary()
  const bump = useBumpDataRevision()
  const isMobile = useIsMobile()
  const [manualOverride, setManualOverride] = useViewModeOverride()
  const viewMode = resolveViewMode(projects.length, isMobile, manualOverride)
  const [sort, setSort] = useSortOverride()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string>()
  const [stagedTags, setStagedTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const isTenantAdmin = user?.isTenantAdmin ?? false
  // Design D6: a non-Tenant-Admin who can see exactly one project (now a
  // real per-project membership list, add-project-rbac) skips the list
  // entirely and lands straight on it.
  const skipToSingleProject = !isTenantAdmin && projects.length === 1

  useEffect(() => {
    if (skipToSingleProject) navigate(`/projects/${projects[0].id}`, { replace: true })
  }, [skipToSingleProject, projects, navigate])

  // `/` is the anonymous discovery surface (unify-authenticated-and-public-views
  // design.md D6, replacing the retired standalone /public index). State
  // stays `Project[] | undefined`, never defaulting to `[]` — the same
  // loading-sentinel discipline the now-retired usePublicProjects()
  // established — so "still loading" and "loaded, zero public projects"
  // are distinguishable and the single-project redirect below never
  // flashes an empty state first (D2's Open Question: this is a *new*,
  // separate state, not a reuse of useProjectSummaries()'s `[]`-defaulting
  // hook above, so its pre-existing loading-sentinel flash bug doesn't
  // carry over here).
  const [publicProjects, setPublicProjects] = useState<Project[] | undefined>(undefined)

  useEffect(() => {
    if (user || authLoading) {
      setPublicProjects(undefined)
      return
    }
    let cancelled = false
    void api
      .GET('/api/v1/public/projects')
      .then(({ data }) => {
        if (!cancelled) setPublicProjects(data ?? [])
      })
      .catch(() => {
        if (!cancelled) setPublicProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const newProjectSources: NewProjectSource[] = [
    {
      key: 'scratch',
      label: 'Start from scratch',
      description: 'Create an empty project and build up folders, suites, and cases manually.',
      icon: PlusIcon,
      onSelect: () => setCreating(true),
    },
    {
      key: 'testrail',
      label: 'Import from TestRail',
      description: 'Bring in suites, sections, and cases from an existing TestRail project.',
      icon: DatabaseIcon,
      onSelect: () => navigate('/projects/import/testrail'),
    },
    {
      key: 'qase',
      label: 'Import from Qase',
      description: 'Bring in suites and cases from an existing Qase project.',
      icon: DatabaseIcon,
      onSelect: () => navigate('/projects/import/qase'),
    },
    {
      key: 'zephyr-scale',
      label: 'Import from Zephyr Scale',
      description: 'Bring in folders and cases from an existing Zephyr Scale Cloud project.',
      icon: DatabaseIcon,
      onSelect: () => navigate('/projects/import/zephyr-scale'),
    },
    {
      key: 'kiwi-tcms',
      label: 'Import from Kiwi TCMS',
      description: 'Bring in a test plan tree and cases from an existing Kiwi TCMS product.',
      icon: DatabaseIcon,
      onSelect: () => navigate('/projects/import/kiwi-tcms'),
    },
    {
      key: 'xray',
      label: 'Import from Xray',
      description: 'Bring in a Test Repository and tests from an existing Xray Cloud or Server/Data Center project.',
      icon: DatabaseIcon,
      onSelect: () => navigate('/projects/import/xray'),
    },
    {
      key: 'tuskr',
      label: 'Import from Tuskr',
      description: 'Bring in test suites, sections, and cases from an existing Tuskr project.',
      icon: DatabaseIcon,
      onSelect: () => navigate('/projects/import/tuskr'),
    },
    {
      key: 'csv',
      label: 'Import from CSV',
      description: 'Bring in cases from a spreadsheet export — works with any tool, no account needed.',
      icon: UploadIcon,
      onSelect: () => navigate('/projects/import/csv'),
    },
  ]

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
    if (data) {
      // Tags stage client-side during creation — the assign endpoint needs
      // a real project key that doesn't exist until after this POST.
      for (const tag of stagedTags) {
        await api.PUT('/api/v1/projects/{projectKey}/tags/{tagName}', {
          params: { path: { projectKey: data.key, tagName: tag } },
        })
      }
      setStagedTags([])
      navigate(`/projects/${data.key}`)
    }
  }

  async function toggleFavorite(p: ProjectSummary) {
    if (p.isFavorite) {
      await api.DELETE('/api/v1/projects/{projectKey}/favorite', { params: { path: { projectKey: p.id } } })
    } else {
      await api.POST('/api/v1/projects/{projectKey}/favorite', { params: { path: { projectKey: p.id } } })
    }
    bump()
  }

  async function addProjectTag(p: ProjectSummary, tag: string) {
    await api.PUT('/api/v1/projects/{projectKey}/tags/{tagName}', {
      params: { path: { projectKey: p.id, tagName: tag } },
    })
    bump()
  }

  async function removeProjectTag(p: ProjectSummary, tag: string) {
    await api.DELETE('/api/v1/projects/{projectKey}/tags/{tagName}', {
      params: { path: { projectKey: p.id, tagName: tag } },
    })
    bump()
  }

  if (!user && !authLoading) {
    // publicProjectsEnabled is the instance-wide kill switch
    // (enable-public-project-access) — when it's off, /api/v1/public/projects
    // returns [] forever until an admin flips it back on, so there's
    // nothing to discover here. Redirecting straight to /login (same
    // "skip the middleman when the answer is unambiguous" idiom as the
    // single-public-project redirect below) beats rendering an empty box
    // with a login button on it. Waits for setupRequiredLoading, same
    // discipline SetupPage already uses for setupRequired, since
    // publicProjectsEnabled defaults to true until the real value resolves.
    if (!setupRequiredLoading && !publicProjectsEnabled) {
      return <Navigate to="/login" state={{ from: location.pathname }} replace />
    }
    if (publicProjects && publicProjects.length === 1) {
      return <Navigate to={`/projects/${publicProjects[0].key}`} replace />
    }
    return (
      <div className="space-y-6">
        <h1 className="tp-heading text-2xl">Projects</h1>
        {publicProjects && publicProjects.length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <GlobeIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mb-1 text-sm font-medium">No public projects yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              This instance doesn't have any projects open to visitors right now.
            </p>
            <Button asChild>
              <Link to="/login" state={{ from: location.pathname }}>
                Log in
              </Link>
            </Button>
            {/* Collapsed single-state design (founder + Jose + Pepe,
                superseding the earlier "State A / State B" split): this
                reminder shows unconditionally rather than only when
                private projects are known to exist, since the copy above
                is already honest either way and distinguishing the two
                real causes would need a new, unnecessary backend signal.
                PRODUCT_HEADLINE (founder feedback: describe what TestPulse
                *is* before its characteristics) replaces a plain "What
                TestPulse is" label — Pepe's follow-up review: keeping both
                would say the same thing twice, an assertion immediately
                preceded by a label announcing one. Reuses AuthLayout's own
                PRODUCT_PROOF_POINTS verbatim below (lead + icon only, not
                the fuller `rest` elaboration, which stays exclusive to the
                login screen this CTA already leads to). */}
            <div className="mx-auto mt-14 max-w-xl">
              <p className="mb-5 text-[15px] font-semibold leading-snug text-foreground">{PRODUCT_HEADLINE}</p>
              <div className="flex flex-col items-center gap-3.5 sm:flex-row sm:justify-center sm:gap-8">
                {PRODUCT_PROOF_POINTS.map(({ lead, icon }) => (
                  <span
                    key={lead}
                    className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-foreground"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-primary"
                      aria-hidden="true"
                    >
                      {icon}
                    </svg>
                    {lead}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        {publicProjects && publicProjects.length > 1 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicProjects.map((p) => (
              <Link key={p.id} to={`/projects/${p.key}`}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle>{p.name}</CardTitle>
                      {p.isSample && <Badge variant="secondary">Sample</Badge>}
                    </div>
                    {p.description && <CardDescription>{p.description}</CardDescription>}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (skipToSingleProject) return null

  const searchAndStatusFiltered = projects.filter(
    (p) =>
      (search.trim() === '' || p.name.toLowerCase().includes(search.trim().toLowerCase())) &&
      (statusFilter === null || statusOf(p) === statusFilter),
  )
  const filtered = searchAndStatusFiltered.filter((p) => tagFilter === null || p.tags.includes(tagFilter))
  const visible = sortProjects(filtered, sort.key, sort.direction)

  // Tag filter is only worth showing once some project actually has a tag
  // (Favorites-section precedent: don't render a control with nothing to do).
  const anyProjectHasTags = projects.some((p) => p.tags.length > 0)
  const tagCounts = new Map<string, number>()
  for (const p of searchAndStatusFiltered) {
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }

  const favorites = viewMode === 'expanded' ? visible.filter((p) => p.isFavorite) : []
  const rest = viewMode === 'expanded' ? visible.filter((p) => !p.isFavorite) : visible

  return (
    <div className="space-y-6">
      {/* No breadcrumb here — a lone "Projects" segment would just repeat
          the page's own heading below it (Breadcrumbs.tsx now always
          renders a single segment it's given, so it's on this page to not
          pass a purely redundant one, unlike e.g. the Library explorer's
          root, which has no heading of its own to repeat). */}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="tp-heading text-2xl">Projects</h1>
          {projects.length > 0 && (
            <p className="tp-label mt-1">
              {projects.length} project{projects.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        {isTenantAdmin && <NewProjectMenu sources={newProjectSources} />}
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
              <div className="space-y-1">
                <Label>Tags</Label>
                <TagChipsEditor
                  tags={stagedTags}
                  vocabulary={tagVocabulary}
                  onAdd={(tag) => setStagedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
                  onRemove={(tag) => setStagedTags((prev) => prev.filter((t) => t !== tag))}
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
              {anyProjectHasTags && (
                <TagFilterControl
                  tagCounts={tagCounts}
                  activeTag={tagFilter}
                  onSelectTag={setTagFilter}
                  onClear={() => setTagFilter(null)}
                />
              )}
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
                tagVocabulary={tagVocabulary}
                onAddTag={addProjectTag}
                onRemoveTag={removeProjectTag}
              />
            ) : (
              <CompactList
                projects={rest}
                onNavigate={(id) => navigate(`/projects/${id}`)}
                onToggleFavorite={toggleFavorite}
                tagVocabulary={tagVocabulary}
                onAddTag={addProjectTag}
                onRemoveTag={removeProjectTag}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Dashed pill (distinct at rest from the fixed status pills) opening a
// ProjectSwitcher-style anchored search popover — tag vocabulary is
// open-ended, unlike the five fixed status filters, so a pill-per-tag row
// doesn't scale. Counts reflect the search/status-filtered set, before tag
// narrowing, so they always answer "if I pick this now, how many remain."
function TagFilterControl({
  tagCounts,
  activeTag,
  onSelectTag,
  onClear,
}: {
  tagCounts: Map<string, number>
  activeTag: string | null
  onSelectTag: (tag: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const tags = Array.from(tagCounts.keys()).sort()
  const position = useFloatingPosition(open, containerRef, 'left')

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          activeTag
            ? 'whitespace-nowrap rounded-full border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background'
            : 'whitespace-nowrap rounded-full border border-dashed border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40'
        }
      >
        {activeTag ?? 'Tag'}
      </button>
      {activeTag && (
        <button
          type="button"
          aria-label="Clear tag filter"
          onClick={onClear}
          className="text-muted-foreground hover:text-destructive"
        >
          <XIcon className="size-3.5" aria-hidden="true" />
        </button>
      )}
      {open &&
        position &&
        createPortal(
          <div
            ref={dropdownRef}
            role="dialog"
            aria-label="Filter by tag"
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-56 rounded-md border bg-card p-2 shadow-lg"
          >
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {tags.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      onSelectTag(t)
                      setOpen(false)
                    }}
                  >
                    <span>{t}</span>
                    <span className="text-xs text-muted-foreground">{tagCounts.get(t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  )
}

// "+ New project" → an anchored menu of project-creation sources
// (add-testrail-importer tasks.md 7.1-7.2) — same click-outside/Escape
// pattern as CardTagEditor below and Breadcrumbs.tsx's HiddenSegmentsMenu,
// anchored right since the trigger sits top-right of the page. Each item
// shows a bold label plus a muted description line (two consequential,
// different paths — not a plain single-line nav shortcut).
function NewProjectMenu({ sources }: { sources: NewProjectSource[] }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const position = useFloatingPosition(open, containerRef, 'right')

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        + New project
      </Button>
      {open &&
        position &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            aria-label="New project"
            style={{ top: position.top, right: position.right }}
            className="fixed z-50 w-72 rounded-md border bg-card p-1.5 shadow-lg"
          >
            {sources.map((source) => {
              const Icon = source.icon
              return (
                <button
                  key={source.key}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-start gap-2.5 rounded-md p-2.5 text-left hover:bg-accent"
                  onClick={() => {
                    setOpen(false)
                    source.onSelect()
                  }}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{source.label}</span>
                    <span className="block text-xs text-muted-foreground">{source.description}</span>
                  </span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

// Reachable by anyone who can see the card at all (same `read` permission
// bar as favoriting — the list only ever contains readable projects), so
// this lives inline on the card, not gated behind ProjectSettingsPage
// (manageProject-only, too high a bar for tag assignment's design).
function CardTagEditor({
  project: p,
  vocabulary,
  onAdd,
  onRemove,
}: {
  project: ProjectSummary
  vocabulary: string[]
  onAdd: (p: ProjectSummary, tag: string) => void
  onRemove: (p: ProjectSummary, tag: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const position = useFloatingPosition(open, containerRef, 'right')

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Edit tags for ${p.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="text-muted-foreground hover:text-primary"
      >
        <TagIcon className="size-4" aria-hidden="true" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={dropdownRef}
            role="dialog"
            aria-label={`Edit tags for ${p.name}`}
            style={{ top: position.top, right: position.right }}
            className="fixed z-50 w-64 rounded-md border bg-card p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <TagChipsEditor
              tags={p.tags}
              vocabulary={vocabulary}
              onAdd={(tag) => onAdd(p, tag)}
              onRemove={(tag) => onRemove(p, tag)}
            />
          </div>,
          document.body,
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

// Expanded cards have more room than the 2-tag cap CasePicker-style rows use
// (tagPills() in Pills.tsx) — 4 before overflowing, per the approved mockup.
function expandedTagPills(tags: string[]) {
  const shown = tags.slice(0, 4)
  const overflow = tags.length - shown.length
  return (
    <>
      {shown.map((t) => (
        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {t}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">+{overflow}</span>
      )}
    </>
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
  tagVocabulary,
  onAddTag,
  onRemoveTag,
}: {
  projects: ProjectSummary[]
  onNavigate: (id: string) => void
  onToggleFavorite: (p: ProjectSummary) => void
  tagVocabulary: string[]
  onAddTag: (p: ProjectSummary, tag: string) => void
  onRemoveTag: (p: ProjectSummary, tag: string) => void
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
                    <span className="flex items-center gap-1.5">
                      <h2 className="truncate text-base font-semibold leading-snug text-foreground" title={p.name}>
                        {p.name}
                      </h2>
                      {p.isSample && <Badge variant="secondary">Sample</Badge>}
                      {p.archived && <Badge variant="outline">Archived</Badge>}
                    </span>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                  </span>
                  {/* Spacer matching the tag-edit + star buttons' combined footprint so the title never runs under them. */}
                  <span className="flex shrink-0 gap-1.5" aria-hidden="true">
                    <span className="size-4" />
                    <span className="size-4" />
                  </span>
                </span>

                {p.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">{expandedTagPills(p.tags)}</span>
                )}

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

              <span className="absolute right-4 top-4 flex items-center gap-1.5">
                <CardTagEditor project={p} vocabulary={tagVocabulary} onAdd={onAddTag} onRemove={onRemoveTag} />
                <button
                  type="button"
                  aria-label={p.isFavorite ? `Unstar ${p.name}` : `Star ${p.name}`}
                  aria-pressed={p.isFavorite}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onToggleFavorite(p)
                  }}
                  className="text-muted-foreground hover:text-secondary"
                >
                  <StarIcon
                    className={`size-4 ${p.isFavorite ? 'fill-secondary text-secondary' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </span>
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
  tagVocabulary,
  onAddTag,
  onRemoveTag,
}: {
  projects: ProjectSummary[]
  onNavigate: (id: string) => void
  onToggleFavorite: (p: ProjectSummary) => void
  tagVocabulary: string[]
  onAddTag: (p: ProjectSummary, tag: string) => void
  onRemoveTag: (p: ProjectSummary, tag: string) => void
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {projects.map((p) => (
        <li key={p.id}>
          <div className="group relative flex w-full flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <button type="button" onClick={() => onNavigate(p.id)} className="flex flex-col gap-3.5 text-left">
              <span className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <h2 className="min-w-0 truncate text-base font-semibold leading-snug text-foreground" title={p.name}>
                    {p.name}
                  </h2>
                  {p.isSample && <Badge variant="secondary">Sample</Badge>}
                  {p.archived && <Badge variant="outline">Archived</Badge>}
                </span>
                <span className="flex shrink-0 gap-1.5" aria-hidden="true">
                  <span className="size-4" />
                  <span className="size-4" />
                </span>
              </span>

              {p.tags.length > 0 && (
                <span className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">{tagPills(p.tags)}</span>
              )}

              <StatusPill rate={p.passRate} />
              <ProgressBar rate={p.passRate} />

              <span className="text-xs text-muted-foreground">
                {p.suiteCount} suites · {p.caseCount} cases
              </span>
            </button>

            <span className="absolute right-4 top-4 flex items-center gap-1.5">
              <CardTagEditor project={p} vocabulary={tagVocabulary} onAdd={onAddTag} onRemove={onRemoveTag} />
              <button
                type="button"
                aria-label={p.isFavorite ? `Unstar ${p.name}` : `Star ${p.name}`}
                aria-pressed={p.isFavorite}
                onClick={(e) => {
                  e.stopPropagation()
                  void onToggleFavorite(p)
                }}
                className="text-muted-foreground hover:text-secondary"
              >
                <StarIcon
                  className={`size-4 ${p.isFavorite ? 'fill-secondary text-secondary' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
