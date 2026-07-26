import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { SuiteCaseGrid, type SuiteCaseGridCase } from '@/components/SuiteCaseGrid'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { PropertyRow } from '@/components/PropertyRow'
import { HealthBar } from '@/components/HealthBar'
import { timeAgo } from '@/lib/timeAgo'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useBumpDataRevision } from '@/lib/DataRevision'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']
type Folder = components['schemas']['Folder']

function toGridCase(c: TestCase): SuiteCaseGridCase {
  return {
    id: c.key,
    title: c.content.title,
    tags: c.content.tags ?? [],
    priority: c.content.priority ?? '',
    platform: c.content.platform ?? '',
    testType: c.content.testType ?? '',
    folderId: c.folderId,
  }
}

export default function SuiteDetailPage() {
  const { projectKey, suiteKey } = useParams<{ projectKey: string; suiteKey: string }>()
  const navigate = useNavigate()
  const bumpLanding = useBumpDataRevision()

  const [project, setProject] = useState<Project>()
  const [suite, setSuite] = useState<Suite>()
  const [cases, setCases] = useState<TestCase[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [notFound, setNotFound] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [baseline, setBaseline] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!projectKey || !suiteKey) return
    setNotFound(false)
    const [{ data: p }, { data: c }, { data: f }, { data: s }] = await Promise.all([
      api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
      api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
      api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
      api.GET('/api/v1/suites/{suiteKey}', { params: { path: { suiteKey } } }),
    ])
    if (!p || !s) {
      setNotFound(true)
      return
    }
    setProject(p)
    setCases(c ?? [])
    setFolders(f ?? [])
    setSuite(s)
  }, [projectKey, suiteKey])

  useEffect(() => {
    void load()
  }, [load])

  const gridCases = cases.map(toGridCase)

  // A suite's caseIds are the case's db id; the grid keys everything by case
  // key. An id with no matching case (soft-deleted) has no key to key it by
  // and no row to render — kept as the raw db id so it stays in the set,
  // untouched, and never generates a spurious remove call.
  useEffect(() => {
    if (!suite) return
    const asKeys = new Set(suite.caseIds.map((id) => cases.find((c) => c.id === id)?.key ?? id))
    setSelected(asKeys)
    setBaseline(asKeys)
  }, [suite, cases])

  function toggle(caseKey: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
  }

  async function handleSaveEdit() {
    if (!suite) return
    const added = Array.from(selected).filter((id) => !baseline.has(id))
    const removed = Array.from(baseline).filter((id) => !selected.has(id))
    await Promise.all([
      ...added.map((caseKey) =>
        api.PUT('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey: suite.key, caseKey } } }),
      ),
      ...removed.map((caseKey) =>
        api.DELETE('/api/v1/suites/{suiteKey}/cases/{caseKey}', { params: { path: { suiteKey: suite.key, caseKey } } }),
      ),
    ])
    await load()
    bumpLanding()
  }

  async function handleRename() {
    if (!suiteKey || !renameValue.trim()) return
    await api.PUT('/api/v1/suites/{suiteKey}', { params: { path: { suiteKey } }, body: { name: renameValue.trim() } })
    setRenaming(false)
    await load()
    bumpLanding()
  }

  async function handleDelete() {
    if (!suiteKey || !projectKey) return
    await api.DELETE('/api/v1/suites/{suiteKey}', { params: { path: { suiteKey } } })
    bumpLanding()
    navigate(`/projects/${projectKey}/suites`)
  }

  if (!projectKey || !suiteKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Suite not found. <Link to={`/projects/${projectKey}/suites`} className="underline">Go to Suites</Link>
      </p>
    )
  }
  if (!project || !suite) return null

  const isDirty = selected.size !== baseline.size || Array.from(selected).some((id) => !baseline.has(id))

  const breadcrumbSegments: Crumb[] = [
    { label: 'Projects', href: '/' },
    { label: project.name, href: `/projects/${projectKey}` },
    { label: 'Suites', href: `/projects/${projectKey}/suites` },
    { label: suite.name },
  ]

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <h1 className="tp-heading text-2xl">{suite.name}</h1>
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <SuiteCaseGrid
          cases={gridCases}
          folders={folders}
          selected={selected}
          onToggle={toggle}
          commitLabel="Save changes"
          commitDisabled={!isDirty}
          onCommit={() => void handleSaveEdit()}
        />

        <div
          className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5"
          data-testid="suite-sidebar"
        >
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Cases" value={suite.caseIds.length} />
            <PropertyRow
              label="Pass rate"
              value={suite.passRate === null ? 'Never run' : <HealthBar rate={suite.passRate} />}
            />
            <PropertyRow label="Last run" value={suite.lastRunAt ? timeAgo(suite.lastRunAt) : 'Never run'} />
            <PropertyRow label="Created" value={suite.createdAt ? new Date(suite.createdAt).toLocaleDateString() : undefined} />
          </CaseSidebarSection>

          <CaseSidebarSection title="Actions">
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRenameValue(suite.name)
                  setRenaming(true)
                }}
              >
                Rename
              </Button>
              <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </div>
          </CaseSidebarSection>
        </div>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Rename suite</DialogTitle>
          <div className="space-y-1">
            <Label htmlFor="rename-suite-name">Suite name</Label>
            <Input
              id="rename-suite-name"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameValue.trim()) void handleRename()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button disabled={!renameValue.trim()} onClick={() => void handleRename()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete suite?</DialogTitle>
          <DialogDescription>
            Delete &ldquo;{suite.name}&rdquo;? This cannot be undone. Its cases stay in your Library.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              Confirm delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
