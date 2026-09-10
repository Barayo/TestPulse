import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FolderInputIcon, Trash2Icon } from 'lucide-react'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { buildSlugPath } from '@/lib/folderSlugPath'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Avatar } from '@/components/Avatar'
import { PropertyRow } from '@/components/PropertyRow'
import { CaseSidebarSection } from '@/components/CaseSidebarSection'
import { CaseResultsPanel, type CaseResultsData } from '@/components/CaseResultsPanel'
import { toResultsData, RECENT_EXECUTIONS_LIMIT } from '@/lib/caseResultsData'
import { CaseContentView, caseContentHeading } from '@/components/CaseContentView'
import { PRIORITIES, type Priority, type CustomField } from '@/components/ClassificationEditor'
import { ClassificationPills, AutomationPill } from '@/components/Pills'
import { JiraLinkBadge } from '@/components/JiraLinkBadge'
import { FolderPicker } from '@/components/FolderPicker'
import { RowActionMenu, type RowActionMenuItem } from '@/components/RowActionMenu'
import { CaseFormatEditor } from '@/components/CaseFormatEditor'
import { TagChipsEditor } from '@/components/TagChipsEditor'
import { CASE_FORMAT_LABELS, type CaseFormat } from '@/lib/useCaseFormatSwitch'
import { VersionDetailDialog } from '@/components/VersionDetailDialog'
import { ContentDiffView } from '@/components/ContentDiffView'
import { diffContent, diffSignal } from '@/lib/versionDiff'
import { useProjectPermissions, useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Project = components['schemas']['Project']
type Folder = components['schemas']['Folder']
type CaseVersion = components['schemas']['CaseVersion']
type Suite = components['schemas']['Suite']
type Step = components['schemas']['Step']

function firstNameOf(displayName: string): string {
  return displayName.split(' ')[0]
}

export default function CaseDetailPage() {
  const { projectKey, caseKey } = useParams<{ projectKey: string; caseKey: string }>()
  const navigate = useNavigate()
  const permissions = useProjectPermissions(projectKey)
  const { user, loading: authLoading, jiraSiteUrl } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)

  const [project, setProject] = useState<Project>()
  const [folders, setFolders] = useState<Folder[]>([])
  const [testCase, setTestCase] = useState<TestCase>()
  const [versions, setVersions] = useState<CaseVersion[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [resultsData, setResultsData] = useState<CaseResultsData>()
  const [notFound, setNotFound] = useState(false)
  // Resolves a version's actor to a display name + avatar (link-case-version-actor-to-identity)
  // — actorRefId -> {displayName, avatarKey}, the same client-side lookup pattern
  // RunItemDetailPage already uses for result history.
  const [userIdentities, setUserIdentities] = useState<
    Record<string, { displayName: string; avatarKey?: string | null }>
  >({})

  const [viewingVersion, setViewingVersion] = useState<number | null>(null)
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<CaseFormat>('steps')
  const [steps, setSteps] = useState<Step[]>([])
  const [description, setDescription] = useState('')
  const [gherkinSource, setGherkinSource] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [platform, setPlatform] = useState('')
  const [testType, setTestType] = useState('')
  const [automated, setAutomated] = useState(false)
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomField[]>([])
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})
  const [showAllCustomFields, setShowAllCustomFields] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveQuery, setMoveQuery] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null)

  const load = useCallback(async () => {
    // Waits for the session check and confirmed project read access before
    // firing either branch (design.md D2/D11, unify-authenticated-and-public-views)
    // — a signed-in non-member resolves to 'public' here, reading a public
    // project like an anonymous visitor instead of hitting 403s.
    if (!projectKey || !caseKey || access === 'loading') return
    setNotFound(false)
    if (access === 'member') {
      const [{ data: p }, f, { data: c }, { data: v }, s, users, { data: execs }, { data: fields }] = await Promise.all([
        api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
        fetchAllPages((cursor) =>
          api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        ),
        api.GET('/api/v1/cases/{caseKey}', { params: { path: { caseKey } } }),
        api.GET('/api/v1/cases/{caseKey}/versions', { params: { path: { caseKey } } }),
        fetchAllPages((cursor) =>
          api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        ),
        fetchAllPages((cursor) =>
          api.GET('/api/v1/users', { params: { query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        ),
        api.GET('/api/v1/cases/{caseKey}/executions', {
          params: { path: { caseKey }, query: { order: 'recent', limit: RECENT_EXECUTIONS_LIMIT } },
        }),
        api.GET('/api/v1/projects/{projectKey}/custom-fields', { params: { path: { projectKey } } }),
      ])
      if (!p || !c) {
        setNotFound(true)
        return
      }
      setProject(p)
      setFolders(f.items)
      setTestCase(c)
      setVersions((v ?? []).slice().sort((a, b) => b.version - a.version))
      setSuites(s.items)
      setResultsData(toResultsData(execs ?? []))
      setCustomFieldDefs(fields ?? [])
      setUserIdentities(
        Object.fromEntries(
          users.items.map((u) => [u.id, { displayName: u.displayName ?? u.email, avatarKey: u.avatarKey }]),
        ),
      )
      return
    }
    // Anonymous: GET /api/v1/users has no public equivalent and never
    // gets one (design.md D1/D10) — version-history rows simply show no
    // author name, since userIdentities stays empty here.
    const [{ data: p }, f, { data: c }, { data: v }, s, { data: execs }, { data: fields }] = await Promise.all([
      api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/public/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
      api.GET('/api/v1/public/cases/{caseKey}', { params: { path: { caseKey } } }),
      api.GET('/api/v1/public/cases/{caseKey}/versions', { params: { path: { caseKey } } }),
      fetchAllPages((cursor) =>
        api.GET('/api/v1/public/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
      ),
      api.GET('/api/v1/public/cases/{caseKey}/executions', {
        params: { path: { caseKey }, query: { order: 'recent', limit: RECENT_EXECUTIONS_LIMIT } },
      }),
      api.GET('/api/v1/public/projects/{projectKey}/custom-fields', { params: { path: { projectKey } } }),
    ])
    if (!p || !c) {
      setNotFound(true)
      return
    }
    setProject(p)
    setFolders(f.items)
    setTestCase(c)
    setVersions((v ?? []).slice().sort((a, b) => b.version - a.version))
    setSuites(s.items)
    setResultsData(toResultsData(execs ?? []))
    setCustomFieldDefs(fields ?? [])
    setUserIdentities({})
  }, [projectKey, caseKey, access])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!testCase) return
    setTitle(testCase.content.title)
    setFormat(testCase.content.format ?? 'steps')
    setSteps((testCase.content.steps ?? []).map((s) => ({ action: s.action, expected: s.expected ?? '', groupRef: s.groupRef })))
    setDescription(testCase.content.description ?? '')
    setGherkinSource(testCase.content.gherkinSource ?? '')
    setPriority(testCase.content.priority ?? 'medium')
    setTags(testCase.content.tags ?? [])
    setPlatform(testCase.content.platform ?? '')
    setTestType(testCase.content.testType ?? '')
    setAutomated(testCase.content.automated ?? false)
    setCustomFieldValues(testCase.content.customFields ?? {})
    setIsEditing(false)
  }, [testCase])

  if (!projectKey || !caseKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        Case not found. <Link to={`/projects/${projectKey}/library`} className="underline">Go to Library</Link>
        {!user && !authLoading && (
          <>
            {' '}
            ·{' '}
            <Link to="/login" state={{ from: `/projects/${projectKey}/cases/${caseKey}` }} className="underline">
              Log in
            </Link>
          </>
        )}
      </p>
    )
  }
  if (!project || !testCase) return null

  const root = folders.find((f) => !f.parentFolderId)
  const folder = folders.find((f) => f.id === testCase.folderId)
  const folderName = folder && root && folder.id !== root.id ? folder.name : 'Library'
  const suiteNames = suites.filter((s) => s.caseIds.includes(testCase.id)).map((s) => s.name)

  function libraryUrl(target: Folder | undefined): string {
    const path = target ? buildSlugPath(target, folders) : ''
    return `/projects/${projectKey}/library${path ? `/${path}` : ''}`
  }

  async function saveEdit() {
    if (!title.trim() || !caseKey) return
    await api.PUT('/api/v1/cases/{caseKey}', {
      params: { path: { caseKey } },
      body: {
        title: title.trim(),
        steps: steps.filter((s) => s.action?.trim() || s.groupRef),
        description,
        format,
        gherkinSource,
        expectedResult: testCase!.content.expectedResult ?? '',
        priority,
        tags,
        platform: platform.trim(),
        testType: testType.trim(),
        automated,
        customFields: customFieldValues,
      },
    })
    await load()
  }

  async function moveTo(targetFolderId: string) {
    if (!caseKey) return
    await api.PUT('/api/v1/cases/{caseKey}/folder', {
      params: { path: { caseKey } },
      body: { folderId: targetFolderId },
    })
    setMoving(false)
    await load()
  }

  async function saveJiraLink(jiraIssueKey: string | null) {
    if (!caseKey) return
    await api.PUT('/api/v1/cases/{caseKey}/jira-link', {
      params: { path: { caseKey } },
      body: { jiraIssueKey },
    })
    await load()
  }

  async function confirmDeleteCase() {
    if (!caseKey || !projectKey) return
    await api.DELETE('/api/v1/cases/{caseKey}', { params: { path: { caseKey } } })
    navigate(`/projects/${projectKey}/library`)
  }

  async function confirmRestoreVersion() {
    if (!caseKey || restoringVersion === null) return
    await api.POST('/api/v1/cases/{caseKey}/versions/{version}/restore', {
      params: { path: { caseKey, version: restoringVersion } },
    })
    setRestoringVersion(null)
    await load()
  }

  const canEdit = Boolean(permissions?.caseEdit)
  const canDelete = Boolean(permissions?.caseDelete)

  const actionMenuItems: RowActionMenuItem[] = [
    ...(canEdit
      ? [
          {
            label: 'Move to…',
            icon: <FolderInputIcon className="size-4" aria-hidden="true" />,
            onSelect: () => setMoving(true),
          } satisfies RowActionMenuItem,
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Delete',
            danger: true,
            dividerBefore: true,
            icon: <Trash2Icon className="size-4" aria-hidden="true" />,
            onSelect: () => setConfirmingDelete(true),
          } satisfies RowActionMenuItem,
        ]
      : []),
  ]

  // Ends at the parent folder, not the case itself — the case's own <h1>
  // right below already shows its title, and (unlike a breadcrumb crumb)
  // can wrap instead of truncating a long one mid-word.
  const hasFolderAncestor = Boolean(folder && root && folder.id !== root.id)
  const breadcrumbSegments: Crumb[] = trimProjectBreadcrumb([
    { label: 'Projects', href: '/' },
    { label: project.name, href: `/projects/${projectKey}` },
    // No href when Library would be the sole remaining segment (case lives
    // directly in root) — that's "current location," not a distinct
    // ancestor, matching every other page's "last segment never links"
    // convention (Breadcrumbs.tsx's single-segment case renders nothing
    // when the lone segment has no href, same as an unsectioned Suites/Runs
    // page having nothing left to show).
    { label: 'Library', href: hasFolderAncestor ? `/projects/${projectKey}/library` : undefined },
    ...(hasFolderAncestor && folder ? [{ label: folder.name, href: libraryUrl(folder) }] : []),
  ])

  return (
    <div className="space-y-4">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            {!isEditing && (
              <Link
                to={libraryUrl(folder ?? root)}
                aria-label={`Back to ${folderName}`}
                className="text-2xl leading-none text-primary hover:text-primary/70"
              >
                ←
              </Link>
            )}
            {isEditing ? (
              <input
                aria-label="Title"
                className="tp-heading w-full min-w-0 border-b border-transparent bg-transparent text-2xl outline-none focus-visible:border-ring"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            ) : (
              <h1 className="tp-heading text-2xl">{testCase.content.title}</h1>
            )}
          </div>
        </div>
        {!isEditing && (canEdit || actionMenuItems.length > 0) && (
          <div className="flex items-center gap-1">
            {canEdit && <Button onClick={() => setIsEditing(true)}>Edit</Button>}
            {actionMenuItems.length > 0 && (
              <RowActionMenu label={`Actions for ${testCase.content.title}`} items={actionMenuItems} />
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_320px]">
        <div className="space-y-2">
          {isEditing ? (
            <div className="space-y-4">
              <CaseFormatEditor
                format={format}
                steps={steps}
                description={description}
                gherkinSource={gherkinSource}
                onFormatChange={setFormat}
                onStepsChange={setSteps}
                onDescriptionChange={setDescription}
                onGherkinSourceChange={setGherkinSource}
                projectKey={projectKey}
              />

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void saveEdit()
                  }}
                >
                  Save changes
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="panel-title text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {caseContentHeading(testCase.content.format)}
              </p>
              <CaseContentView
                content={testCase.content}
                emptyStateAction={canEdit ? <Button onClick={() => setIsEditing(true)}>+ Add steps</Button> : undefined}
                projectKey={projectKey}
              />
            </>
          )}
        </div>

        <div
          className="space-y-4 md:sticky md:top-6 md:self-start md:rounded-2xl md:bg-muted/60 md:p-5"
          data-testid="case-sidebar"
        >
          <CaseSidebarSection title="Properties">
            <PropertyRow label="Format" value={CASE_FORMAT_LABELS[(isEditing ? format : testCase.content.format) ?? 'steps']} />
            <PropertyRow
              label="Priority"
              value={
                isEditing ? (
                  <select
                    aria-label="Priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <ClassificationPills priority={testCase.content.priority ?? 'medium'} />
                )
              }
              wrap
            />
            <PropertyRow
              label="Test type"
              value={
                isEditing ? (
                  <Input
                    aria-label="Test type"
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    placeholder="e.g. unit, e2e"
                  />
                ) : (
                  testCase.content.testType && <ClassificationPills testType={testCase.content.testType} />
                )
              }
              wrap
            />
            <PropertyRow
              label="Automation"
              value={
                isEditing ? (
                  <Switch aria-label="Automated" checked={automated} onCheckedChange={setAutomated} />
                ) : (
                  <AutomationPill automated={Boolean(testCase.content.automated)} />
                )
              }
              wrap
            />
            <PropertyRow
              label="Platform"
              value={
                isEditing ? (
                  <Input
                    aria-label="Platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    placeholder="e.g. web, iOS"
                  />
                ) : (
                  testCase.content.platform && <ClassificationPills platform={testCase.content.platform} />
                )
              }
              wrap
            />
            <PropertyRow
              label="Tags"
              value={
                isEditing ? (
                  <TagChipsEditor
                    tags={tags}
                    vocabulary={[]}
                    onAdd={(tag) => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
                    onRemove={(tag) => setTags((prev) => prev.filter((t) => t !== tag))}
                  />
                ) : (
                  (testCase.content.tags ?? []).length > 0 &&
                  (testCase.content.tags ?? []).map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-2 py-0.5">
                      {tag}
                    </span>
                  ))
                )
              }
              wrap
            />
            <PropertyRow label="Version" value={`v${testCase.currentVersion}`} />
            <PropertyRow
              label="In suites"
              value={
                suiteNames.length > 0 &&
                suiteNames.map((name) => (
                  <span key={name} className="rounded-full bg-accent px-2 py-0.5">
                    {name}
                  </span>
                ))
              }
              wrap
            />
            <PropertyRow
              label="Jira"
              value={
                <JiraLinkBadge
                  variant="property"
                  jiraIssueKey={testCase.jiraIssueKey}
                  jiraIssueStatus={testCase.jiraIssueStatus}
                  jiraLastSyncedAt={testCase.jiraLastSyncedAt}
                  jiraBaseUrl={jiraSiteUrl}
                  canEdit={canEdit}
                  onSave={saveJiraLink}
                />
              }
              wrap
            />
            {customFieldDefs.length > 0 &&
              (() => {
                const values = isEditing ? customFieldValues : (testCase.content.customFields ?? {})
                const visible = customFieldDefs.slice(0, 3)
                const hidden = customFieldDefs.slice(3)
                const renderField = (field: CustomField) => {
                  const raw = values[field.id]
                  const display =
                    field.fieldType === 'select' ? (field.options ?? []).find((o) => o.id === raw)?.value : raw
                  return (
                    <PropertyRow
                      key={field.id}
                      label={field.name}
                      value={
                        isEditing ? (
                          field.fieldType === 'select' ? (
                            <select
                              aria-label={field.name}
                              value={raw ?? ''}
                              onChange={(e) =>
                                setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                              }
                              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                            >
                              <option value="">—</option>
                              {(field.options ?? []).map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.value}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              aria-label={field.name}
                              value={raw ?? ''}
                              onChange={(e) =>
                                setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                              }
                            />
                          )
                        ) : field.fieldType === 'select' && display ? (
                          <span className="rounded-full bg-muted px-2 py-0.5">{display}</span>
                        ) : (
                          display
                        )
                      }
                      wrap
                    />
                  )
                }
                return (
                  <>
                    {visible.map(renderField)}
                    {hidden.length > 0 &&
                      (showAllCustomFields ? (
                        hidden.map(renderField)
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setShowAllCustomFields(true)}
                        >
                          Show {hidden.length} more
                        </button>
                      ))}
                  </>
                )
              })()}
          </CaseSidebarSection>

          <CaseSidebarSection title="Results">
            <CaseResultsPanel data={resultsData} />
          </CaseSidebarSection>

          <CaseSidebarSection title="Version history">
              <ul aria-label="Version history" className="divide-y rounded-md border text-sm">
                {versions.map((v) => {
                  const previous = versions.find((x) => x.version === v.version - 1)
                  const signal = previous ? diffSignal(diffContent(previous.content, v.content, customFieldDefs)) : 'Initial version'
                  const expanded = expandedVersion === v.version
                  const author = v.actorKind === 'user' && v.actorRefId ? userIdentities[v.actorRefId] : undefined
                  return (
                    <li key={v.version}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-accent"
                        onClick={() => setExpandedVersion(expanded ? null : v.version)}
                      >
                        <span className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            <span>v{v.version}</span>
                            {v.version === testCase.currentVersion && <Badge variant="default">current</Badge>}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {author && (
                              <Avatar
                                seed={author.displayName}
                                avatarKey={author.avatarKey}
                                userId={v.actorRefId}
                                className="size-4 rounded-full text-[8px]"
                              />
                            )}
                            {author && (
                              <span title={author.displayName}>{firstNameOf(author.displayName)}</span>
                            )}
                            {author && <span>·</span>}
                            <span className="truncate">{signal}</span>
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      </button>
                      {expanded && (
                        <div className="space-y-2 border-t bg-muted/30 px-3 py-2">
                          {previous ? (
                            <ContentDiffView diff={diffContent(previous.content, v.content, customFieldDefs)} />
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              This is the first version — there is no previous version to compare against.
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setViewingVersion(v.version)}>
                              View executions
                            </Button>
                            {canEdit && v.version !== testCase.currentVersion && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setRestoringVersion(v.version)}
                              >
                                Restore this version
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CaseSidebarSection>
        </div>
      </div>

      {viewingVersion !== null && (
        <VersionDetailDialog
          open
          onOpenChange={(open) => !open && setViewingVersion(null)}
          caseKey={caseKey}
          version={viewingVersion}
          versions={versions}
          access={access}
          customFieldDefs={customFieldDefs}
        />
      )}

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move to…</DialogTitle>
          <FolderPicker
            folders={folders}
            rootId={root?.id ?? ''}
            query={moveQuery}
            onQueryChange={setMoveQuery}
            onSelect={(targetFolderId) => void moveTo(targetFolderId)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete case?</DialogTitle>
          <DialogDescription>
            Delete case &ldquo;{testCase.content.title}&rdquo;? This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDeleteCase()}>
              Delete case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoringVersion !== null} onOpenChange={(open) => !open && setRestoringVersion(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Restore version {restoringVersion}?</DialogTitle>
          <DialogDescription>
            This creates a new version with version {restoringVersion}&rsquo;s content, which becomes current.
            Existing versions remain in history, untouched.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoringVersion(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmRestoreVersion()}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
