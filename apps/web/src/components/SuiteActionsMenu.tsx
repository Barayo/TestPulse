import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router'
import { PencilIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { RowActionMenu, type RowActionMenuHandle, type RowActionMenuItem } from '@/components/RowActionMenu'
import { useBumpDataRevision } from '@/lib/DataRevision'
import type { components } from '@testpulse/shared/api'

type Suite = components['schemas']['Suite']
type Permissions = components['schemas']['Permissions']

export type SuiteActionsMenuHandle = {
  openAt: (x: number, y: number) => void
}

type Props = {
  suite: Suite
  projectKey: string
  variant: 'buttons' | 'menu'
  navigate: NavigateFunction
  // Called after a rename, a delete on the index, or a quick-run succeeds,
  // so the caller can refetch whatever list/detail data it owns.
  onChanged: () => void | Promise<void>
  // Called with the new run's key and name after a successful quick-run, so
  // a caller that shows a confirmation toast (SuiteDetailPage, SuitesPage)
  // can name the run in it — optional since not every future caller needs it.
  onRunCreated?: (run: { key: string; name: string }) => void
  // The caller's own effective permissions (useProjectPermissions) — hides
  // (not disables) Run suite/Rename/Delete individually per flag, the same
  // "hide entirely, don't rely on the server 403" rule the rest of the app
  // already applies. `undefined` (no session, or the permissions request
  // hasn't resolved/failed) is treated as zero permissions, which is also
  // what an anonymous visitor on a public project always has — this
  // component is shared by SuiteDetailPage and SuitesPage, both public-
  // viewable (unify-authenticated-and-public-views tasks.md 2.1).
  permissions: Permissions | undefined
}

// Extracted from SuiteDetailPage's Actions sidebar (add-suite-index-context-menu)
// so the Suites index can offer the same three actions via a right-click/"⋯"
// menu without duplicating the dialogs or their handlers. variant="buttons"
// reproduces the detail page's existing full-width button group unchanged;
// variant="menu" wraps the same handlers in a RowActionMenu, matching the
// per-row menu pattern already used by FolderRow/CaseRow/RunItemRow.
export const SuiteActionsMenu = forwardRef<SuiteActionsMenuHandle, Props>(function SuiteActionsMenu(
  { suite, projectKey, variant, navigate, onChanged, onRunCreated, permissions },
  ref,
) {
  const bumpLanding = useBumpDataRevision()
  const menuRef = useRef<RowActionMenuHandle>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [runningQuick, setRunningQuick] = useState(false)
  const [quickRunName, setQuickRunName] = useState('')

  useImperativeHandle(ref, () => ({
    openAt: (x, y) => menuRef.current?.openAt(x, y),
  }))

  function openRunSuite() {
    setQuickRunName(`${suite.name} run`)
    setRunningQuick(true)
  }

  async function handleQuickRun() {
    if (!quickRunName.trim()) return
    const { data } = await api.POST('/api/v1/projects/{projectKey}/runs', {
      params: { path: { projectKey } },
      body: { name: quickRunName.trim(), suiteKey: suite.key },
    })
    setRunningQuick(false)
    bumpLanding()
    if (data) onRunCreated?.({ key: data.key, name: data.name })
    await onChanged()
  }

  function handleCustomizeSelection() {
    setRunningQuick(false)
    navigate(`/projects/${projectKey}/runs/new`, {
      state: { seedFromSuiteKey: suite.key, seedName: quickRunName.trim() },
    })
  }

  async function handleRename() {
    if (!renameValue.trim()) return
    await api.PUT('/api/v1/suites/{suiteKey}', {
      params: { path: { suiteKey: suite.key } },
      body: { name: renameValue.trim() },
    })
    setRenaming(false)
    bumpLanding()
    await onChanged()
  }

  async function handleDelete() {
    await api.DELETE('/api/v1/suites/{suiteKey}', { params: { path: { suiteKey: suite.key } } })
    setDeleting(false)
    bumpLanding()
    // On the detail page (variant="buttons") the current route is now
    // invalid — navigate away, matching the pre-extraction behavior exactly.
    // On the index (variant="menu") the row just disappears from the list.
    if (variant === 'buttons') {
      navigate(`/projects/${projectKey}/suites`)
    } else {
      await onChanged()
    }
  }

  const canRun = Boolean(permissions?.runCreate)
  const canRename = Boolean(permissions?.suiteEditMembership)
  const canDelete = Boolean(permissions?.manageProject)

  const menuItems: RowActionMenuItem[] = [
    ...(canRun
      ? [{ label: 'Run suite', icon: <PlayIcon className="size-4" aria-hidden="true" />, onSelect: openRunSuite } satisfies RowActionMenuItem]
      : []),
    ...(canRename
      ? [
          {
            label: 'Rename',
            icon: <PencilIcon className="size-4" aria-hidden="true" />,
            onSelect: () => {
              setRenameValue(suite.name)
              setRenaming(true)
            },
          } satisfies RowActionMenuItem,
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: <Trash2Icon className="size-4" aria-hidden="true" />,
            danger: true,
            onSelect: () => setDeleting(true),
          } satisfies RowActionMenuItem,
        ]
      : []),
  ]

  return (
    <>
      {variant === 'buttons' ? (
        <div className="flex flex-col gap-2">
          {canRun && (
            <Button type="button" onClick={openRunSuite}>
              Run suite
            </Button>
          )}
          {canRename && (
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
          )}
          {canDelete && (
            <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
        </div>
      ) : (
        menuItems.length > 0 && <RowActionMenu ref={menuRef} label={`Actions for ${suite.name}`} items={menuItems} />
      )}

      <Dialog open={runningQuick} onOpenChange={setRunningQuick}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Run {suite.name}</DialogTitle>
          <DialogDescription>
            {suite.caseIds.length} {suite.caseIds.length === 1 ? 'case' : 'cases'} from {suite.name}
          </DialogDescription>
          <div className="space-y-1">
            <Label htmlFor={`quick-run-name-${suite.key}`}>Name</Label>
            <Input
              id={`quick-run-name-${suite.key}`}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={quickRunName}
              onChange={(e) => setQuickRunName(e.target.value)}
            />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={handleCustomizeSelection}>
              Customize selection
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRunningQuick(false)}>
                Cancel
              </Button>
              <Button disabled={!quickRunName.trim()} onClick={() => void handleQuickRun()}>
                Create run
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Rename suite</DialogTitle>
          <div className="space-y-1">
            <Label htmlFor={`rename-suite-name-${suite.key}`}>Suite name</Label>
            <Input
              id={`rename-suite-name-${suite.key}`}
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
    </>
  )
})
