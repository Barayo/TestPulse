import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FolderIcon, FileTextIcon, FolderInputIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { FolderTree, CASE_ID_MIME } from '@/components/FolderTree'
import { FolderPicker } from '@/components/FolderPicker'
import { CaseDrawer, type ClassificationFields, type Step } from '@/components/CaseDrawer'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useBumpDataRevision } from '@/lib/DataRevision'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']
type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

type DrawerState = { mode: 'create' }

function ancestorChain(folders: Folder[], folderId: string): Folder[] {
  const chain: Folder[] = []
  let current = folders.find((f) => f.id === folderId)
  while (current && current.parentFolderId) {
    chain.unshift(current)
    current = folders.find((f) => f.id === current!.parentFolderId)
  }
  return chain
}

// The project's auto-created root folder is surfaced to users as "Library" —
// a UI label only, not a rename of the underlying entity (still literally
// named "Root" in the database).
function displayFolderName(folder: Folder | undefined, rootId: string): string {
  if (!folder) return ''
  return folder.id === rootId ? 'Library' : folder.name
}

export default function FolderExplorerPage() {
  const { projectId, folderId } = useParams<{ projectId: string; folderId?: string }>()
  const navigate = useNavigate()
  const bumpLanding = useBumpDataRevision()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [cases, setCases] = useState<TestCase[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null)
  const [moveQuery, setMoveQuery] = useState('')
  const [browsingSections, setBrowsingSections] = useState(false)
  const [browseQuery, setBrowseQuery] = useState('')
  const [treeCreatingIn, setTreeCreatingIn] = useState<string | null>(null)
  const [contentCreatingFolder, setContentCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setNotFound(false)
    const [{ data: p }, { data: f }, { data: c }, { data: s }] = await Promise.all([
      api.GET('/api/v1/projects/{projectId}', { params: { path: { projectId } } }),
      api.GET('/api/v1/projects/{projectId}/folders', { params: { path: { projectId } } }),
      api.GET('/api/v1/projects/{projectId}/cases', { params: { path: { projectId } } }),
      api.GET('/api/v1/projects/{projectId}/suites', { params: { path: { projectId } } }),
    ])
    if (!p) {
      setNotFound(true)
      return
    }
    setProject(p)
    setFolders(f ?? [])
    setCases(c ?? [])
    setSuites(s ?? [])
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const root = folders.find((f) => !f.parentFolderId)
  const selectedFolderId = folderId ?? root?.id
  const selectedFolder = folders.find((f) => f.id === selectedFolderId)

  useEffect(() => {
    if (!selectedFolderId) return
    const ancestors = ancestorChain(folders, selectedFolderId).map((f) => f.id)
    setExpanded((prev) => new Set([...prev, ...ancestors]))
  }, [selectedFolderId, folders])

  if (!projectId) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Project not found. <Link to="/" className="underline">Go to Projects</Link>
      </p>
    )
  }
  if (!root || !selectedFolderId) return null

  const subfolders = folders.filter((f) => f.parentFolderId === selectedFolderId)
  const casesHere = cases.filter((c) => c.folderId === selectedFolderId)

  function suiteNamesFor(caseId: string): string[] {
    return suites.filter((s) => s.caseIds.includes(caseId)).map((s) => s.name)
  }

  async function createFolder(parentId: string, name: string) {
    if (!projectId || !name.trim()) return
    await api.POST('/api/v1/projects/{projectId}/folders', {
      params: { path: { projectId } },
      body: { name: name.trim(), parentFolderId: parentId },
    })
    await load()
    bumpLanding()
  }

  // Dropping onto the case's own current folder is a no-op — not an error,
  // just nothing to do (design.md, move-cases-between-folders).
  async function moveCase(caseId: string, targetFolderId: string) {
    const current = cases.find((c) => c.id === caseId)
    if (!current || current.folderId === targetFolderId) return
    await api.PUT('/api/v1/cases/{caseId}/folder', {
      params: { path: { caseId } },
      body: { folderId: targetFolderId },
    })
    await load()
    bumpLanding()
  }

  function openCase(caseId: string) {
    if (!projectId) return
    navigate(`/projects/${projectId}/cases/${caseId}`)
  }

  async function createCase(input: { title: string; steps: Step[] } & ClassificationFields) {
    if (!projectId || !selectedFolderId) return
    await api.POST('/api/v1/projects/{projectId}/cases', {
      params: { path: { projectId } },
      body: {
        title: input.title,
        folderId: selectedFolderId,
        steps: input.steps,
        priority: input.priority,
        tags: input.tags,
        platform: input.platform,
        testType: input.testType,
        automated: input.automated,
      },
    })
    setDrawer(null)
    await load()
    bumpLanding()
  }

  const breadcrumbSegments: Crumb[] = [
    { label: 'Projects', href: '/' },
    { label: project?.name ?? '', href: `/projects/${projectId}` },
    { label: 'Library', href: `/projects/${projectId}/library/${root.id}` },
    ...ancestorChain(folders, selectedFolderId).map((f) => ({
      label: f.name,
      href: `/projects/${projectId}/library/${f.id}`,
    })),
  ]

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex gap-4">
        {isDesktop && (
          <FolderTree
            folders={folders.map((f) => ({ id: f.id, name: f.name, parentFolderId: f.parentFolderId }))}
            rootId={root.id}
            selectedId={selectedFolderId}
            expanded={expanded}
            onSelect={(id) => navigate(`/projects/${projectId}/library/${id}`)}
            onToggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
            onNewSubfolder={(parentId) => {
              setExpanded((prev) => new Set(prev).add(parentId))
              setTreeCreatingIn(parentId)
              setNewFolderName('')
            }}
            creatingIn={treeCreatingIn}
            newFolderValue={newFolderName}
            onNewFolderValueChange={setNewFolderName}
            onConfirmNewFolder={() => {
              if (treeCreatingIn) void createFolder(treeCreatingIn, newFolderName)
              setTreeCreatingIn(null)
            }}
            onCancelNewFolder={() => setTreeCreatingIn(null)}
            onDropCase={(caseId, folderId) => void moveCase(caseId, folderId)}
          />
        )}

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-end gap-2">
            {!isDesktop && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                onClick={() => {
                  setBrowseQuery('')
                  setBrowsingSections(true)
                }}
              >
                Browse sections
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setContentCreatingFolder(true)
                setNewFolderName('')
              }}
            >
              + New section
            </Button>
            <Button type="button" onClick={() => setDrawer({ mode: 'create' })}>
              + New test case
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {contentCreatingFolder && (
                <div className="flex items-center gap-2 border-b bg-accent px-3 py-2">
                  <input
                    aria-label="New section name"
                    autoFocus
                    className="h-7 flex-1 rounded border px-2 text-sm"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void createFolder(selectedFolderId, newFolderName)
                        setContentCreatingFolder(false)
                      }
                      if (e.key === 'Escape') setContentCreatingFolder(false)
                    }}
                  />
                </div>
              )}
              {subfolders.length === 0 && casesHere.length === 0 && !contentCreatingFolder ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Nothing here yet in {displayFolderName(selectedFolder, root.id)}.
                </p>
              ) : (
                <ul aria-label="Section contents">
                  {subfolders.map((f) => (
                    <li
                      key={f.id}
                      className={`border-b px-3 py-2 text-sm last:border-b-0 ${dragOverFolderId === f.id ? 'bg-primary/10' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragOverFolderId(f.id)
                      }}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOverFolderId(null)
                        const caseId = e.dataTransfer.getData(CASE_ID_MIME)
                        if (caseId) void moveCase(caseId, f.id)
                      }}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 text-left"
                        onClick={() => navigate(`/projects/${projectId}/library/${f.id}`)}
                      >
                        <FolderIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span>{f.name}</span>
                      </button>
                    </li>
                  ))}
                  {casesHere.map((c) => (
                    <li
                      key={c.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData(CASE_ID_MIME, c.id)}
                      className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                    >
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => openCase(c.id)}
                      >
                        <FileTextIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span>{c.content.title}</span>
                      </button>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        v{c.currentVersion}
                      </span>
                      {suiteNamesFor(c.id).map((name) => (
                        <span key={name} className="rounded-full bg-accent px-2 py-0.5 text-xs">
                          {name}
                        </span>
                      ))}
                      <button
                        type="button"
                        aria-label="Move to…"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setMoveQuery('')
                          setMovingCaseId(c.id)
                        }}
                      >
                        <FolderInputIcon className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={movingCaseId !== null} onOpenChange={(open) => !open && setMovingCaseId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move to…</DialogTitle>
          <FolderPicker
            folders={folders}
            rootId={root.id}
            query={moveQuery}
            onQueryChange={setMoveQuery}
            onSelect={(targetFolderId) => {
              if (movingCaseId) void moveCase(movingCaseId, targetFolderId)
              setMovingCaseId(null)
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={browsingSections} onOpenChange={setBrowsingSections}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Browse sections</DialogTitle>
          <FolderPicker
            folders={folders}
            rootId={root.id}
            query={browseQuery}
            onQueryChange={setBrowseQuery}
            onSelect={(targetFolderId) => {
              navigate(`/projects/${projectId}/library/${targetFolderId}`)
              setBrowsingSections(false)
            }}
          />
        </DialogContent>
      </Dialog>

      {drawer?.mode === 'create' && (
        <CaseDrawer
          mode="create"
          open
          folderName={displayFolderName(selectedFolder, root.id)}
          onClose={() => setDrawer(null)}
          onCreate={(input) => void createCase(input)}
        />
      )}
    </div>
  )
}
