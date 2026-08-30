import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PackageIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { StatusPill, ProgressBar, healthColor } from '@/components/HealthBar'
import { ReleaseStatusBadge } from '@/components/ReleaseStatusBadge'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type Release = components['schemas']['Release']
type Project = components['schemas']['Project']

// Normalized (never undefined) — the generated Rollup schema types passRate
// as optional since it isn't in `required`, even though the API always
// returns it; this is the shape every call site actually wants to work with.
type RollupRow = { runCount: number; passRate: number | null }

type ReleaseRow = Release & { rollup: RollupRow; planCount: number }

function ReleaseCard({ release, projectKey }: { release: ReleaseRow; projectKey: string }) {
  const rate = release.rollup.passRate
  return (
    <li className="relative">
      <Link
        to={`/projects/${projectKey}/releases/${release.key}`}
        className="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border bg-card p-4 pl-5 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-md"
      >
        <span
          className={`absolute inset-y-0 left-0 w-1 ${rate === null ? 'bg-border' : healthColor(rate)}`}
          aria-hidden="true"
        />
        <span className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <PackageIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate font-medium">{release.name}</span>
        </span>
        <span className="tp-label">{release.key}</span>
        <span className="flex items-center gap-1.5">
          <StatusPill rate={rate} />
          <ReleaseStatusBadge status={release.status} />
        </span>
        <ProgressBar rate={rate} />
        <span className="text-xs text-muted-foreground">
          {release.planCount} test plan{release.planCount === 1 ? '' : 's'} · {release.rollup.runCount} run
          {release.rollup.runCount === 1 ? '' : 's'}
        </span>
      </Link>
    </li>
  )
}

export default function ReleasesPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const [project, setProject] = useState<Project>()
  const [releases, setReleases] = useState<ReleaseRow[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const load = useCallback(async () => {
    if (!projectKey) return
    const { data: p } = await api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
    const { data: list } = await api.GET('/api/v1/projects/{projectKey}/releases', { params: { path: { projectKey } } })
    setProject(p)
    const rows = await Promise.all(
      (list ?? []).map(async (release) => {
        const [{ data: rollup }, { data: plans }] = await Promise.all([
          api.GET('/api/v1/releases/{releaseKey}/rollup', { params: { path: { releaseKey: release.key } } }),
          api.GET('/api/v1/releases/{releaseKey}/plans', { params: { path: { releaseKey: release.key } } }),
        ])
        const normalizedRollup: RollupRow = { runCount: rollup?.runCount ?? 0, passRate: rollup?.passRate ?? null }
        return { ...release, rollup: normalizedRollup, planCount: plans?.length ?? 0 }
      }),
    )
    setReleases(rows)
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    if (!projectKey || !name.trim()) return
    const { data: created } = await api.POST('/api/v1/projects/{projectKey}/releases', {
      params: { path: { projectKey } },
      body: { name: name.trim(), description: description.trim() },
    })
    setCreating(false)
    setName('')
    setDescription('')
    if (created) navigate(`/projects/${projectKey}/releases/${created.key}`)
  }

  if (!projectKey) return null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: 'Projects', href: '/' },
            { label: project?.name ?? '', href: `/projects/${projectKey}` },
            { label: 'Releases' },
          ],
          'Releases',
        )}
      />

      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-2xl">Releases</h1>
        {permissions?.manageProject && (
          <Button type="button" onClick={() => setCreating(true)}>
            + New release
          </Button>
        )}
      </div>

      {releases.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="mb-1 text-sm font-medium">No releases yet</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Releases group Test Plans and Runs under a supported version (e.g. "2026.1"). Skip this entirely if your
            project doesn't need it.
          </p>
          {permissions?.manageProject && (
            <Button type="button" onClick={() => setCreating(true)}>
              + New release
            </Button>
          )}
        </div>
      ) : (
        <ul aria-label="Releases" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}>
          {releases.map((r) => (
            <ReleaseCard key={r.id} release={r} projectKey={projectKey} />
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>New release</DialogTitle>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="release-name">Name</Label>
              <Input id="release-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="2026.2" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="release-description">Description</Label>
              <Textarea
                id="release-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's shipping in this release…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={() => void handleCreate()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
