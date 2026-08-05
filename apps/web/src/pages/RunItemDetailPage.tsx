import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PaperclipIcon, UserPlusIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { avatarStyle, initialsFor } from '@/lib/avatar'
import { Avatar } from '@/components/Avatar'
import { AttachmentStrip } from '@/components/AttachmentStrip'
import { AttachmentField, type FailedUpload } from '@/components/AttachmentField'
import { Lightbox } from '@/components/Lightbox'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PropertyRow } from '@/components/PropertyRow'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { CaseStepsList } from '@/components/CaseStepsList'
import { StatusBadge } from '@/components/StatusBadge'
import { RunShortcutsHint, RunShortcutsOverlay, type ShortcutEntry } from '@/components/RunShortcuts'
import { AssignDialog, type AssigneePick } from '@/components/AssignDialog'
import { assignRunItems } from '@/lib/assignRunItems'
import { isEditableElementFocused } from '@/lib/keyboardShortcutGuard'
import { timeAgo } from '@/lib/timeAgo'
import type { components } from '@testpulse/shared/api'

type Run = components['schemas']['Run']
type RunItem = components['schemas']['RunItem']
type Verdict = components['schemas']['Verdict']
type Result = components['schemas']['Result']
type Project = components['schemas']['Project']
type Attachment = components['schemas']['Attachment']

function isValidDate(iso: string): boolean {
  return iso !== '' && !Number.isNaN(new Date(iso).getTime())
}

// Mirrors attachmentimage.MaxUploadBytes / the format allowlist on the
// server (add-run-item-screenshot-attachments design.md) — a client-side
// precheck is a convenience that avoids a round trip, not a security
// boundary; the server re-validates regardless.
const MAX_ATTACHMENT_UPLOAD_BYTES = 5 * 1024 * 1024
const ACCEPTED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function RunItemDetailPage() {
  const { runKey, caseKey } = useParams<{ runKey: string; caseKey: string }>()
  const navigate = useNavigate()

  const [run, setRun] = useState<Run>()
  const [project, setProject] = useState<Project>()
  const [item, setItem] = useState<RunItem>()
  const [items, setItems] = useState<RunItem[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [notFound, setNotFound] = useState(false)
  // Resolves a user-attributed history entry's *current* avatar (add-user-profile)
  // — actorRefId -> avatarKey, fetched once, the same client-side lookup
  // pattern PeoplePage already uses.
  const [userAvatars, setUserAvatars] = useState<Record<string, string | null | undefined>>({})

  const [actorOverride, setActorOverride] = useState('')
  const [showActorOverride, setShowActorOverride] = useState(false)
  const [comment, setComment] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [stagedAttachments, setStagedAttachments] = useState<Attachment[]>([])
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([])
  const [lastAttachError, setLastAttachError] = useState<{ filename: string; reason: string } | null>(null)
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const [stagedLightboxIndex, setStagedLightboxIndex] = useState<number | null>(null)
  const [historyLightbox, setHistoryLightbox] = useState<{ resultId: string; index: number } | null>(null)
  const [pendingAttachResultId, setPendingAttachResultId] = useState<string | null>(null)
  const [justAddedAttachmentId, setJustAddedAttachmentId] = useState<string | null>(null)
  const [showCommentAttachToast, setShowCommentAttachToast] = useState(false)
  const historyFileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!runKey || !caseKey) return
    setNotFound(false)
    const [{ data: r }, { data: runItems }] = await Promise.all([
      api.GET('/api/v1/runs/{runKey}', { params: { path: { runKey } } }),
      api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey } } }),
    ])
    const match = (runItems ?? []).find((it) => it.caseKey === caseKey)
    if (!r || !match) {
      setNotFound(true)
      return
    }
    setRun(r)
    setItem(match)
    setItems(runItems ?? [])
    const { data: res } = await api.GET('/api/v1/items/{itemId}/results', { params: { path: { itemId: match.id } } })
    setResults(res ?? [])
    const { data: allUsers } = await api.GET('/api/v1/users')
    setUserAvatars(Object.fromEntries((allUsers ?? []).map((u) => [u.id, u.avatarKey])))
  }, [runKey, caseKey])

  useEffect(() => {
    void load()
  }, [load])

  const projectKey = run?.projectKey
  useEffect(() => {
    if (!projectKey) return
    api
      .GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } })
      .then(({ data }) => setProject(data))
      .catch(() => setProject(undefined))
  }, [projectKey])

  function rejectAttachment(file: File): string | null {
    if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type)) {
      return "isn't a PNG, JPEG, or WebP image. Try a different file."
    }
    if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
      return `is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is 5MB. Try a smaller image.`
    }
    return null
  }

  // Both the independent Attachments field and pasting/dropping directly
  // onto Comment funnel through here into the same staged list — Comment is
  // a convenience for someone already typing, never a requirement for
  // attaching evidence (follow-up to add-run-item-screenshot-attachments).
  async function uploadAttachment(file: File, source: 'field' | 'comment' = 'field') {
    if (!item) return
    const reason = rejectAttachment(file)
    if (reason) {
      setLastAttachError({ filename: file.name, reason })
      setFailedUploads((prev) => [...prev, { id: `${file.name}-${Date.now()}`, filename: file.name }])
      return
    }
    setLastAttachError(null)

    setIsUploadingAttachment(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      // openapi-fetch's generated body type expects the schema's object
      // shape, not a FormData instance — use fetch directly for this one
      // multipart request, the same pattern ProfilePage's avatar upload
      // uses (fetch passes FormData through unchanged at runtime, but its
      // generated types don't model that).
      const res = await fetch(`/api/v1/items/${item.id}/attachments`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) {
        setLastAttachError({ filename: file.name, reason: 'failed to upload. Try again.' })
        setFailedUploads((prev) => [...prev, { id: `${file.name}-${Date.now()}`, filename: file.name }])
        return
      }
      const created = (await res.json()) as Attachment
      setStagedAttachments((prev) => [...prev, created])
      setJustAddedAttachmentId(created.id)
      setTimeout(() => setJustAddedAttachmentId((cur) => (cur === created.id ? null : cur)), 1200)
      if (source === 'comment') {
        setShowCommentAttachToast(true)
        setTimeout(() => setShowCommentAttachToast(false), 1800)
      }
    } finally {
      setIsUploadingAttachment(false)
    }
  }

  async function removeStagedAttachment(id: string) {
    setStagedAttachments((prev) => prev.filter((a) => a.id !== id))
    await fetch(`/api/v1/attachments/${id}`, { method: 'DELETE', credentials: 'include' })
  }

  function handleCommentPaste(e: ReactClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(e.clipboardData.items).find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    const file = imageItem?.getAsFile()
    if (file) void uploadAttachment(file, 'comment')
  }

  function handleCommentDragOver(e: ReactDragEvent<HTMLTextAreaElement>) {
    e.preventDefault()
  }

  function handleCommentDrop(e: ReactDragEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) void uploadAttachment(file, 'comment')
  }

  async function attachToResult(resultId: string, file: File) {
    const reason = rejectAttachment(file)
    if (reason) {
      setLastAttachError({ filename: file.name, reason })
      return
    }
    setLastAttachError(null)

    setIsUploadingAttachment(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/v1/results/${resultId}/attachments`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) {
        setLastAttachError({ filename: file.name, reason: 'failed to upload. Try again.' })
        return
      }
      const created = (await res.json()) as Attachment
      setResults((prev) =>
        prev.map((r) => (r.id === resultId ? { ...r, attachments: [...(r.attachments ?? []), created] } : r)),
      )
    } finally {
      setIsUploadingAttachment(false)
    }
  }

  function handleHistoryFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file && pendingAttachResultId) void attachToResult(pendingAttachResultId, file)
    setPendingAttachResultId(null)
  }

  async function recordVerdict(verdict: Verdict, options?: { advance?: boolean }) {
    if (!item || isRecording) return
    setIsRecording(true)
    try {
      const override = actorOverride.trim()
      await api.POST('/api/v1/items/{itemId}/results', {
        params: { path: { itemId: item.id } },
        body: {
          verdict,
          comment,
          ...(override ? { actor: override } : {}),
          ...(stagedAttachments.length > 0 ? { attachmentIds: stagedAttachments.map((a) => a.id) } : {}),
        },
      })
      setStagedAttachments([])
      setFailedUploads([])
      setLastAttachError(null)
      if (options?.advance) {
        const currentIndex = items.findIndex((it) => it.id === item.id)
        const next = items.slice(currentIndex + 1).find((it) => it.currentStatus === 'pending')
        navigate(next ? `/runs/${runKey}/items/${next.caseKey}` : `/runs/${runKey}`)
        return
      }
      setComment('')
      const [{ data: refreshedItems }, { data: res }] = await Promise.all([
        api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey: runKey! } } }),
        api.GET('/api/v1/items/{itemId}/results', { params: { path: { itemId: item.id } } }),
      ])
      setItem((refreshedItems ?? []).find((it) => it.id === item.id))
      setResults(res ?? [])
    } finally {
      setIsRecording(false)
    }
  }

  const lastVerdict = results.length > 0 ? results[results.length - 1].verdict : undefined

  function handleCommentKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && lastVerdict && comment.trim()) {
      e.preventDefault()
      void recordVerdict(lastVerdict)
    }
  }

  async function markRetest() {
    if (!item) return
    await api.PUT('/api/v1/items/{itemId}/status', {
      params: { path: { itemId: item.id } },
      body: { status: 'retest' },
    })
    const { data: refreshedItems } = await api.GET('/api/v1/runs/{runKey}/items', {
      params: { path: { runKey: runKey! } },
    })
    setItem((refreshedItems ?? []).find((it) => it.id === item.id))
  }

  async function handleAssign(assignee: AssigneePick) {
    if (!item) return
    await assignRunItems([item.id], assignee)
    const resolved = { kind: assignee.kind, id: assignee.id, name: assignee.label }
    setItem((prev) => (prev ? { ...prev, assignee: resolved } : prev))
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, assignee: resolved } : it)))
  }

  function goToItemOffset(offset: number) {
    if (!item) return
    const currentIndex = items.findIndex((it) => it.id === item.id)
    const target = items[currentIndex + offset]
    if (!target) return
    navigate(`/runs/${runKey}/items/${target.caseKey}`)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!item || isEditableElementFocused()) return
      const key = e.key.toLowerCase()
      const isClosedNow = run?.status === 'closed'
      if (!isClosedNow) {
        if (key === 'p') return void recordVerdict('pass', { advance: true })
        if (key === 'f') return void recordVerdict('failed', { advance: true })
        if (key === 'b') return void recordVerdict('blocked', { advance: true })
        if (key === 's') return void recordVerdict('skipped', { advance: true })
        if (key === 'r' && item.currentStatus === 'failed') return void markRetest()
      }
      if (key === 'j' || key === 'arrowdown') return goToItemOffset(1)
      if (key === 'k' || key === 'arrowup') return goToItemOffset(-1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, items, run?.status, runKey, actorOverride, comment, isRecording])

  if (!runKey || !caseKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Item not found. <Link to={`/runs/${runKey}`} className="underline">Go to run</Link>
      </p>
    )
  }
  if (!run || !item) return null

  const isClosed = run.status === 'closed'

  const shortcuts: ShortcutEntry[] = [
    ...(!isClosed
      ? [
          { keys: 'P', label: 'Pass' },
          { keys: 'F', label: 'Failed' },
          { keys: 'B', label: 'Blocked' },
          { keys: 'S', label: 'Skipped' },
          ...(item.currentStatus === 'failed' ? [{ keys: 'R', label: 'Retest' }] : []),
          ...(lastVerdict ? [{ keys: '⌘/Ctrl+Enter', label: 'Save comment' }] : []),
        ]
      : []),
    { keys: 'J/K · ↑/↓', label: 'Next / previous item' },
  ]

  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb([
    { label: 'Projects', href: '/' },
    { label: project?.name ?? '', href: project ? `/projects/${project.key}` : undefined },
    { label: run.name, href: `/runs/${runKey}` },
  ])

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/runs/${runKey}`}
            aria-label={`Back to ${run.name}`}
            className="text-2xl leading-none text-primary hover:text-primary/70"
          >
            ←
          </Link>
          <h1 className="tp-heading text-2xl">{item.content.title}</h1>
        </div>
        <StatusBadge status={item.currentStatus} />
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="panel-title text-xs font-semibold tracking-wide text-muted-foreground uppercase">Steps</p>
            <CaseStepsList steps={item.content.steps} />
          </div>
          {item.content.expectedResult && (
            <div>
              <h3 className="mb-1 text-sm font-medium">Expected result</h3>
              <p className="text-sm">{item.content.expectedResult}</p>
            </div>
          )}

          <div className="space-y-2 border-t pt-4">
            {isClosed ? (
              <p className="text-sm text-muted-foreground">
                This run is closed. Ask a project admin to reopen it to record new results.
              </p>
            ) : (
              <>
                <AttachmentField
                  attachments={stagedAttachments}
                  failed={failedUploads}
                  highlightId={justAddedAttachmentId}
                  lastError={lastAttachError}
                  uploading={isUploadingAttachment}
                  onSelectFile={(file) => void uploadAttachment(file, 'field')}
                  onRemove={(id) => void removeStagedAttachment(id)}
                  onOpenLightbox={setStagedLightboxIndex}
                />

                <div className="space-y-1">
                  <Label htmlFor="comment">Comment</Label>
                  <Textarea
                    id="comment"
                    placeholder="Add context for this result… (screenshots paste here too)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    onPaste={handleCommentPaste}
                    onDragOver={handleCommentDragOver}
                    onDrop={handleCommentDrop}
                  />
                  {showCommentAttachToast && (
                    <p className="text-xs text-primary" aria-live="polite">
                      ✓ Added to Attachments
                    </p>
                  )}
                  {lastVerdict ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!comment.trim() || isRecording}
                      onClick={() => void recordVerdict(lastVerdict)}
                    >
                      Save comment
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This comment is saved together with a verdict — record one below.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  {showActorOverride ? (
                    <>
                      <Label htmlFor="actor-override">Record on behalf of</Label>
                      <Input
                        id="actor-override"
                        value={actorOverride}
                        onChange={(e) => setActorOverride(e.target.value)}
                        placeholder="Defaults to you"
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => setShowActorOverride(true)}
                    >
                      Record on behalf of someone else
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={isRecording} onClick={() => void recordVerdict('pass')}>
                    Pass
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isRecording}
                    onClick={() => void recordVerdict('failed')}
                  >
                    Failed
                  </Button>
                  <Button size="sm" variant="outline" disabled={isRecording} onClick={() => void recordVerdict('blocked')}>
                    Blocked
                  </Button>
                  <Button size="sm" variant="outline" disabled={isRecording} onClick={() => void recordVerdict('skipped')}>
                    Skipped
                  </Button>
                  {item.currentStatus === 'failed' && (
                    <Button size="sm" variant="secondary" disabled={isRecording} onClick={() => void markRetest()}>
                      Retest
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5"
          data-testid="run-item-sidebar"
        >
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Status" value={<StatusBadge status={item.currentStatus} />} />
            {item.testName && <PropertyRow label="Test name" value={item.testName} />}
            <PropertyRow label="Platform" value={item.content.platform} />
            <PropertyRow label="Tags" value={(item.content.tags ?? []).join(', ')} />
            <PropertyRow label="Pinned version" value={`v${item.caseVersion}`} />
            <PropertyRow
              label="Assignee"
              value={
                <span className="flex items-center gap-2">
                  {item.assignee ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      {item.assignee.kind === 'team' ? (
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                          style={avatarStyle(item.assignee.name)}
                        >
                          {initialsFor(item.assignee.name)}
                        </span>
                      ) : (
                        <Avatar
                          seed={item.assignee.name}
                          avatarKey={item.assignee.avatarKey}
                          userId={item.assignee.id}
                          className="size-5 rounded-full text-[10px]"
                        />
                      )}
                      <span className="truncate">{item.assignee.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className="size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/40"
                        aria-hidden="true"
                      />
                      Unassigned
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Assign to…"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setAssignDialogOpen(true)}
                  >
                    <UserPlusIcon className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              }
            />
            {item.newerVersion && (
              <p className="text-sm text-muted-foreground">A newer version of this case exists</p>
            )}
          </CaseSidebarSection>

          <CaseSidebarSection title="History">
            {results.length > 0 ? (
              <ul className="space-y-2 text-sm" aria-label="Result history">
                {results.map((r) => (
                  <li key={r.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.verdict} />
                      {isValidDate(r.createdAt) && (
                        <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-1.5">
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        {r.actorKind === 'user' && r.actorRefId && (
                          <Avatar
                            seed={r.actor}
                            avatarKey={userAvatars[r.actorRefId]}
                            userId={r.actorRefId}
                            className="size-4 rounded-full text-[9px]"
                          />
                        )}
                        {r.actor}
                        {r.comment && ` — ${r.comment}`}
                      </p>
                      {!isClosed && (
                        <button
                          type="button"
                          aria-label="Attach screenshot"
                          title="Attach screenshot"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setPendingAttachResultId(r.id)
                            historyFileInputRef.current?.click()
                          }}
                        >
                          <PaperclipIcon className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {r.attachments && r.attachments.length > 0 && (
                      <AttachmentStrip
                        attachments={r.attachments}
                        onSelect={(index) => setHistoryLightbox({ resultId: r.id, index })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No results recorded yet.</p>
            )}
            <input
              ref={historyFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleHistoryFileSelected}
            />
          </CaseSidebarSection>
        </div>
      </div>

      {projectKey && (
        <AssignDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          projectKey={projectKey}
          onAssign={(assignee) => void handleAssign(assignee)}
        />
      )}

      {stagedLightboxIndex !== null && (
        <Lightbox
          attachments={stagedAttachments}
          index={stagedLightboxIndex}
          onNavigate={setStagedLightboxIndex}
          onClose={() => setStagedLightboxIndex(null)}
        />
      )}
      {historyLightbox &&
        (() => {
          const r = results.find((res) => res.id === historyLightbox.resultId)
          if (!r || !r.attachments) return null
          return (
            <Lightbox
              attachments={r.attachments}
              index={historyLightbox.index}
              onNavigate={(index) => setHistoryLightbox({ resultId: historyLightbox.resultId, index })}
              onClose={() => setHistoryLightbox(null)}
              captionExtra={`${r.actor}${isValidDate(r.createdAt) ? ` · ${r.verdict} · ${timeAgo(r.createdAt)}` : ` · ${r.verdict}`}`}
            />
          )
        })()}

      <RunShortcutsHint shortcuts={shortcuts} />
      <RunShortcutsOverlay shortcuts={shortcuts} />
    </div>
  )
}
