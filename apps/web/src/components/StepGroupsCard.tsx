import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRightIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { CaseStepsList } from '@/components/CaseStepsList'
import type { components } from '@testpulse/shared/api'

type StepGroup = components['schemas']['StepGroup']
type Step = components['schemas']['Step']

function GroupRow({ group, onChanged }: { group: StepGroup; onChanged: () => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(group.name)
  const [steps, setSteps] = useState<Step[]>(group.steps)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  async function save(nextName: string, nextSteps: Step[]) {
    const { error: apiError, response } = await api.PUT('/api/v1/step-groups/{groupId}', {
      params: { path: { groupId: group.id } },
      body: { name: nextName, steps: nextSteps },
    })
    if (!response.ok) {
      setError((apiError as { error?: string })?.error ?? t('StepGroupsCard.saveFailed'))
      return false
    }
    setError(undefined)
    onChanged()
    return true
  }

  async function submitRename() {
    setRenaming(false)
    if (!renameValue.trim() || renameValue === group.name) {
      setRenameValue(group.name)
      return
    }
    await save(renameValue.trim(), steps)
  }

  function cancelStepsEdit() {
    setSteps(group.steps)
    setError(undefined)
  }

  async function saveStepsEdit() {
    setSaving(true)
    await save(group.name, steps)
    setSaving(false)
  }

  async function confirmDelete() {
    await api.DELETE('/api/v1/step-groups/{groupId}', { params: { path: { groupId: group.id } } })
    setDeleteOpen(false)
    onChanged()
  }

  return (
    <li className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-label={expanded ? t('StepGroupsCard.collapseGroup', { name: group.name }) : t('StepGroupsCard.expandGroup', { name: group.name })}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((e) => !e)}
        >
          <ChevronRightIcon className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void submitRename()}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') void submitRename()
              if (e.key === 'Escape') {
                setRenameValue(group.name)
                setRenaming(false)
              }
            }}
            className="h-7 max-w-64"
          />
        ) : (
          <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => setExpanded((e) => !e)}>
            {group.name}
          </button>
        )}
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {t('StepGroupsCard.stepsCount', { count: steps.length, suffix: steps.length === 1 ? '' : 's' })}
        </span>
        <button
          type="button"
          aria-label={t('StepGroupsCard.renameGroup', { name: group.name })}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setRenaming(true)}
        >
          <PencilIcon className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t('StepGroupsCard.deleteGroup', { name: group.name })}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t bg-muted/30 p-3">
          <CaseStepsList steps={steps} onChange={setSteps} bare />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelStepsEdit}>
              {t('StepGroupsCard.cancel')}
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void saveStepsEdit()}>
              {t('StepGroupsCard.saveChanges')}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('StepGroupsCard.deleteGroupQuestion', { name: group.name })}</DialogTitle>
          <DialogDescription>
            {t('StepGroupsCard.deleteGroupDescription')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('StepGroupsCard.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              {t('StepGroupsCard.deleteGroupButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

// Project-scoped shared step groups (add-reusable-steps) — mirrors
// CustomFieldsCard's list/create/delete shape. No reorder: StepGroup has
// no order field, unlike CustomField. Lives on ProjectSettingsPage, which
// already gates the whole page on manageProject, so this card needs no
// permission check of its own.
export function StepGroupsCard({ projectKey }: { projectKey: string }) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<StepGroup[]>([])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSteps, setNewSteps] = useState<Step[]>([{ action: '', expected: '' }])
  const [createError, setCreateError] = useState<string>()

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/v1/projects/{projectKey}/step-groups', { params: { path: { projectKey } } })
    setGroups(data ?? [])
    setLoaded(true)
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  const hasStep = newSteps.some((s) => s.action?.trim())

  function cancelCreate() {
    setCreating(false)
    setNewName('')
    setNewSteps([{ action: '', expected: '' }])
    setCreateError(undefined)
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !hasStep) return
    const { error: apiError, response } = await api.POST('/api/v1/projects/{projectKey}/step-groups', {
      params: { path: { projectKey } },
      body: { name: newName.trim(), steps: newSteps.filter((s) => s.action?.trim()) },
    })
    if (!response.ok) {
      setCreateError((apiError as { error?: string })?.error ?? t('StepGroupsCard.createFailed'))
      return
    }
    cancelCreate()
    await load()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('StepGroupsCard.title')}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => (creating ? cancelCreate() : setCreating(true))}>
          {t('StepGroupsCard.newGroup')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {creating && (
          <form onSubmit={(e) => void createGroup(e)} className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="new-group-name">{t('StepGroupsCard.groupNameLabel')}</Label>
              <Input
                id="new-group-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('StepGroupsCard.groupNamePlaceholder')}
              />
            </div>
            <CaseStepsList steps={newSteps} onChange={setNewSteps} bare />
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={cancelCreate}>
                {t('StepGroupsCard.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={!newName.trim() || !hasStep}>
                {t('StepGroupsCard.createGroup')}
              </Button>
            </div>
          </form>
        )}

        {loaded && groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('StepGroupsCard.noGroupsYet')}</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} onChanged={() => void load()} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
