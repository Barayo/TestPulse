import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVerticalIcon, Loader2Icon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { RowActionMenu } from '@/components/RowActionMenu'
import type { components } from '@testpulse/shared/api'

type CustomField = components['schemas']['CustomField']
type CustomFieldOption = components['schemas']['CustomFieldOption']
type CustomFieldType = components['schemas']['CustomFieldType']

// Reorders arr by moving the element at `index` one step in `direction`,
// producing the id order both the drag interaction and this fallback must
// agree on (design.md D3/D8, add-case-custom-fields) — a pure array move,
// no mutation.
function moveAdjacent<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= arr.length) return arr
  const next = arr.slice()
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function OptionsEditor({ field, onChanged }: { field: CustomField; onChanged: () => void }) {
  const { t } = useTranslation()
  const [newOption, setNewOption] = useState('')
  const options = field.options ?? []

  async function addOption(e: FormEvent) {
    e.preventDefault()
    if (!newOption.trim()) return
    await api.POST('/api/v1/custom-fields/{fieldId}/options', {
      params: { path: { fieldId: field.id } },
      body: { value: newOption.trim() },
    })
    setNewOption('')
    onChanged()
  }

  async function removeOption(optionID: string) {
    await api.DELETE('/api/v1/custom-fields/{fieldId}/options/{optionId}', {
      params: { path: { fieldId: field.id, optionId: optionID } },
    })
    onChanged()
  }

  async function reorderTo(nextOptions: CustomFieldOption[]) {
    await api.PUT('/api/v1/custom-fields/{fieldId}/options/order', {
      params: { path: { fieldId: field.id } },
      body: { optionIds: nextOptions.map((o) => o.id) },
    })
    onChanged()
  }

  function moveOption(index: number, direction: -1 | 1) {
    void reorderTo(moveAdjacent(options, index, direction))
  }

  return (
    <div className="space-y-2 border-t px-3 py-2">
      <ul className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <li
            key={o.id}
            data-option-id={o.id}
            draggable
            onDragStart={(e: DragEvent) => {
              if (!(e.target as HTMLElement).closest('[data-drag-handle]')) {
                e.preventDefault()
                return
              }
              // Without this, the event bubbles into the field row's own
              // draggable wrapper (an option chip is nested inside a
              // draggable field row), whose onDragStart also matches the
              // handle check and overwrites dataTransfer with the field's
              // id instead of this option's — found via a real failing
              // drag test, not by inspection.
              e.stopPropagation()
              e.dataTransfer.setData('text/plain', o.id)
            }}
            onDragOver={(e: DragEvent) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              e.stopPropagation()
              const fromID = e.dataTransfer.getData('text/plain')
              const from = options.findIndex((opt) => opt.id === fromID)
              if (from === -1 || from === i) return
              const next = options.slice()
              const [moved] = next.splice(from, 1)
              next.splice(i, 0, moved)
              void reorderTo(next)
            }}
            className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-1.5 text-xs"
          >
            <span data-drag-handle className="cursor-grab text-muted-foreground active:cursor-grabbing">
              <GripVerticalIcon className="size-3" aria-hidden="true" />
            </span>
            <span>{o.value}</span>
            <RowActionMenu
              label={t('CustomFieldsCard.actionsForOption', { value: o.value })}
              items={[
                { label: t('CustomFieldsCard.moveUp'), onSelect: () => moveOption(i, -1), disabled: i === 0 },
                { label: t('CustomFieldsCard.moveDown'), onSelect: () => moveOption(i, 1), disabled: i === options.length - 1 },
              ]}
            />
            <button
              type="button"
              aria-label={t('CustomFieldsCard.removeOption', { value: o.value })}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void removeOption(o.id)}
            >
              <XIcon className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void addOption(e)}>
        <Input
          placeholder={t('CustomFieldsCard.addOptionPlaceholder')}
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          className="h-7 max-w-48 text-xs"
        />
      </form>
    </div>
  )
}

function FieldRow({
  field,
  index,
  total,
  onChanged,
  onMove,
}: {
  field: CustomField
  index: number
  total: number
  onChanged: () => void
  onMove: (index: number, direction: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(field.name)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePreview, setDeletePreview] = useState<{ caseCount: number }>()

  async function submitRename() {
    setRenaming(false)
    if (!renameValue.trim() || renameValue === field.name) {
      setRenameValue(field.name)
      return
    }
    await api.PATCH('/api/v1/custom-fields/{fieldId}', {
      params: { path: { fieldId: field.id } },
      body: { name: renameValue.trim() },
    })
    onChanged()
  }

  async function openDelete() {
    setDeleteOpen(true)
    setDeletePreview(undefined)
    const { data } = await api.GET('/api/v1/custom-fields/{fieldId}/deletion-preview', {
      params: { path: { fieldId: field.id } },
    })
    if (data) setDeletePreview(data)
  }

  async function confirmDelete() {
    await api.DELETE('/api/v1/custom-fields/{fieldId}', { params: { path: { fieldId: field.id } } })
    setDeleteOpen(false)
    onChanged()
  }

  return (
    <li className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span data-drag-handle className="cursor-grab text-muted-foreground active:cursor-grabbing">
          <GripVerticalIcon className="size-4" aria-hidden="true" />
        </span>
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void submitRename()}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') void submitRename()
              if (e.key === 'Escape') {
                setRenameValue(field.name)
                setRenaming(false)
              }
            }}
            className="h-7 max-w-64"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium">{field.name}</span>
        )}
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{field.fieldType}</span>
        <button
          type="button"
          aria-label={t('CustomFieldsCard.renameField', { name: field.name })}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setRenaming(true)}
        >
          <PencilIcon className="size-4" aria-hidden="true" />
        </button>
        <RowActionMenu
          label={t('CustomFieldsCard.actionsForField', { name: field.name })}
          items={[
            { label: t('CustomFieldsCard.moveUp'), onSelect: () => onMove(index, -1), disabled: index === 0 },
            { label: t('CustomFieldsCard.moveDown'), onSelect: () => onMove(index, 1), disabled: index === total - 1 },
          ]}
        />
        <button
          type="button"
          aria-label={t('CustomFieldsCard.deleteField', { name: field.name })}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => void openDelete()}
        >
          <Trash2Icon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {field.fieldType === 'select' && <OptionsEditor field={field} onChanged={onChanged} />}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('CustomFieldsCard.deleteFieldQuestion', { name: field.name })}</DialogTitle>
          <DialogDescription>
            {deletePreview === undefined ? (
              <Loader2Icon className="inline size-3 animate-spin align-[-2px]" aria-hidden="true" />
            ) : (
              t('CustomFieldsCard.deletePreviewText', {
                count: deletePreview.caseCount,
                suffix: deletePreview.caseCount === 1 ? '' : 's',
                hasHave: deletePreview.caseCount === 1 ? t('CustomFieldsCard.has') : t('CustomFieldsCard.have'),
              })
            )}{' '}
            {t('CustomFieldsCard.cannotBeUndone')}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('CustomFieldsCard.cancel')}
            </Button>
            <Button variant="destructive" disabled={deletePreview === undefined} onClick={() => void confirmDelete()}>
              {t('CustomFieldsCard.deleteFieldButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

// Project-scoped custom field definitions (add-case-custom-fields) — a
// Project Admin's own management UI, mirroring RolesPage.tsx's list/
// create/delete shape. Lives on ProjectSettingsPage, which already gates
// the whole page on manageProject, so this card needs no permission
// check of its own.
export function CustomFieldsCard({ projectKey }: { projectKey: string }) {
  const { t } = useTranslation()
  const [fields, setFields] = useState<CustomField[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CustomFieldType>('text')
  const draggingFieldID = useRef<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/v1/projects/{projectKey}/custom-fields', { params: { path: { projectKey } } })
    setFields(data ?? [])
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  async function createField(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    await api.POST('/api/v1/projects/{projectKey}/custom-fields', {
      params: { path: { projectKey } },
      body: { name: newName.trim(), fieldType: newType },
    })
    setNewName('')
    setNewType('text')
    setCreating(false)
    await load()
  }

  async function reorderTo(nextFields: CustomField[]) {
    setFields(nextFields)
    await api.PUT('/api/v1/projects/{projectKey}/custom-fields/order', {
      params: { path: { projectKey } },
      body: { fieldIds: nextFields.map((f) => f.id) },
    })
    await load()
  }

  function moveField(index: number, direction: -1 | 1) {
    void reorderTo(moveAdjacent(fields, index, direction))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('CustomFieldsCard.title')}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setCreating((c) => !c)}>
          {t('CustomFieldsCard.newField')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {creating && (
          <form onSubmit={(e) => void createField(e)} className="flex items-end gap-2 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="new-field-name">{t('CustomFieldsCard.fieldNameLabel')}</Label>
              <Input id="new-field-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('CustomFieldsCard.fieldNamePlaceholder')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-field-type">{t('CustomFieldsCard.typeLabel')}</Label>
              <select
                id="new-field-type"
                aria-label={t('CustomFieldsCard.fieldTypeAriaLabel')}
                value={newType}
                onChange={(e) => setNewType(e.target.value as CustomFieldType)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="text">{t('CustomFieldsCard.typeText')}</option>
                <option value="select">{t('CustomFieldsCard.typeSelect')}</option>
              </select>
            </div>
            <Button type="submit" size="sm">
              {t('CustomFieldsCard.createField')}
            </Button>
          </form>
        )}

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('CustomFieldsCard.noFieldsYet')}</p>
        ) : (
          <ul
            className="space-y-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const fromID = draggingFieldID.current
              draggingFieldID.current = null
              if (!fromID) return
              const from = fields.findIndex((f) => f.id === fromID)
              if (from === -1) return
              const target = (e.target as HTMLElement).closest('[data-field-id]') as HTMLElement | null
              const to = target ? fields.findIndex((f) => f.id === target.dataset.fieldId) : -1
              if (to === -1 || to === from) return
              const next = fields.slice()
              const [moved] = next.splice(from, 1)
              next.splice(to, 0, moved)
              void reorderTo(next)
            }}
          >
            {fields.map((f, i) => (
              <div
                key={f.id}
                data-field-id={f.id}
                draggable
                onDragStart={(e: DragEvent) => {
                  if (!(e.target as HTMLElement).closest('[data-drag-handle]')) {
                    e.preventDefault()
                    return
                  }
                  draggingFieldID.current = f.id
                  e.dataTransfer.setData('text/plain', f.id)
                }}
              >
                <FieldRow field={f} index={i} total={fields.length} onChanged={() => void load()} onMove={moveField} />
              </div>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
