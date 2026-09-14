import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { CheckIcon, CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useProjectSummaries } from '@/lib/useProjectSummaries'
import { useAuth } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type ImportJob = components['schemas']['ImportJob']

// How often we poll a running import job (add-testrail-importer design.md —
// dry-run scanning and the real import are both genuinely async on the
// backend, so the browser has to poll rather than get a synchronous
// response). A few seconds is fine — nothing here is latency-sensitive.
const POLL_INTERVAL_MS = 2500

type TargetMode = 'new' | 'existing'

// One Card per stage, appended top-to-bottom as the user progresses — no
// wizard/stepper primitive exists in this codebase, and one importer
// (TestRail) doesn't justify inventing one. `phase` drives which single
// stage card is currently shown; Connect is the one stage that persists
// (collapsed to a one-line summary) once the user has moved past it,
// exactly like the approved mock — the later stages replace each other
// rather than stacking indefinitely (the mock's own stage-switcher only
// ever shows one full stage at a time too).
type Phase = 'connect' | 'scanning' | 'preview' | 'importing' | 'result'

// Matches the plain `<select>` styling NewRunPage.tsx/FolderExplorerPage.tsx
// already use — no separate shadcn Select primitive for this in the
// codebase yet, so this follows the established convention rather than
// introducing one.
const SELECT_CLASSNAME = 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm'

// Big-number + small-caps-label tile (design-system.md's `tp-label`
// utility). Optionally links out — only the Result stage's tiles do, per
// the approved mock ("now clickable, linking into the created project's
// Library view").
function StatTile({ value, label, href }: { value: number; label: string; href?: string }) {
  const content = (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-muted py-4">
      <span className="text-3xl font-bold tabular-nums text-foreground">{value}</span>
      <span className="tp-label">{label}</span>
    </div>
  )
  if (href) {
    return (
      <Link to={href} className="flex flex-1 transition-opacity hover:opacity-80">
        {content}
      </Link>
    )
  }
  return content
}

export default function ImportProjectPage() {
  const { source } = useParams<{ source: string }>()
  const { user, loading: authLoading } = useAuth()
  const projectSummaries = useProjectSummaries()
  // "Existing empty project" per the approved mock: zero folders, suites,
  // or cases — the frontend only has suite/case counts to go on (no
  // folderCount on ProjectSummary), so caseCount === 0 && suiteCount === 0
  // is the real signal available client-side.
  const emptyProjects = projectSummaries.filter((p) => p.caseCount === 0 && p.suiteCount === 0)

  const [phase, setPhase] = useState<Phase>('connect')
  const [siteUrl, setSiteUrl] = useState('')
  const [testRailProjectId, setTestRailProjectId] = useState('')
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [targetMode, setTargetMode] = useState<TargetMode>('new')
  const [newProjectName, setNewProjectName] = useState('')
  const [existingProjectKey, setExistingProjectKey] = useState('')
  const [targetProject, setTargetProject] = useState<{ key: string; name: string }>()
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string>()
  const [dryRunJob, setDryRunJob] = useState<ImportJob>()
  const [realJob, setRealJob] = useState<ImportJob>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importError, setImportError] = useState<string>()

  // Poll whichever job is currently in flight. Cleans up on every phase
  // change — once `phase` moves off 'scanning'/'importing' (success,
  // failure, or Edit connection/Start over), the effect's own cleanup
  // clears the interval, so there's never more than one poll loop alive.
  useEffect(() => {
    if (phase !== 'scanning' && phase !== 'importing') return
    if (!targetProject) return
    const jobId = phase === 'scanning' ? dryRunJob?.id : realJob?.id
    if (!jobId) return
    const projectKey = targetProject.key
    let cancelled = false

    async function tick() {
      const { data } = await api.GET('/api/v1/projects/{projectKey}/import-jobs/{jobId}', {
        params: { path: { projectKey, jobId: jobId! } },
      })
      if (cancelled || !data) return
      if (phase === 'scanning') {
        if (data.status === 'succeeded') {
          setDryRunJob(data)
          setPhase('preview')
        } else if (data.status === 'failed') {
          setConnectError(data.error ?? 'Could not scan this TestRail project.')
          setPhase('connect')
        } else {
          setDryRunJob(data)
        }
      } else {
        if (data.status === 'succeeded') {
          setRealJob(data)
          setPhase('result')
        } else if (data.status === 'failed') {
          setImportError(data.error ?? 'The import failed.')
          setRealJob(data)
        } else {
          setRealJob(data)
        }
      }
    }

    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, targetProject, dryRunJob?.id, realJob?.id])

  if (!source) return null
  if (authLoading) return null
  if (!user?.isTenantAdmin) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have permission to create a project.</p>
  }
  if (source !== 'testrail') {
    return <p className="text-sm text-muted-foreground">Unknown import source &ldquo;{source}&rdquo;.</p>
  }

  const canSubmitConnect =
    siteUrl.trim().length > 0 &&
    email.trim().length > 0 &&
    apiKey.length > 0 &&
    testRailProjectId.trim().length > 0 &&
    (targetMode === 'new' ? newProjectName.trim().length > 0 : existingProjectKey.length > 0)

  function credentialsBody() {
    return {
      siteUrl: siteUrl.trim(),
      email: email.trim(),
      apiKey,
      testRailProjectId: testRailProjectId.trim(),
    }
  }

  async function handleConnectSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmitConnect) return
    setConnectError(undefined)
    setConnecting(true)
    try {
      let project: { key: string; name: string } | undefined
      if (targetMode === 'new') {
        const { data, error, response } = await api.POST('/api/v1/projects', {
          body: { name: newProjectName.trim() },
        })
        if (!response.ok || !data) {
          setConnectError((error as { error?: string } | undefined)?.error ?? 'Could not create the target project.')
          return
        }
        project = { key: data.key, name: data.name }
      } else {
        const existing = emptyProjects.find((p) => p.id === existingProjectKey)
        if (!existing) {
          setConnectError('Choose an existing empty project.')
          return
        }
        project = { key: existing.id, name: existing.name }
      }
      setTargetProject(project)

      const { data, error, response } = await api.POST('/api/v1/projects/{projectKey}/import-jobs', {
        params: { path: { projectKey: project.key } },
        body: { source: 'testrail', mode: 'dry_run', credentials: credentialsBody() },
      })
      if (!response.ok || !data) {
        setConnectError((error as { error?: string } | undefined)?.error ?? 'Could not start the TestRail scan.')
        return
      }
      setDryRunJob(data)
      setPhase('scanning')
    } finally {
      setConnecting(false)
    }
  }

  function handleStartOver() {
    setPhase('connect')
    setSiteUrl('')
    setTestRailProjectId('')
    setEmail('')
    setApiKey('')
    setTargetMode('new')
    setNewProjectName('')
    setExistingProjectKey('')
    setTargetProject(undefined)
    setDryRunJob(undefined)
    setRealJob(undefined)
    setConnectError(undefined)
    setImportError(undefined)
  }

  async function handleConfirmImport() {
    if (!targetProject) return
    setConfirmOpen(false)
    setImportError(undefined)
    const { data, error, response } = await api.POST('/api/v1/projects/{projectKey}/import-jobs', {
      params: { path: { projectKey: targetProject.key } },
      body: { source: 'testrail', mode: 'real', credentials: credentialsBody() },
    })
    if (!response.ok || !data) {
      setImportError((error as { error?: string } | undefined)?.error ?? 'Could not start the import.')
      return
    }
    setRealJob(data)
    setPhase('importing')
  }

  const breadcrumbSegments: Crumb[] = [
    { label: 'Projects', href: '/' },
    { label: 'Import from TestRail' },
  ]

  const report = dryRunJob?.report
  const folderCount = report?.counts.folders ?? 0
  const caseCount = report?.counts.cases ?? 0
  const unmapped = report?.unmapped ?? []

  const resultReport = realJob?.report
  const resultFolderCount = resultReport?.counts.folders ?? 0
  const resultCaseCount = resultReport?.counts.cases ?? 0
  const resultUnmapped = resultReport?.unmapped ?? []

  const progressCurrent = realJob?.progressCurrent ?? 0
  const progressTotal = realJob?.progressTotal ?? 0
  const progressPct = progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0

  const connectSummary =
    targetProject &&
    `${siteUrl.replace(/^https?:\/\//, '')} · project ${testRailProjectId} · ${email} → ${
      targetMode === 'new' ? 'creating' : 'into'
    } ${targetProject.name}`

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div>
        <h1 className="tp-heading text-2xl">Import from TestRail</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Recreates TestRail suites and sections as nested folders, and TestRail cases inside them — doesn&apos;t
          touch TestPulse&apos;s own Suite feature. Run/result history isn&apos;t part of this version — see the
          note below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">Connect to TestRail</CardTitle>
        </CardHeader>
        <CardContent>
          {phase === 'connect' ? (
            <form onSubmit={handleConnectSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                TestPulse reads your TestRail project over its REST API using an account email and API key —
                nothing is written back to TestRail.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="testrail-site-url">TestRail site URL</Label>
                  <Input
                    id="testrail-site-url"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="https://yourcompany.testrail.io"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="testrail-project-id">TestRail project ID</Label>
                  <Input
                    id="testrail-project-id"
                    value={testRailProjectId}
                    onChange={(e) => setTestRailProjectId(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="testrail-email">TestRail account email</Label>
                  <Input
                    id="testrail-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="qa-lead@acme.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="testrail-api-key">TestRail API key</Label>
                  <Input
                    id="testrail-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Need a key? In TestRail: <strong className="font-semibold">My Settings → API Keys → Add Key</strong>.
              </p>

              <p className="text-xs text-muted-foreground">
                Independent, unofficial integration — not affiliated with, endorsed by, or sponsored by Idera, Inc.
                TestRail is a trademark of Idera, Inc.
              </p>

              <div className="space-y-2">
                <Label>Import into</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={targetMode === 'new' ? 'default' : 'outline'}
                    aria-pressed={targetMode === 'new'}
                    onClick={() => setTargetMode('new')}
                  >
                    New project
                  </Button>
                  <Button
                    type="button"
                    variant={targetMode === 'existing' ? 'default' : 'outline'}
                    aria-pressed={targetMode === 'existing'}
                    onClick={() => setTargetMode('existing')}
                  >
                    Existing empty project
                  </Button>
                </div>

                {targetMode === 'new' ? (
                  <div className="max-w-sm space-y-1">
                    <Label htmlFor="new-project-name">New project name</Label>
                    <Input
                      id="new-project-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="QA Platform"
                    />
                  </div>
                ) : (
                  <div className="max-w-sm space-y-1">
                    <Label htmlFor="existing-project">Existing project</Label>
                    <select
                      id="existing-project"
                      className={SELECT_CLASSNAME}
                      value={existingProjectKey}
                      onChange={(e) => setExistingProjectKey(e.target.value)}
                    >
                      <option value="">Select a project…</option>
                      {emptyProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Only projects with no folders, suites, or cases yet are listed.
                    </p>
                  </div>
                )}
              </div>

              {connectError && <p className="text-sm text-destructive">{connectError}</p>}

              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link to="/">Cancel</Link>
                </Button>
                <Button type="submit" disabled={!canSubmitConnect || connecting}>
                  {connecting ? 'Starting scan…' : 'Preview import'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {connectSummary}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPhase('connect')}>
                Edit connection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {phase === 'scanning' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Scanning your TestRail project…</p>
          </CardContent>
        </Card>
      )}

      {phase === 'preview' && dryRunJob && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <StatTile value={folderCount} label="folders" />
              <StatTile value={caseCount} label="cases" />
            </div>

            {unmapped.length > 0 && (
              <div className="space-y-2 rounded-lg border border-secondary/30 bg-secondary/10 p-3">
                <div className="flex items-start gap-2">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">
                    {unmapped.length} custom fields won&apos;t be imported
                  </p>
                </div>
                <ul className="ml-6 list-disc space-y-0.5 text-sm">
                  {unmapped.map((name) => (
                    <li key={name} className="font-semibold">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Run and result history also isn&apos;t imported in this version — structure and cases only, a
              permanent v1 boundary. And to be explicit: none of this creates or changes any TestPulse{' '}
              <strong className="font-semibold text-foreground">Suite</strong> (the run-scoping kind) — TestRail
              suites become folders, full stop.
            </p>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={handleStartOver}>
                Start over
              </Button>
              <Button type="button" onClick={() => setConfirmOpen(true)}>
                Import {caseCount} case{caseCount === 1 ? '' : 's'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'importing' && realJob && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">Importing…</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importError ? (
              <p className="text-sm text-destructive">{importError}</p>
            ) : (
              <>
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium tabular-nums">
                    {progressCurrent} of {progressTotal} cases imported…
                  </p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  This can take a few minutes for a project this size. Keep this tab open — the report will be ready
                  when it&apos;s done.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {phase === 'result' && realJob && targetProject && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading flex items-center gap-2">
              <CheckCircle2Icon className="size-5 text-primary" aria-hidden="true" />
              Import complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <StatTile value={resultFolderCount} label="folders" href={`/projects/${targetProject.key}/library`} />
              <StatTile value={resultCaseCount} label="cases" href={`/projects/${targetProject.key}/library`} />
            </div>

            {resultUnmapped.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {resultUnmapped.length} custom fields were dropped and
                run/result history wasn&apos;t imported — same list as the preview above. Your existing TestPulse
                Suites are untouched.
              </p>
            )}

            <div className="flex justify-end border-t pt-4">
              <Button asChild>
                <Link to={`/projects/${targetProject.key}`}>Open {targetProject.name} →</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            Import {caseCount} case{caseCount === 1 ? '' : 's'} into &quot;{targetProject?.name}&quot;?
          </DialogTitle>
          <DialogDescription>
            This creates {folderCount} folder{folderCount === 1 ? '' : 's'} and {caseCount} case
            {caseCount === 1 ? '' : 's'} in {targetProject?.name}. This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleConfirmImport()}>
              Import {caseCount} case{caseCount === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
