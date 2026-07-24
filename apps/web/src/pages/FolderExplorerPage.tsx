import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FolderIcon, FileTextIcon, FolderInputIcon, Trash2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { FolderTree, CASE_ID_MIME } from '@/components/FolderTree'
import { FolderPicker } from '@/components/FolderPicker'
import { CaseDrawer, type ClassificationFields, type Step } from '@/components/CaseDrawer'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']
type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

type DeleteTarget =
  | { kind: 'case'; key: string; title: string }
  | { kind: 'folder'; id: string; name: string; caseCount: number; folderCount: number }

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

// Each row owns its own RowActionMenu ref so a right-click on the row can
// open that exact menu at the cursor, alongside its visible "⋯" trigger
// (unify-library-row-menus) — a ref can't live inside a bare .map()
// callback, hence these as real component instances, matching the
// precedent FolderTree.tsx's own TreeNode already sets.
function FolderRow({
  folder,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onNavigate,
  canDelete,
  onRequestDelete,
}: {
  folder: Folder
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (caseKey: string) => void
  onNavigate: () => void
  canDelete: boolean
  onRequestDelete: () => void
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const items: RowActionMenuItem[] = [
    { label: 'Delete', danger: true, icon: <Trash2Icon className="size-4" aria-hidden="true" />, onSelect: onRequestDelete },
  ]

  return (
    <li
      className={`flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 ${isDragOver ? 'bg-primary/10' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDragLeave()
        const caseKey = e.dataTransfer.getData(CASE_ID_MIME)
        if (caseKey) onDrop(caseKey)
      }}
      onContextMenu={(e) => {
        if (!canDelete) return
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={onNavigate}>
        <FolderIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span>{folder.name}</span>
      </button>
      {canDelete && <RowActionMenu ref={menuRef} label={`Actions for ${folder.name}`} items={items} />}
    </li>
  )
}

function CaseRow({
  testCase,
  suiteNames,
  onOpen,
  onDragStart,
  onMoveTo,
  canDelete,
  onRequestDelete,
}: {
  testCase: TestCase
  suiteNames: string[]
  onOpen: () => void
  onDragStart: (e: DragEvent) => void
  onMoveTo: () => void
  canDelete: boolean
  onRequestDelete: () => void
}) {
  const menuRef = useRef<RowActionMenuHandle>(null)
  const items: RowActionMenuItem[] = [
    { label: 'Move to…', icon: <FolderInputIcon className="size-4" aria-hidden="true" />, onSelect: onMoveTo },
    ...(canDelete
      ? [
          {
            label: 'Delete',
            danger: true,
            dividerBefore: true,
            icon: <Trash2Icon className="size-4" aria-hidden="true" />,
            onSelect: onRequestDelete,
          } satisfies RowActionMenuItem,
        ]
      : []),
  ]

  return (
    <li
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
      onContextMenu={(e) => {
        e.preventDefault()
        menuRef.current?.openAt(e.clientX, e.clientY)
      }}
    >
      <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={onOpen}>
        <FileTextIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span>{testCase.content.title}</span>
      </button>
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
        v{testCase.currentVersion}
      </span>
      {suiteNames.map((name) => (
        <span key={name} className="rounded-full bg-accent px-2 py-0.5 text-xs">
          {name}
        </span>
      ))}
      <RowActionMenu ref={menuRef} label={`Actions for ${testCase.content.title}`} items={items} />
    </li>
  )
}

export default function FolderExplorerPage() {
  const { projectKey, folderId } = useParams<{ projectKey: string; folderId?: string }>()
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
  const [movingCaseKey, setMovingCaseKey] = useState<string | null>(null)
  const [moveQuery, setMoveQuery] = useState('')
  const [browsingSections, setBrowsingSections] = useState(false)
  const [browseQuery, setBrowseQuery] = useState('')
  const [treeCreatingIn, setTreeCreatingIn] = useState<string | null>(null)
  const [contentCreatingFolder, setContentCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const permissions = useProjectPermissions(projectKey)

  const load = useCallback(async () => {
    if (!projectKey) return
    setNotFound(false)
    const [{ data: p }, { data: f }, { data: c }, { data: s }] = await Promise.all([
      api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
      api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey } } }),
      api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey } } }),
      api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey } } }),
    ])
    if (!p) {
      setNotFound(true)
      return
    }
    setProject(p)
    setFolders(f ?? [])
    setCases(c ?? [])
    setSuites(s ?? [])
  }, [projectKey])

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

  if (!projectKey) return null
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
    if (!projectKey || !name.trim()) return
    await api.POST('/api/v1/projects/{projectKey}/folders', {
      params: { path: { projectKey } },
      body: { name: name.trim(), parentFolderId: parentId },
    })
    await load()
    bumpLanding()
  }

  // Dropping onto the case's own current folder is a no-op — not an error,
  // just nothing to do (design.md, move-cases-between-folders).
  async function moveCase(caseKey: string, targetFolderId: string) {
    const current = cases.find((c) => c.key === caseKey)
    if (!current || current.folderId === targetFolderId) return
    await api.PUT('/api/v1/cases/{caseKey}/folder', {
      params: { path: { caseKey } },
      body: { folderId: targetFolderId },
    })
    await load()
    bumpLanding()
  }

  async function requestDeleteFolder(folder: Folder) {
    const { data: preview } = await api.GET('/api/v1/folders/{folderId}/delete-preview', {
      params: { path: { folderId: folder.id } },
    })
    setDeleteTarget({
      kind: 'folder',
      id: folder.id,
      name: folder.name,
      caseCount: preview?.caseCount ?? 0,
      folderCount: preview?.folderCount ?? 0,
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'case') {
      await api.DELETE('/api/v1/cases/{caseKey}', { params: { path: { caseKey: deleteTarget.key } } })
    } else {
      await api.DELETE('/api/v1/folders/{folderId}', { params: { path: { folderId: deleteTarget.id } } })
    }
    setDeleteTarget(null)
    await load()
    bumpLanding()
  }

  function openCase(caseKey: string) {
    if (!projectKey) return
    navigate(`/projects/${projectKey}/cases/${caseKey}`)
  }

  async function createCase(input: { title: string; steps: Step[] } & ClassificationFields) {
    if (!projectKey || !selectedFolderId) return
    await api.POST('/api/v1/projects/{projectKey}/cases', {
      params: { path: { projectKey } },
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
    { label: project?.name ?? '', href: `/projects/${projectKey}` },
    { label: 'Library', href: `/projects/${projectKey}/library/${root.id}` },
    ...ancestorChain(folders, selectedFolderId).map((f) => ({
      label: f.name,
      href: `/projects/${projectKey}/library/${f.id}`,
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
            onSelect={(id) => navigate(`/projects/${projectKey}/library/${id}`)}
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
            onDropCase={(caseKey, folderId) => void moveCase(caseKey, folderId)}
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
                    <FolderRow
                      key={f.id}
                      folder={f}
                      isDragOver={dragOverFolderId === f.id}
                      onDragOver={() => setDragOverFolderId(f.id)}
                      onDragLeave={() => setDragOverFolderId(null)}
                      onDrop={(caseKey) => void moveCase(caseKey, f.id)}
                      onNavigate={() => navigate(`/projects/${projectKey}/library/${f.id}`)}
                      canDelete={Boolean(permissions?.sectionDelete)}
                      onRequestDelete={() => void requestDeleteFolder(f)}
                    />
                  ))}
                  {casesHere.map((c) => (
                    <CaseRow
                      key={c.id}
                      testCase={c}
                      suiteNames={suiteNamesFor(c.id)}
                      onOpen={() => openCase(c.key)}
                      onDragStart={(e) => e.dataTransfer.setData(CASE_ID_MIME, c.key)}
                      onMoveTo={() => {
                        setMoveQuery('')
                        setMovingCaseKey(c.key)
                      }}
                      canDelete={Boolean(permissions?.caseDelete)}
                      onRequestDelete={() => setDeleteTarget({ kind: 'case', key: c.key, title: c.content.title })}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={movingCaseKey !== null} onOpenChange={(open) => !open && setMovingCaseKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move to…</DialogTitle>
          <FolderPicker
            folders={folders}
            rootId={root.id}
            query={moveQuery}
            onQueryChange={setMoveQuery}
            onSelect={(targetFolderId) => {
              if (movingCaseKey) void moveCase(movingCaseKey, targetFolderId)
              setMovingCaseKey(null)
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
              navigate(`/projects/${projectKey}/library/${targetFolderId}`)
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

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {deleteTarget?.kind === 'case' && (
            <>
              <DialogTitle>Delete case?</DialogTitle>
              <DialogDescription>
                Delete case &ldquo;{deleteTarget.title}&rdquo;? This cannot be undone.
              </DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void confirmDelete()}>
                  Delete case
                </Button>
              </DialogFooter>
            </>
          )}
          {deleteTarget?.kind === 'folder' && (
            <>
              <DialogTitle>Delete section?</DialogTitle>
              <DialogDescription>
                Delete section &ldquo;{deleteTarget.name}&rdquo; and everything in it? This removes{' '}
                {deleteTarget.caseCount} case{deleteTarget.caseCount === 1 ? '' : 's'} and{' '}
                {deleteTarget.folderCount} subsection{deleteTarget.folderCount === 1 ? '' : 's'}. This cannot be
                undone.
              </DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void confirmDelete()}>
                  Delete section
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
