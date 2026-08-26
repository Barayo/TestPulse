import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { EyeIcon, FileTextIcon, FolderIcon, LayersIcon, CirclePlayIcon, SettingsIcon, Trash2Icon, Loader2Icon } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { AdminShell } from '@/components/AdminShell'

type Role = {
  id: string
  name: string
  rank: number
  canRead: boolean
  canCaseCreate: boolean
  canCaseEdit: boolean
  canCaseDelete: boolean
  canSectionCreate: boolean
  canSectionEdit: boolean
  canSectionDelete: boolean
  canSuiteCreate: boolean
  canSuiteEditMembership: boolean
  canRunCreate: boolean
  canRunRecordResult: boolean
  canManageProject: boolean
  canRunDelete: boolean
  canProjectDelete: boolean
}

type PermissionKey =
  | 'canRead'
  | 'canCaseCreate'
  | 'canCaseEdit'
  | 'canCaseDelete'
  | 'canSectionCreate'
  | 'canSectionEdit'
  | 'canSectionDelete'
  | 'canSuiteCreate'
  | 'canSuiteEditMembership'
  | 'canRunCreate'
  | 'canRunRecordResult'
  | 'canManageProject'
  | 'canRunDelete'
  | 'canProjectDelete'

// Ten concrete, per-resource permission flags (design.md D11) — replaced an
// earlier set of five broader ones (read/execute/author/delete/manageProject)
// that each bundled several unrelated actions under one switch. Grouped by
// resource into sections (rather than one flat wrapping row) so the layout
// holds up on mobile and scales as more actions are added to a resource —
// a new flag just joins its section's row instead of lengthening one long
// line. `fullLabel` names the field for aria-label/accessibility purposes;
// `shortLabel` is what's shown next to the checkbox, since the section
// heading already supplies the resource name (e.g. "Cases" → "Create", not
// "Create Case"). `icon` reuses the same resource↔icon mapping already
// established on the project landing page (Folder/Layers/CirclePlay for
// sections/suites/runs), so a section here reads as "the same concept" as
// everywhere else it appears, not a new visual vocabulary.
// Ordered top level → bottom level (a Project contains Sections, Sections
// contain Cases, Cases get grouped into Suites, Suites get executed as
// Runs — the same hierarchy docs/test-management.md walks through), not
// alphabetically. General/Read sits first since it's the one prerequisite
// every other permission implicitly assumes.
const PERMISSION_SECTIONS: {
  heading: string
  icon: ReactNode
  items: { key: PermissionKey; shortLabel: string; fullLabel: string }[]
}[] = [
  {
    heading: 'General',
    icon: <EyeIcon className="size-4" aria-hidden="true" />,
    items: [{ key: 'canRead', shortLabel: 'Read', fullLabel: 'Read' }],
  },
  {
    heading: 'Project',
    icon: <SettingsIcon className="size-4" aria-hidden="true" />,
    items: [
      { key: 'canManageProject', shortLabel: 'Manage', fullLabel: 'Manage Project' },
      { key: 'canProjectDelete', shortLabel: 'Delete', fullLabel: 'Delete Project' },
    ],
  },
  {
    heading: 'Sections',
    icon: <FolderIcon className="size-4" aria-hidden="true" />,
    items: [
      { key: 'canSectionCreate', shortLabel: 'Create', fullLabel: 'Create Section' },
      { key: 'canSectionEdit', shortLabel: 'Edit', fullLabel: 'Edit Section' },
      { key: 'canSectionDelete', shortLabel: 'Delete', fullLabel: 'Delete Section' },
    ],
  },
  {
    heading: 'Cases',
    icon: <FileTextIcon className="size-4" aria-hidden="true" />,
    items: [
      { key: 'canCaseCreate', shortLabel: 'Create', fullLabel: 'Create Case' },
      { key: 'canCaseEdit', shortLabel: 'Edit', fullLabel: 'Edit Case' },
      { key: 'canCaseDelete', shortLabel: 'Delete', fullLabel: 'Delete Case' },
    ],
  },
  {
    heading: 'Suites',
    icon: <LayersIcon className="size-4" aria-hidden="true" />,
    items: [
      { key: 'canSuiteCreate', shortLabel: 'Create', fullLabel: 'Create Suite' },
      { key: 'canSuiteEditMembership', shortLabel: 'Edit Membership', fullLabel: 'Edit Suite Membership' },
    ],
  },
  {
    heading: 'Runs',
    icon: <CirclePlayIcon className="size-4" aria-hidden="true" />,
    items: [
      { key: 'canRunCreate', shortLabel: 'Create', fullLabel: 'Create Run' },
      { key: 'canRunRecordResult', shortLabel: 'Record Result', fullLabel: 'Record Result' },
      { key: 'canRunDelete', shortLabel: 'Delete', fullLabel: 'Delete Run' },
    ],
  },
]

// Alternating teal transparency (not a second hue — an earlier pass paired
// the brand teal with a gold tint, which read as too busy/too "yellow") so
// six otherwise-identical grey blocks still read as distinct, scannable
// groups without introducing a second color into the page.
const SECTION_TINTS = ['bg-primary/5', 'bg-primary/10']

const emptyFlags: Record<PermissionKey, boolean> = {
  canRead: false,
  canCaseCreate: false,
  canCaseEdit: false,
  canCaseDelete: false,
  canSectionCreate: false,
  canSectionEdit: false,
  canSectionDelete: false,
  canSuiteCreate: false,
  canSuiteEditMembership: false,
  canRunCreate: false,
  canRunRecordResult: false,
  canManageProject: false,
  canRunDelete: false,
  canProjectDelete: false,
}

// Used by the create form, where there's only one role in play — a single
// grouped-by-resource checkbox layout is all that's needed.
function PermissionSections({
  ariaPrefix,
  values,
  onToggle,
}: {
  ariaPrefix: string
  values: Record<PermissionKey, boolean>
  onToggle: (key: PermissionKey) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_SECTIONS.map((section, i) => (
        <div key={section.heading} className={`rounded-lg ${SECTION_TINTS[i % SECTION_TINTS.length]} p-2.5`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            {section.icon}
            {section.heading}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {section.items.map((item) => (
              <label key={item.key} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  aria-label={`${ariaPrefix} — ${item.fullLabel}`}
                  checked={values[item.key]}
                  onChange={() => onToggle(item.key)}
                />
                {item.shortLabel}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Roles are fully custom and instance-wide (add-project-rbac design.md D10):
// the Tenant Admin creates/renames/deletes roles and toggles their ten
// permission flags freely. A user's effective permissions on a project are
// the union of every role granted to them — there is no fixed ranking to
// enforce here. `rank` still exists on the API/domain model but isn't a
// user-facing concept: the UI always displays roles alphabetically and
// never asks the admin to set it, so newly created roles are sent without
// one (the field is optional server-side).
export default function RolesPage() {
  const { user: me } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [name, setName] = useState('')
  const [flags, setFlags] = useState(emptyFlags)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [deletePreview, setDeletePreview] = useState<{ directUserCount: number; teamCount: number; projectCount: number }>()

  async function load() {
    const { data } = await api.GET('/api/v1/roles')
    if (data) setRoles(data as Role[])
  }

  useEffect(() => {
    if (me?.isTenantAdmin) void load()
  }, [me])

  if (!me?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">Not authorized — admin only.</p>
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api.POST('/api/v1/roles', { body: { name, ...flags } })
    setName('')
    setFlags(emptyFlags)
    setCreateFormOpen(false)
    await load()
  }

  const sortedRoles = [...roles].sort((a, b) => a.name.localeCompare(b.name))

  async function toggleFlag(role: Role, key: PermissionKey) {
    const {
      canRead, canCaseCreate, canCaseEdit, canCaseDelete, canSectionCreate, canSectionEdit, canSectionDelete,
      canSuiteCreate, canSuiteEditMembership, canRunCreate, canRunRecordResult, canManageProject,
      canRunDelete, canProjectDelete,
      name, rank,
    } = role
    await api.PATCH('/api/v1/roles/{roleId}', {
      params: { path: { roleId: role.id } },
      body: {
        name, rank, canRead, canCaseCreate, canCaseEdit, canCaseDelete, canSectionCreate, canSectionEdit, canSectionDelete,
        canSuiteCreate, canSuiteEditMembership, canRunCreate, canRunRecordResult, canManageProject,
        canRunDelete, canProjectDelete,
        [key]: !role[key],
      },
    })
    await load()
  }

  async function openDeleteDialog(role: Role) {
    setDeleteTarget(role)
    setDeletePreview(undefined)
    const { data } = await api.GET('/api/v1/roles/{roleId}/deletion-preview', { params: { path: { roleId: role.id } } })
    if (data) setDeletePreview(data)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await api.DELETE('/api/v1/roles/{roleId}', { params: { path: { roleId: deleteTarget.id } } })
    setDeleteTarget(null)
    await load()
  }

  async function handleResetToDefaults() {
    await api.POST('/api/v1/roles/reset', {})
    setResetDialogOpen(false)
    await load()
  }

  return (
    <AdminShell>
      {createFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">New role</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="role-name">Role name</Label>
                <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Reviewer" />
              </div>
              <PermissionSections
                ariaPrefix="New role"
                values={flags}
                onToggle={(key) => setFlags((f) => ({ ...f, [key]: !f[key] }))}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create role</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-xl">Roles</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateFormOpen((open) => !open)}>
            + New role
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setResetDialogOpen(true)}>
            Reset to defaults
          </Button>
        </div>
      </div>
      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No roles yet.</p>
      ) : (
        <ul className="space-y-3">
          {sortedRoles.map((r) => (
            <li key={r.id} className="overflow-hidden rounded-lg border">
              {/* The color lives on the name itself (a small pill), not
                  a full-width fill — a filled band per row reads fine
                  once, but stacked across several roles it's a wall of
                  green with nothing else on the page to break it up.
                  The pill still outweighs the lighter section tints
                  below it without covering the whole row. */}
              <div className="flex items-center justify-between gap-4 border-b px-3 py-2">
                <span className="min-w-0 truncate rounded-md bg-primary/15 px-2 py-0.5 text-base font-semibold text-primary">
                  {r.name}
                </span>
                {/* Deleting a role cascades through every project/team
                    assignment of it (FK ON DELETE CASCADE) — irreversible
                    and far-reaching, so it's deliberately not a
                    dismissible-looking control: a trash icon gated behind
                    a confirmation dialog naming the role, not a single
                    click. */}
                <button
                  type="button"
                  aria-label={`Delete ${r.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void openDeleteDialog(r)}
                >
                  <Trash2Icon className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="p-3">
                <PermissionSections ariaPrefix={r.name} values={r} onToggle={(key) => void toggleFlag(r, key)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
          <DialogDescription>
            Currently assigned to{' '}
            {deletePreview === undefined ? (
              <Loader2Icon className="inline size-3 animate-spin align-[-2px]" aria-hidden="true" />
            ) : (
              <>
                {deletePreview.directUserCount} user{deletePreview.directUserCount === 1 ? '' : 's'} and{' '}
                {deletePreview.teamCount} team{deletePreview.teamCount === 1 ? '' : 's'}, across{' '}
                {deletePreview.projectCount} project{deletePreview.projectCount === 1 ? '' : 's'}
              </>
            )}
            . Deleting it removes those assignments too, not just the role itself. This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deletePreview === undefined} onClick={() => void handleDelete()}>
              Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Reset to defaults?</DialogTitle>
          <DialogDescription>
            This restores <strong>Tester</strong>, <strong>Contributor</strong>, and{' '}
            <strong>Project Admin</strong> to their original permission flags, discarding any changes you've
            made to them. Every other role, and every project or team's role assignments, is left untouched.
            This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleResetToDefaults()}>
              Reset to defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
