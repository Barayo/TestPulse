import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SuiteCaseGrid, type SuiteCaseGridCase } from '@/components/SuiteCaseGrid'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { PropertyRow } from '@/components/PropertyRow'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Requirement = components['schemas']['Requirement']
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

export default function RequirementDetailPage() {
  const { t } = useTranslation()
  const { projectKey, requirementKey } = useParams<{ projectKey: string; requirementKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)

  const [project, setProject] = useState<Project>()
  const [requirement, setRequirement] = useState<Requirement>()
  const [cases, setCases] = useState<TestCase[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [notFound, setNotFound] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [baseline, setBaseline] = useState<Set<string>>(new Set())
  const [isEditingCases, setIsEditingCases] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editExternalRef, setEditExternalRef] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!projectKey || !requirementKey) return
    setNotFound(false)
    const [{ data: p }, c, f, { data: req }] = await Promise.all([
      api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
      api.GET('/api/v1/requirements/{requirementKey}', { params: { path: { requirementKey } } }),
    ])
    if (!p || !req) {
      setNotFound(true)
      return
    }
    setProject(p)
    setCases(c.items)
    setFolders(f.items)
    setRequirement(req)
  }, [projectKey, requirementKey])

  useEffect(() => {
    void load()
  }, [load])

  const gridCases = cases.map(toGridCase)

  // A requirement's caseIds are the case's db id; the grid keys everything
  // by case key — mirrors SuiteDetailPage's identical id-to-key mapping.
  useEffect(() => {
    if (!requirement) return
    const asKeys = new Set(requirement.caseIds.map((id) => cases.find((c) => c.id === id)?.key ?? id))
    setSelected(asKeys)
    setBaseline(asKeys)
    setIsEditingCases(false)
  }, [requirement, cases])

  function toggle(caseKey: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
  }

  function toggleRange(caseKeys: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of caseKeys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  function exitEditingCases() {
    setSelected(baseline)
    setIsEditingCases(false)
  }

  async function handleSaveCases() {
    if (!requirementKey) return
    const added = Array.from(selected).filter((id) => !baseline.has(id))
    const removed = Array.from(baseline).filter((id) => !selected.has(id))
    await Promise.all([
      ...added.map((caseKey) =>
        api.PUT('/api/v1/requirements/{requirementKey}/cases/{caseKey}', { params: { path: { requirementKey, caseKey } } }),
      ),
      ...removed.map((caseKey) =>
        api.DELETE('/api/v1/requirements/{requirementKey}/cases/{caseKey}', { params: { path: { requirementKey, caseKey } } }),
      ),
    ])
    await load()
  }

  function openEdit() {
    if (!requirement) return
    setEditName(requirement.name)
    setEditDescription(requirement.description)
    setEditExternalRef(requirement.externalRef)
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!requirementKey || !editName.trim()) return
    await api.PUT('/api/v1/requirements/{requirementKey}', {
      params: { path: { requirementKey } },
      body: { name: editName.trim(), description: editDescription.trim(), externalRef: editExternalRef.trim() },
    })
    setEditing(false)
    await load()
  }

  async function handleDelete() {
    if (!requirementKey || !projectKey) return
    await api.DELETE('/api/v1/requirements/{requirementKey}', { params: { path: { requirementKey } } })
    setDeleting(false)
    navigate(`/projects/${projectKey}/requirements`)
  }

  if (!projectKey || !requirementKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('RequirementDetailPage.notFoundPrefix')}{' '}
        <a href={`/projects/${projectKey}/requirements`} className="underline">
          {t('RequirementDetailPage.requirementsLinkText')}
        </a>
        .
      </p>
    )
  }
  if (!project || !requirement) return null

  const canManage = Boolean(permissions?.manageProject)

  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb(
    [
      { label: t('RequirementDetailPage.projectsBreadcrumb'), href: '/' },
      { label: project.name, href: `/projects/${projectKey}` },
      { label: t('RequirementDetailPage.requirementsBreadcrumb'), href: `/projects/${projectKey}/requirements` },
      { label: requirement.name },
    ],
    requirement.name,
  )

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <h1 className="tp-heading text-2xl">{requirement.name}</h1>
        {canManage && !isEditingCases && (
          <Button type="button" variant="outline" onClick={openEdit}>
            {t('RequirementDetailPage.editButton')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="tp-heading text-lg">{t('RequirementDetailPage.linkedCasesHeading')}</CardTitle>
            {canManage && !isEditingCases && (
              <Button type="button" variant="outline" onClick={() => setIsEditingCases(true)}>
                {t('RequirementDetailPage.editCasesButton')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {requirement.description && (
              <div className="mb-4 space-y-1">
                <p className="tp-label">{t('RequirementDetailPage.descriptionLabel')}</p>
                <p className="text-sm text-muted-foreground">{requirement.description}</p>
              </div>
            )}
            {isEditingCases ? (
              <SuiteCaseGrid
                cases={gridCases}
                folders={folders}
                selected={selected}
                onToggle={toggle}
                onToggleRange={toggleRange}
                commitLabel={t('RequirementDetailPage.saveCommitLabel')}
                commitDisabled={selected.size === baseline.size && Array.from(selected).every((id) => baseline.has(id))}
                onCommit={() => void handleSaveCases()}
                onExit={exitEditingCases}
              />
            ) : requirement.caseIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('RequirementDetailPage.noCasesLinkedMessage')}</p>
            ) : (
              <ul aria-label={t('RequirementDetailPage.linkedCasesAriaLabel')} className="divide-y">
                {gridCases
                  .filter((c) => selected.has(c.id))
                  .map((c) => (
                    <li key={c.id} className="py-2 text-sm">
                      <Link
                        to={`/projects/${projectKey}/cases/${c.id}`}
                        className="flex items-center justify-between gap-3 hover:underline"
                      >
                        <span className="truncate">{c.title}</span>
                        <span className="tp-label shrink-0">{c.id}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5">
          <CaseSidebarSection title={t('RequirementDetailPage.propertiesSectionTitle')}>
            <PropertyRow label={t('RequirementDetailPage.keyPropertyLabel')} value={requirement.key} />
            <PropertyRow
              label={t('RequirementDetailPage.externalRefLabel')}
              value={requirement.externalRef || t('RequirementDetailPage.emptyValuePlaceholder')}
            />
            <PropertyRow label={t('RequirementDetailPage.createdPropertyLabel')} value={new Date(requirement.createdAt).toLocaleDateString()} />
          </CaseSidebarSection>

          {canManage && (
            <CaseSidebarSection title={t('RequirementDetailPage.actionsSectionTitle')}>
              <div className="flex flex-col gap-1.5">
                <Button type="button" variant="outline" className="justify-start" onClick={openEdit}>
                  {t('RequirementDetailPage.editRequirementButton')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="justify-start"
                  disabled={requirement.caseIds.length > 0}
                  title={
                    requirement.caseIds.length > 0
                      ? t('RequirementDetailPage.deleteBlockedTitle', {
                          count: requirement.caseIds.length,
                          plural: requirement.caseIds.length === 1 ? '' : 's',
                        })
                      : undefined
                  }
                  onClick={() => setDeleting(true)}
                >
                  {t('RequirementDetailPage.deleteRequirementButton')}
                </Button>
              </div>
            </CaseSidebarSection>
          )}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('RequirementDetailPage.editRequirementDialogTitle')}</DialogTitle>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-requirement-name">{t('RequirementDetailPage.nameLabel')}</Label>
              <Input id="edit-requirement-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-requirement-description">{t('RequirementDetailPage.descriptionLabel')}</Label>
              <Textarea id="edit-requirement-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-requirement-external-ref">{t('RequirementDetailPage.externalRefLabel')}</Label>
              <Input id="edit-requirement-external-ref" value={editExternalRef} onChange={(e) => setEditExternalRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t('RequirementDetailPage.cancelButton')}
            </Button>
            <Button disabled={!editName.trim()} onClick={() => void handleSaveEdit()}>
              {t('RequirementDetailPage.saveButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('RequirementDetailPage.deleteRequirementDialogTitle')}</DialogTitle>
          <DialogDescription>{t('RequirementDetailPage.deleteRequirementConfirm', { name: requirement.name })}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              {t('RequirementDetailPage.cancelButton')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              {t('RequirementDetailPage.confirmDeleteButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
