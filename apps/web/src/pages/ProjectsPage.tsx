import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { useProjectSummaries } from '@/lib/useProjectSummaries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// "+ New project" and the empty-state CTA are kept structurally separate
// from the list itself (design.md D9), so add-project-rbac (v0.2) only has
// to stop rendering those two elements for non-admins — no layout change.
// v0.1 has no real roles yet, so everyone sees this admin-enabled version.
export default function ProjectsPage() {
  const navigate = useNavigate()
  const projects = useProjectSummaries()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('name is required')
      return
    }
    setError(undefined)
    const { data, error: apiError } = await api.POST('/api/v1/projects', {
      body: { name },
    })
    if (apiError) {
      setError((apiError as { error?: string }).error ?? 'failed to create project')
      return
    }
    setName('')
    if (data) navigate(`/projects/${data.id}`)
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={[{ label: 'Projects' }]} />

      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-xl">Projects</h1>
        <Button onClick={() => setCreating(true)}>+ New project</Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex items-end gap-3">
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
            </form>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="mb-1 text-sm font-medium">No projects yet</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Create the first one to start organizing sections, suites, and runs.
          </p>
          <Button onClick={() => setCreating(true)}>+ Create your first project</Button>
        </div>
      ) : (
        <ul className="rounded-lg border">
          {projects.map((p) => (
            <li key={p.id} className="border-b last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {p.suiteCount} suites · {p.caseCount} cases ·{' '}
                  {p.passRate === null ? 'no runs' : `${p.passRate}% pass`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
