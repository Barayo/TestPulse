import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ListChecksIcon, Trash2Icon, Link2Icon, TriangleAlertIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { InsertStepGroupDialog } from '@/components/InsertStepGroupDialog'
import { ExtractStepGroupDialog } from '@/components/ExtractStepGroupDialog'
import type { components } from '@testpulse/shared/api'

type Step = components['schemas']['Step']
type StepGroup = components['schemas']['StepGroup']

type GroupInfo = { status: 'loading' } | { status: 'ok'; group: StepGroup } | { status: 'deleted' }

type Block =
  | { kind: 'plain'; index: number; step: Step }
  | { kind: 'group'; startIndex: number; endIndex: number; groupId: string; groupKey: string }

// Groups a maximal contiguous run of steps sharing one groupRef.groupId
// into a single "block" (add-reusable-steps design.md: a group reference
// is a block, not N independently-editable rows) — whether that run is
// one entry (freshly inserted this session, not yet saved) or several
// (loaded from an already-resolved, saved case) is irrelevant to display.
function toBlocks(steps: Step[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < steps.length) {
    const ref = steps[i].groupRef
    if (ref) {
      let j = i + 1
      while (j < steps.length && steps[j].groupRef?.groupKey === ref.groupKey) j++
      blocks.push({ kind: 'group', startIndex: i, endIndex: j - 1, groupId: ref.groupId ?? '', groupKey: ref.groupKey })
      i = j
    } else {
      blocks.push({ kind: 'plain', index: i, step: steps[i] })
      i++
    }
  }
  return blocks
}

// expandGroup mirrors the server's own resolveStepGroupRefs (service.go)
// on the client, so a freshly inserted/refreshed block looks exactly like
// what a reload after save would show — the server re-derives this
// itself at save time regardless of what the client sends, so this is
// display-only, never trusted content.
function expandGroup(group: StepGroup): Step[] {
  return group.steps.map((s) => ({
    action: s.action,
    expected: s.expected,
    groupRef: { groupId: group.id, groupKey: group.key, snapshotUpdatedAt: group.updatedAt },
  }))
}

// Tints a {token} substring text-primary/bold when it names a real
// parameter column — never any {...}-shaped text, so an ordinary case's
// incidental literal braces are never mistakenly highlighted
// (add-parameterized-cases: the case's own unsubstituted template view).
function renderWithPlaceholders(text: string | undefined, columns: string[] | undefined): ReactNode {
  if (!text || !columns || columns.length === 0) return text
  const pattern = /\{([^{}]+)\}/g
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (!columns.includes(match[1])) continue
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(
      <span key={key++} className="text-primary font-bold">
        {match[0]}
      </span>,
    )
    lastIndex = match.index + match[0].length
  }
  if (parts.length === 0) return text
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function GroupBlockBody({ steps, startIndex }: { steps: Step[]; startIndex: number }) {
  const { t } = useTranslation()
  return (
    <ol className="space-y-3 border-t px-3 py-3">
      {steps.map((s, k) => {
        const i = startIndex + k
        return (
          <li key={i} className="flex gap-3">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="flex-1 space-y-2 pt-0.5">
              <p className="text-base font-medium leading-relaxed">{s.action}</p>
              {s.expected && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                  <p className="text-base leading-relaxed text-foreground">
                    <span className="tp-label mr-1.5 text-primary">{t('CaseStepsList.expectedLabel')}</span>
                    {s.expected}
                  </p>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function GroupBlock({
  block,
  stepsInBlock,
  info,
  stale,
  projectKey,
  onReplace,
  onDetach,
}: {
  block: Extract<Block, { kind: 'group' }>
  stepsInBlock: Step[]
  info: GroupInfo | undefined
  stale: boolean
  projectKey?: string
  onReplace: (steps: Step[]) => void
  onDetach: () => void
}) {
  const { t } = useTranslation()
  const range = block.startIndex === block.endIndex ? `${block.startIndex + 1}` : `${block.startIndex + 1}–${block.endIndex + 1}`
  const name = info?.status === 'ok' ? info.group.name : block.groupKey
  const deleted = info?.status === 'deleted'

  async function refresh() {
    const { data } = await api.GET('/api/v1/step-groups/{groupId}', { params: { path: { groupId: block.groupId } } })
    if (data) onReplace(expandGroup(data))
  }

  return (
    <li>
      <div className={`rounded-xl border bg-muted/40 ${deleted ? 'border-destructive/40' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span
            className="flex h-7 shrink-0 items-center justify-center rounded-full bg-primary/10 px-2 text-sm font-semibold text-primary"
            aria-hidden="true"
          >
            {range}
          </span>
          <Link2Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-medium">{name}</span>
          {info?.status === 'ok' && <span className="text-xs text-muted-foreground">{t('CaseStepsList.stepsCount', { count: info.group.steps.length })}</span>}
          {deleted && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              <TriangleAlertIcon className="size-3" aria-hidden="true" />
              {t('CaseStepsList.sourceGroupDeleted')}
            </span>
          )}
          {!deleted && stale && (
            <span className="inline-flex items-center gap-1 rounded-full border border-secondary/35 bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
              <TriangleAlertIcon className="size-3" aria-hidden="true" />
              {t('CaseStepsList.updateAvailable')}
            </span>
          )}
          <span className="flex-1" />
          <div className="flex items-center gap-3 text-xs font-semibold">
            {!deleted && stale && projectKey && (
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                {t('CaseStepsList.refresh')}
              </Button>
            )}
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onDetach}>
              {t('CaseStepsList.detach')}
            </button>
          </div>
        </div>
        {!deleted && stale && (
          <div className="flex items-start gap-2 border-t border-secondary/30 bg-secondary/10 p-2.5">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {t('CaseStepsList.staleGroupHint')}
            </p>
          </div>
        )}
        {deleted && (
          <div className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 p-2.5">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {t('CaseStepsList.deletedGroupHint')}
            </p>
          </div>
        )}
        <GroupBlockBody steps={stepsInBlock} startIndex={block.startIndex} />
      </div>
    </li>
  )
}

// Read-only steps rendering, shared by CaseDetailPage (the current
// version, editable elsewhere on that page) and RunItemDetailPage (a
// pinned, historical version — never editable). Deliberately takes no
// case-mutation callbacks; the optional emptyStateAction lets a caller
// offer its own CTA (or none, for a read-only context like a run item).
//
// Passing `onChange` switches this into an in-place editable variant —
// same Card/circle/expected-callout shell, but Textareas in place of
// static text (add-case-authoring-formats: editing should feel like the
// read view became editable, not like a different form appeared).
//
// Passing `projectKey` (editable mode only) enables the shared-step-group
// features (add-reusable-steps): "Insert shared group", "Extract as
// shared group", and staleness/refresh/detach on any groupRef-carrying
// steps already present. Without it, group-ref steps still render (as
// blocks with only a Detach action) but nothing new can be inserted or
// extracted — used by the Shared Steps admin card's own "bare" step
// editor, where a group's own steps can never reference another group.
//
// Passing `bare` skips the Card wrapper (CustomFieldsCard-style inline
// step editors, e.g. the Shared Steps admin card, already provide their
// own container).
export function CaseStepsList({
  steps,
  emptyStateAction,
  onChange,
  projectKey,
  bare,
  parameterColumns,
}: {
  steps: Step[] | undefined
  emptyStateAction?: ReactNode
  onChange?: (steps: Step[]) => void
  projectKey?: string
  bare?: boolean
  // Read mode only (add-parameterized-cases): the case's own parameter
  // column names, used to tint recognized {token} placeholders in the
  // unsubstituted template view. Omitted entirely for run-item execution
  // views, whose step text already arrived pre-substituted from the API.
  parameterColumns?: string[]
}) {
  const { t } = useTranslation()
  const editable = Boolean(onChange)
  const list = useMemo(() => steps ?? [], [steps])
  const blocks = useMemo(() => toBlocks(list), [list])
  const [groupInfo, setGroupInfo] = useState<Record<string, GroupInfo>>({})
  const [insertOpen, setInsertOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [extractOpen, setExtractOpen] = useState(false)

  const groupBlocks = blocks.filter((b): b is Extract<Block, { kind: 'group' }> => b.kind === 'group')
  const distinctGroupIdsSignal = [...new Set(groupBlocks.map((b) => b.groupId))].join(',')

  useEffect(() => {
    const ids = distinctGroupIdsSignal ? distinctGroupIdsSignal.split(',') : []
    if (ids.length === 0) return
    let cancelled = false
    for (const groupId of ids) {
      setGroupInfo((prev) => (prev[groupId] ? prev : { ...prev, [groupId]: { status: 'loading' } }))
      void api.GET('/api/v1/step-groups/{groupId}', { params: { path: { groupId } } }).then(({ data }) => {
        if (cancelled) return
        setGroupInfo((prev) => ({ ...prev, [groupId]: data ? { status: 'ok', group: data } : { status: 'deleted' } }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [distinctGroupIdsSignal])

  if (list.length === 0 && !editable) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <ListChecksIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 text-sm font-medium">{t('CaseStepsList.noStepsYet')}</p>
        <p className="mb-4 text-sm text-muted-foreground">{t('CaseStepsList.noStepsHint')}</p>
        {emptyStateAction}
      </div>
    )
  }

  function update(i: number, field: keyof Step, value: string) {
    onChange?.(list.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }
  function remove(i: number) {
    onChange?.(list.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange?.([...list, { action: '', expected: '' }])
  }
  function replaceRange(startIndex: number, endIndex: number, next: Step[]) {
    onChange?.([...list.slice(0, startIndex), ...next, ...list.slice(endIndex + 1)])
  }
  function detachBlock(block: Extract<Block, { kind: 'group' }>) {
    const detached = list.slice(block.startIndex, block.endIndex + 1).map((s) => ({ action: s.action, expected: s.expected }))
    replaceRange(block.startIndex, block.endIndex, detached)
  }
  function toggleSelect(index: number, shiftKey: boolean) {
    if (shiftKey && anchor !== null) {
      const [start, end] = anchor <= index ? [anchor, index] : [index, anchor]
      const spanned = blocks.filter((b) => b.kind === 'plain' && b.index >= start && b.index <= end) as Extract<Block, { kind: 'plain' }>[]
      const crossesGroup = end - start + 1 !== spanned.length
      if (!crossesGroup) {
        setSelected(new Set(spanned.map((b) => b.index)))
        setAnchor(index)
        return
      }
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
    setAnchor(index)
  }
  const lastBlock = blocks[blocks.length - 1]
  const trailingGroupKey = lastBlock?.kind === 'group' ? lastBlock.groupKey : undefined

  function onInsertGroup(group: StepGroup) {
    if (group.key === trailingGroupKey) return
    onChange?.([...list, ...expandGroup(group)])
    setInsertOpen(false)
  }

  const selectedIndices = [...selected].sort((a, b) => a - b)

  const content = (
    <>
      <ol className="list-none">
        {blocks.map((block) => {
          if (block.kind === 'plain') {
            const i = block.index
            const s = block.step
            const isSelectable = editable && Boolean(projectKey)
            const isSelected = selected.has(i)
            return (
              <li
                key={i}
                className={`flex gap-3 border-b px-(--card-spacing) py-4 last:border-b-0 ${isSelected ? 'bg-primary/5' : ''}`}
              >
                <span
                  data-testid={`step-number-${i}`}
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                  } ${isSelectable ? 'cursor-pointer' : ''}`}
                  aria-hidden="true"
                  onClick={isSelectable ? (e) => toggleSelect(i, e.shiftKey) : undefined}
                >
                  {i + 1}
                </span>
                <div className="flex-1 space-y-2 pt-0.5">
                  {editable ? (
                    <Textarea
                      aria-label={t('CaseStepsList.actionForStep', { index: i + 1 })}
                      value={s.action}
                      onChange={(e) => update(i, 'action', e.target.value)}
                      placeholder={t('CaseStepsList.actionPlaceholder')}
                      className="text-base font-medium leading-relaxed"
                    />
                  ) : (
                    <p className="text-base font-medium leading-relaxed">
                      {renderWithPlaceholders(s.action, parameterColumns)}
                    </p>
                  )}
                  {editable ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                      <span className="tp-label mb-1 block text-primary">{t('CaseStepsList.expectedLabel')}</span>
                      <Textarea
                        aria-label={t('CaseStepsList.expectedForStep', { index: i + 1 })}
                        value={s.expected ?? ''}
                        onChange={(e) => update(i, 'expected', e.target.value)}
                        placeholder={t('CaseStepsList.expectedPlaceholder')}
                        className="bg-transparent text-base leading-relaxed"
                      />
                    </div>
                  ) : (
                    s.expected && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                        <p className="text-base leading-relaxed text-foreground">
                          <span className="tp-label mr-1.5 text-primary">{t('CaseStepsList.expectedLabel')}</span>
                          {renderWithPlaceholders(s.expected, parameterColumns)}
                        </p>
                      </div>
                    )
                  )}
                </div>
                {editable && (
                  <button
                    type="button"
                    aria-label={t('CaseStepsList.removeStep', { index: i + 1 })}
                    className="shrink-0 self-start pt-1.5 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(i)}
                  >
                    <Trash2Icon className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          }

          const info = groupInfo[block.groupId]
          const stale = info?.status === 'ok' && list[block.startIndex].groupRef?.snapshotUpdatedAt !== info.group.updatedAt
          const stepsInBlock = list.slice(block.startIndex, block.endIndex + 1)

          if (!editable) {
            return (
              <li key={`g-${block.startIndex}`}>
                <div className="rounded-xl border bg-muted/40 p-3">
                  <div className="mb-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Link2Icon className="size-3.5 text-primary" aria-hidden="true" />
                    <span>
                      {t('CaseStepsList.fromSharedGroup')}{' '}
                      <a
                        className="font-semibold text-primary hover:underline"
                        href={projectKey ? `/projects/${projectKey}/settings` : '#'}
                      >
                        {info?.status === 'ok' ? info.group.name : block.groupKey}
                      </a>
                    </span>
                  </div>
                  <ol className="space-y-3">
                    {stepsInBlock.map((s, k) => {
                      const i = block.startIndex + k
                      return (
                        <li key={i} className="flex gap-3">
                          <span
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                            aria-hidden="true"
                          >
                            {i + 1}
                          </span>
                          <div className="flex-1 space-y-2 pt-0.5">
                            <p className="text-base font-medium leading-relaxed">{s.action}</p>
                            {s.expected && (
                              <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                                <p className="text-base leading-relaxed text-foreground">
                                  <span className="tp-label mr-1.5 text-primary">{t('CaseStepsList.expectedLabel')}</span>
                                  {s.expected}
                                </p>
                              </div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              </li>
            )
          }

          return (
            <GroupBlock
              key={`g-${block.startIndex}`}
              block={block}
              stepsInBlock={stepsInBlock}
              info={info}
              stale={stale}
              projectKey={projectKey}
              onReplace={(next) => replaceRange(block.startIndex, block.endIndex, next)}
              onDetach={() => detachBlock(block)}
            />
          )
        })}
      </ol>
      {editable && (
        <div className="flex items-center gap-4 px-(--card-spacing) py-3">
          {selected.size > 0 ? (
            <div className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
              <span className="text-sm font-semibold">
                {t('CaseStepsList.stepsSelected', { count: selected.size, suffix: selected.size === 1 ? '' : 's' })}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => setExtractOpen(true)}>
                  {t('CaseStepsList.extractAsSharedGroup')}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  {t('CaseStepsList.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={add}>
                {t('CaseStepsList.addStep')}
              </button>
              {projectKey && (
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => setInsertOpen(true)}
                >
                  {t('CaseStepsList.insertSharedGroup')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )

  return (
    <>
      {bare ? content : (
        <Card>
          <CardContent className="p-0">{content}</CardContent>
        </Card>
      )}
      {projectKey && (
        <InsertStepGroupDialog
          open={insertOpen}
          onOpenChange={setInsertOpen}
          projectKey={projectKey}
          onInsert={onInsertGroup}
          excludeGroupKey={trailingGroupKey}
        />
      )}
      {projectKey && (
        <ExtractStepGroupDialog
          open={extractOpen}
          onOpenChange={setExtractOpen}
          projectKey={projectKey}
          selectedSteps={selectedIndices.map((i) => list[i])}
          onExtracted={(group) => {
            const start = selectedIndices[0]
            const end = selectedIndices[selectedIndices.length - 1]
            replaceRange(start, end, expandGroup(group))
            setSelected(new Set())
            setExtractOpen(false)
          }}
        />
      )}
    </>
  )
}
