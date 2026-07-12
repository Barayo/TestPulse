import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()

  async function load() {
    try {
      const { data } = await api.GET('/api/v1/projects')
      setProjects(data ?? [])
    } catch {
      setProjects([])
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('name is required')
      return
    }
    setError(undefined)
    const { error: apiError } = await api.POST('/api/v1/projects', {
      body: { name },
    })
    if (apiError) {
      setError((apiError as { error?: string }).error ?? 'failed to create project')
      return
    }
    setName('')
    await load()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="text-sm font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.archived && (
                    <span className="ml-2 text-xs text-muted-foreground">(archived)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
