import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ListChecksIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type Requirement = components['schemas']['Requirement']
type Project = components['schemas']['Project']

function RequirementCard({ requirement, projectKey }: { requirement: Requirement; projectKey: string }) {
  const { t } = useTranslation()
  return (
    <li className="relative">
      <Link
        to={`/projects/${projectKey}/requirements/${requirement.key}`}
        className="relative flex flex-col gap-2.5 overflow-hidden rounded-xl border bg-card p-4 pl-5 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-md"
      >
        <span className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ListChecksIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate font-medium">{requirement.name}</span>
        </span>
        <span className="tp-label">{requirement.key}</span>
        {requirement.description && <p className="line-clamp-2 text-sm text-muted-foreground">{requirement.description}</p>}
        <span className="text-xs text-muted-foreground">
          {t('RequirementsPage.caseCountLinked', {
            count: requirement.caseIds.length,
            plural: requirement.caseIds.length === 1 ? '' : 's',
          })}
        </span>
      </Link>
    </li>
  )
}

export default function RequirementsPage() {
  const { t } = useTranslation()
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const [project, setProject] = useState<Project>()
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [externalRef, setExternalRef] = useState('')

  const load = useCallback(async () => {
    if (!projectKey) return
    const { data: p } = await api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
    const { data: list } = await api.GET('/api/v1/projects/{projectKey}/requirements', { params: { path: { projectKey } } })
    setProject(p)
    setRequirements(list ?? [])
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    if (!projectKey || !name.trim()) return
    const { data: created } = await api.POST('/api/v1/projects/{projectKey}/requirements', {
      params: { path: { projectKey } },
      body: { name: name.trim(), description: description.trim(), externalRef: externalRef.trim() },
    })
    setCreating(false)
    setName('')
    setDescription('')
    setExternalRef('')
    if (created) navigate(`/projects/${projectKey}/requirements/${created.key}`)
  }

  if (!projectKey) return null

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: t('RequirementsPage.projectsBreadcrumb'), href: '/' },
            { label: project?.name ?? '', href: `/projects/${projectKey}` },
            { label: t('RequirementsPage.requirementsBreadcrumb') },
          ],
          t('RequirementsPage.requirementsBreadcrumb'),
        )}
      />

      <div className="flex items-center justify-between">
        <h1 className="tp-heading text-2xl">{t('RequirementsPage.title')}</h1>
        {permissions?.manageProject && (
          <Button type="button" onClick={() => setCreating(true)}>
            {t('RequirementsPage.newRequirementButton')}
          </Button>
        )}
      </div>

      {requirements.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="mb-1 text-sm font-medium">{t('RequirementsPage.emptyTitle')}</p>
          <p className="mb-4 text-sm text-muted-foreground">{t('RequirementsPage.emptyDescription')}</p>
          {permissions?.manageProject && (
            <Button type="button" onClick={() => setCreating(true)}>
              {t('RequirementsPage.newRequirementButton')}
            </Button>
          )}
        </div>
      ) : (
        <ul
          aria-label={t('RequirementsPage.requirementsListAriaLabel')}
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}
        >
          {requirements.map((r) => (
            <RequirementCard key={r.id} requirement={r} projectKey={projectKey} />
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('RequirementsPage.newRequirementDialogTitle')}</DialogTitle>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="requirement-name">{t('RequirementsPage.nameLabel')}</Label>
              <Input
                id="requirement-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('RequirementsPage.namePlaceholder')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="requirement-description">{t('RequirementsPage.descriptionLabel')}</Label>
              <Textarea
                id="requirement-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('RequirementsPage.descriptionPlaceholder')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="requirement-external-ref">{t('RequirementsPage.externalRefLabel')}</Label>
              <Input
                id="requirement-external-ref"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder={t('RequirementsPage.externalRefPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {t('RequirementsPage.cancelButton')}
            </Button>
            <Button disabled={!name.trim()} onClick={() => void handleCreate()}>
              {t('RequirementsPage.createButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
