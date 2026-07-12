import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Run = components['schemas']['Run']
type Folder = components['schemas']['Folder']

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [cases, setCases] = useState<TestCase[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [caseTitle, setCaseTitle] = useState('')
  const [caseFolderId, setCaseFolderId] = useState('')
  const [caseError, setCaseError] = useState<string>()
  const [runName, setRunName] = useState('')
  const [editingCaseId, setEditingCaseId] = useState<string>()
  const [editTitle, setEditTitle] = useState('')
  const [suiteSelection, setSuiteSelection] = useState<Record<string, string>>({})
  const [suiteName, setSuiteName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [folderError, setFolderError] = useState<string>()

  const rootFolder = folders.find((f) => !f.parentFolderId)

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const [{ data: c }, { data: s }, { data: r }, { data: f }] = await Promise.all([
        api.GET('/api/v1/projects/{projectId}/cases', { params: { path: { projectId } } }),
        api.GET('/api/v1/projects/{projectId}/suites', { params: { path: { projectId } } }),
        api.GET('/api/v1/projects/{projectId}/runs', { params: { path: { projectId } } }),
        api.GET('/api/v1/projects/{projectId}/folders', { params: { path: { projectId } } }),
      ])
      setCases(c ?? [])
      setSuites(s ?? [])
      setRuns(r ?? [])
      setFolders(f ?? [])
    } catch {
      setCases([])
      setSuites([])
      setRuns([])
      setFolders([])
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreateCase(e: FormEvent) {
    e.preventDefault()
    if (!projectId) return
    if (!caseTitle.trim()) {
      setCaseError('title is required')
      return
    }
    setCaseError(undefined)
    const { error } = await api.POST('/api/v1/projects/{projectId}/cases', {
      params: { path: { projectId } },
      body: caseFolderId ? { title: caseTitle, folderId: caseFolderId } : { title: caseTitle },
    })
    if (error) {
      setCaseError((error as { error?: string }).error ?? 'failed to create case')
      return
    }
    setCaseTitle('')
    setCaseFolderId('')
    await load()
  }

  async function handleCreateFolder(e: FormEvent) {
    e.preventDefault()
    if (!projectId || !rootFolder) return
    if (!newFolderName.trim()) {
      setFolderError('folder name is required')
      return
    }
    setFolderError(undefined)
    await api.POST('/api/v1/projects/{projectId}/folders', {
      params: { path: { projectId } },
      body: { name: newFolderName, parentFolderId: rootFolder.id },
    })
    setNewFolderName('')
    await load()
  }

  async function handleCreateSuite(e: FormEvent) {
    e.preventDefault()
    if (!projectId || !suiteName.trim()) return
    await api.POST('/api/v1/projects/{projectId}/suites', {
      params: { path: { projectId } },
      body: { name: suiteName },
    })
    setSuiteName('')
    await load()
  }

  function startEdit(c: TestCase) {
    setEditingCaseId(c.id)
    setEditTitle(c.content.title)
  }

  async function saveEdit(caseId: string) {
    if (!editTitle.trim()) return
    await api.PUT('/api/v1/cases/{caseId}', {
      params: { path: { caseId } },
      body: { title: editTitle },
    })
    setEditingCaseId(undefined)
    await load()
  }

  async function addCaseToSuite(suiteId: string) {
    const caseId = suiteSelection[suiteId]
    if (!caseId) return
    await api.PUT('/api/v1/suites/{suiteId}/cases/{caseId}', {
      params: { path: { suiteId, caseId } },
    })
    await load()
  }

  async function removeCaseFromSuite(suiteId: string, caseId: string) {
    await api.DELETE('/api/v1/suites/{suiteId}/cases/{caseId}', {
      params: { path: { suiteId, caseId } },
    })
    await load()
  }

  async function handleCreateRun(e: FormEvent) {
    e.preventDefault()
    if (!projectId || !runName.trim()) return
    await api.POST('/api/v1/projects/{projectId}/runs', {
      params: { path: { projectId } },
      body: { name: runName, caseIds: cases.map((c) => c.id) },
    })
    setRunName('')
    await load()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New test case</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateCase} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="case-title">Title</Label>
              <Input
                id="case-title"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                placeholder="Login works"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="case-folder">Folder</Label>
              <select
                id="case-folder"
                className="h-8 rounded-md border px-2 text-sm"
                value={caseFolderId}
                onChange={(e) => setCaseFolderId(e.target.value)}
              >
                <option value="">Root (default)</option>
                {folders
                  .filter((f) => f.parentFolderId)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </div>
            <Button type="submit">Create case</Button>
          </form>
          {caseError && <p className="mt-2 text-sm text-destructive">{caseError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New folder</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateFolder} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="folder-name">New folder name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Auth"
              />
            </div>
            <Button type="submit">Create folder</Button>
          </form>
          {folderError && <p className="mt-2 text-sm text-destructive">{folderError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test cases</CardTitle>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test cases yet.</p>
          ) : (
            <ul className="space-y-2">
              {cases.map((c) =>
                editingCaseId === c.id ? (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Input
                      aria-label="Edit title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-8 max-w-xs"
                    />
                    <Button size="sm" onClick={() => void saveEdit(c.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingCaseId(undefined)}>
                      Cancel
                    </Button>
                  </li>
                ) : (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{c.content.title}</span>
                    <Badge variant="outline">v{c.currentVersion}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>
                      Edit
                    </Button>
                  </li>
                ),
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New suite</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateSuite} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="suite-name">Suite name</Label>
              <Input
                id="suite-name"
                value={suiteName}
                onChange={(e) => setSuiteName(e.target.value)}
                placeholder="Smoke"
              />
            </div>
            <Button type="submit">Create suite</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suites</CardTitle>
        </CardHeader>
        <CardContent>
          {suites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suites yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {suites.map((s) => (
                <li key={s.id} className="space-y-1">
                  <div>
                    {s.name}{' '}
                    <span className="text-muted-foreground">({s.caseIds.length} cases)</span>
                  </div>
                  <ul className="ml-4 space-y-1">
                    {s.caseIds.map((caseId) => {
                      const c = cases.find((x) => x.id === caseId)
                      return (
                        <li key={caseId} className="flex items-center gap-2">
                          <span>{c?.content.title ?? caseId}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${c?.content.title ?? caseId} from ${s.name}`}
                            onClick={() => void removeCaseFromSuite(s.id, caseId)}
                          >
                            Remove
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="ml-4 flex items-center gap-2">
                    <select
                      aria-label={`Add case to ${s.name}`}
                      className="h-8 rounded-md border px-2 text-sm"
                      value={suiteSelection[s.id] ?? ''}
                      onChange={(e) =>
                        setSuiteSelection((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                    >
                      <option value="" disabled>
                        Select a case…
                      </option>
                      {cases
                        .filter((c) => !s.caseIds.includes(c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.content.title}
                          </option>
                        ))}
                    </select>
                    <Button size="sm" onClick={() => void addCaseToSuite(s.id)}>
                      Add
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New run (includes all current cases)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRun} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="run-name">Name</Label>
              <Input
                id="run-name"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="Sprint 1"
              />
            </div>
            <Button type="submit">Create run</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {runs.map((r) => (
                <li key={r.id}>
                  <Link to={`/runs/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
