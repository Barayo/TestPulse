import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { FolderTree } from '@/components/FolderTree'
import { CaseDrawer, type CaseVersionSummary, type Step } from '@/components/CaseDrawer'
import { useBumpDataRevision } from '@/lib/DataRevision'
import type { components } from '@testpulse/shared/api'

type Folder = components['schemas']['Folder']
type TestCase = components['schemas']['TestCase']
type Suite = components['schemas']['Suite']
type Project = components['schemas']['Project']

type DrawerState = { mode: 'create' } | { mode: 'view'; caseId: string; versions: CaseVersionSummary[] }

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

  const [project, setProject] = useState<Project>()
  const [folders, setFolders] = useState<Folder[]>([])
  const [cases, setCases] = useState<TestCase[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [treeCreatingIn, setTreeCreatingIn] = useState<string | null>(null)
  const [contentCreatingFolder, setContentCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    const [{ data: p }, { data: f }, { data: c }, { data: s }] = await Promise.all([
      api.GET('/api/v1/projects/{projectId}', { params: { path: { projectId } } }),
      api.GET('/api/v1/projects/{projectId}/folders', { params: { path: { projectId } } }),
      api.GET('/api/v1/projects/{projectId}/cases', { params: { path: { projectId } } }),
      api.GET('/api/v1/projects/{projectId}/suites', { params: { path: { projectId } } }),
    ])
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

  if (!projectId || !root || !selectedFolderId) return null

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

  async function openCase(caseId: string) {
    if (!projectId) return
    const { data } = await api.GET('/api/v1/cases/{caseId}/versions', { params: { path: { caseId } } })
    const versions = (data ?? [])
      .map((v) => ({ version: v.version, createdAt: v.createdAt }))
      .sort((a, b) => b.version - a.version)
    setDrawer({ mode: 'view', caseId, versions })
  }

  async function createCase(input: { title: string; steps: Step[] }) {
    if (!projectId || !selectedFolderId) return
    await api.POST('/api/v1/projects/{projectId}/cases', {
      params: { path: { projectId } },
      body: { title: input.title, folderId: selectedFolderId, steps: input.steps },
    })
    setDrawer(null)
    await load()
    bumpLanding()
  }

  async function saveCaseEdit(caseId: string, input: { title: string; steps: Step[] }) {
    await api.PUT('/api/v1/cases/{caseId}', {
      params: { path: { caseId } },
      body: { title: input.title, steps: input.steps },
    })
    await load()
    bumpLanding()
    await openCase(caseId)
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

  const activeCase = drawer?.mode === 'view' ? cases.find((c) => c.id === drawer.caseId) : undefined

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex gap-4">
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
        />

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              onClick={() => {
                setContentCreatingFolder(true)
                setNewFolderName('')
              }}
            >
              + New section
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              onClick={() => setDrawer({ mode: 'create' })}
            >
              + New test case
            </button>
          </div>

          <div className="rounded-md border">
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
                  <li key={f.id} className="border-b px-3 py-2 text-sm last:border-b-0">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-left"
                      onClick={() => navigate(`/projects/${projectId}/library/${f.id}`)}
                    >
                      <span aria-hidden="true">📁</span>
                      <span>{f.name}</span>
                    </button>
                  </li>
                ))}
                {casesHere.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-2 text-left"
                      onClick={() => void openCase(c.id)}
                    >
                      <span aria-hidden="true">📄</span>
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {drawer?.mode === 'create' && (
        <CaseDrawer
          mode="create"
          open
          folderName={displayFolderName(selectedFolder, root.id)}
          onClose={() => setDrawer(null)}
          onCreate={(input) => void createCase(input)}
        />
      )}
      {drawer?.mode === 'view' && activeCase && (
        <CaseDrawer
          mode="view"
          open
          folderName={displayFolderName(selectedFolder, root.id)}
          onClose={() => setDrawer(null)}
          caseTitle={activeCase.content.title}
          currentVersion={activeCase.currentVersion}
          steps={(activeCase.content.steps ?? []).map((s) => ({ action: s.action, expected: s.expected ?? '' }))}
          suiteNames={suiteNamesFor(activeCase.id)}
          versions={drawer.versions}
          onSaveEdit={(input) => void saveCaseEdit(activeCase.id, input)}
        />
      )}
    </div>
  )
}
