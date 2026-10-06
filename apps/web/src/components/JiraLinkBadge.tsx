import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CheckIcon, ClockIcon, ExternalLinkIcon, Link2Icon, PencilIcon, XIcon } from 'lucide-react'
import { timeAgo } from '@/lib/timeAgo'

// Stale threshold: 24h since jiraLastSyncedAt (or never synced). The
// connector's default poll interval is 5 minutes (design.md D2) — 24h is
// ~288 missed cycles, a real-outage signal rather than sync-cadence noise.
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

export type JiraLinkBadgeProps = {
  jiraIssueKey: string | null | undefined
  jiraIssueStatus: string | null | undefined
  jiraLastSyncedAt: string | null | undefined
  // Jira Cloud site base URL (InstanceSettings.jiraSiteUrl, add-jira-connector)
  // — empty when a Tenant Admin hasn't configured it, in which case a
  // linked key still shows, just without a working link.
  jiraBaseUrl: string
  canEdit: boolean
  onSave: (jiraIssueKey: string | null) => void | Promise<void>
  variant: 'property' | 'row'
}

function isStale(jiraLastSyncedAt: string | null | undefined): boolean {
  if (!jiraLastSyncedAt) return true
  return Date.now() - new Date(jiraLastSyncedAt).getTime() > STALE_THRESHOLD_MS
}

function issueUrl(jiraBaseUrl: string, jiraIssueKey: string): string | undefined {
  if (!jiraBaseUrl) return undefined
  return `${jiraBaseUrl.replace(/\/$/, '')}/browse/${jiraIssueKey}`
}

function tooltipFor(
  t: TFunction,
  status: string | null | undefined,
  lastSyncedAt: string | null | undefined,
): string {
  if (!lastSyncedAt) return t('JiraLinkBadge.notYetSyncedTooltip')
  const synced = timeAgo(lastSyncedAt)
  if (isStale(lastSyncedAt)) {
    return status
      ? t('JiraLinkBadge.staleWithStatusTooltip', { status, timeAgo: synced })
      : t('JiraLinkBadge.staleTooltip', { timeAgo: synced })
  }
  return status
    ? t('JiraLinkBadge.freshWithStatusTooltip', { status, timeAgo: synced })
    : t('JiraLinkBadge.freshTooltip', { timeAgo: synced })
}

export function JiraLinkBadge({
  jiraIssueKey,
  jiraIssueStatus,
  jiraLastSyncedAt,
  jiraBaseUrl,
  canEdit,
  onSave,
  variant,
}: JiraLinkBadgeProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEditing() {
    setDraft(jiraIssueKey ?? '')
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
  }

  function save() {
    const trimmed = draft.trim().toUpperCase()
    setEditing(false)
    void onSave(trimmed === '' ? null : trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') save()
    else if (e.key === 'Escape') cancel()
  }

  const inputWidth = variant === 'row' ? 'w-22' : 'w-29'

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" data-testid="jira-link-edit">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={variant === 'row' ? t('JiraLinkBadge.placeholderRow') : t('JiraLinkBadge.placeholderProperty')}
          aria-label={t('JiraLinkBadge.issueKeyAriaLabel')}
          className={`h-7 rounded-md border border-input bg-transparent px-2 font-mono text-xs uppercase outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 ${inputWidth}`}
        />
        <button type="button" aria-label={t('JiraLinkBadge.saveAriaLabel')} onClick={save} className="text-primary hover:bg-primary/10 rounded p-1">
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </button>
        <button type="button" aria-label={t('JiraLinkBadge.cancelAriaLabel')} onClick={cancel} className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded p-1">
          <XIcon className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    )
  }

  if (!jiraIssueKey) {
    if (!canEdit) return variant === 'property' ? <>—</> : null
    return variant === 'property' ? (
      <button
        type="button"
        onClick={startEditing}
        className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs hover:underline"
      >
        <Link2Icon className="size-3.5" aria-hidden="true" />
        {t('JiraLinkBadge.linkJiraIssueLabel')}
      </button>
    ) : (
      <button
        type="button"
        onClick={startEditing}
        aria-label={t('JiraLinkBadge.linkJiraIssueAriaLabel')}
        className="text-muted-foreground hover:text-accent-foreground hover:bg-accent flex size-7 items-center justify-center rounded-md opacity-40 hover:opacity-100"
      >
        <Link2Icon className="size-3.5" aria-hidden="true" />
      </button>
    )
  }

  const href = issueUrl(jiraBaseUrl, jiraIssueKey)
  const title = tooltipFor(t, jiraIssueStatus, jiraLastSyncedAt)
  const stale = isStale(jiraLastSyncedAt)

  if (variant === 'row') {
    return (
      <span className="flex shrink-0 items-center">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={title}
          onClick={(e) => {
            if (!href) e.preventDefault()
          }}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11.5px]"
        >
          {stale && <ClockIcon className="text-status-progress-fg size-2.5" aria-hidden="true" />}
          {jiraIssueKey}
          <ExternalLinkIcon className="size-2.5" aria-hidden="true" />
        </a>
        {canEdit && (
          <button
            type="button"
            aria-label={t('JiraLinkBadge.changeJiraLinkAriaLabel')}
            onClick={startEditing}
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-6 items-center justify-center rounded-md"
          >
            <PencilIcon className="size-3" aria-hidden="true" />
          </button>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
        onClick={(e) => {
          if (!href) e.preventDefault()
        }}
        className="bg-muted hover:bg-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      >
        {stale && <ClockIcon className="text-status-progress-fg size-2.5" aria-hidden="true" />}
        <span className="font-mono">{jiraIssueKey}</span>
        {jiraIssueStatus && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{jiraIssueStatus}</span>
          </>
        )}
        <ExternalLinkIcon className="size-2.5" aria-hidden="true" />
      </a>
      {canEdit && (
        <button
          type="button"
          aria-label={t('JiraLinkBadge.changeJiraLinkAriaLabel')}
          onClick={startEditing}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex size-5 items-center justify-center rounded-md"
        >
          <PencilIcon className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
