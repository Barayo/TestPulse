import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ListChecksIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type Requirement = components['schemas']['Requirement']
type Project = components['schemas']['Project']

function RequirementCard({ requirement, projectKey }: { requirement: Requirement; projectKey: string }) {
  return (
    <li className="relative">
      <Link
        to={`/projects/${projectKey}/requirements/${requirement.key}`}
        className="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border bg-card p-4 pl-5 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-md"
      >
        <span className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ListChecksIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate font-medium">{requirement.name}</span>
        </span>
        <span className="tp-label">{requirement.key}</span>
        {requirement.description && <p className="line-clamp-2 text-sm text-muted-foreground">{requirement.description}</p>}
        <span className="text-xs text-muted-foreground">
          {requirement.caseIds.length} case{requirement.caseIds.length === 1 ? '' : 's'} linked
        </span>
      </Link>
    </li>
  )
}

export default function RequirementsPage() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const [project, setProject] = useState<Project>()
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [externalRef, setExternalRef] = useState('')

  const load = useCallback(async () => {
    if (!projectKey) return
    const { data: p } = await api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
    const { data: list } = await api.GET('/api/v1/projects/{projectKey}/requirements', { params: { path: { projectKey } } })
    setProject(p)
    setRequirements(list ?? [])
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    if (!projectKey || !name.trim()) return
    const { data: created } = await api.POST('/api/v1/projects/{projectKey}/requirements', {
      params: { path: { projectKey } },
      body: { name: name.trim(), description: description.trim(), externalRef: externalRef.trim() },
    })
    setCreating(false)
    setName('')
    setDescription('')
    setExternalRef('')
    if (created) navigate(`/projects/${projectKey}/requirements/${created.key}`)
  }

  if (!projectKey) return null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: 'Projects', href: '/' },
            { label: project?.name ?? '', href: `/projects/${projectKey}` },
            { label: 'Requirements' },
          ],
          'Requirements',
        )}
      />

      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-2xl">Requirements</h1>
        {permissions?.manageProject && (
          <Button type="button" onClick={() => setCreating(true)}>
            + New requirement
          </Button>
        )}
      </div>

      {requirements.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="mb-1 text-sm font-medium">No requirements yet</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Requirements link test cases to what they cover, so a Release's coverage matrix can show what's proven and
            what isn't.
          </p>
          {permissions?.manageProject && (
            <Button type="button" onClick={() => setCreating(true)}>
              + New requirement
            </Button>
          )}
        </div>
      ) : (
        <ul
          aria-label="Requirements"
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}
        >
          {requirements.map((r) => (
            <RequirementCard key={r.id} requirement={r} projectKey={projectKey} />
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>New requirement</DialogTitle>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="requirement-name">Name</Label>
              <Input
                id="requirement-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Guest checkout"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="requirement-description">Description</Label>
              <Textarea
                id="requirement-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this requirement covers…"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="requirement-external-ref">External reference</Label>
              <Input
                id="requirement-external-ref"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="JIRA-123 (optional)"
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
