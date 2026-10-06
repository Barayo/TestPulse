import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
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

// Sources with a dedicated Connect-form field set. Every other value (an
// unknown/mistyped :source segment) falls through to the "Unknown import
// source" guard below.
export type Source = 'testrail' | 'qase' | 'zephyr-scale' | 'kiwi-tcms' | 'xray' | 'tuskr' | 'csv'

export const SOURCE_LABEL: Record<Source, string> = {
  testrail: 'TestRail',
  qase: 'Qase',
  'zephyr-scale': 'Zephyr Scale',
  'kiwi-tcms': 'Kiwi TCMS',
  xray: 'Xray',
  tuskr: 'Tuskr',
  csv: 'CSV',
}

// Xray Cloud and Server/Data Center have genuinely different auth and
// credential fields (design.md D-X2) — the only source in this family
// needing a mode toggle at all.
type XrayMode = 'cloud' | 'server'

// The exact column set/order internal/csvcases.FixedColumns recognizes on
// import (add-csv-import-export design.md D4/D5) — mirrored here so the
// downloadable template and the real backend contract can never drift
// silently apart.
const CSV_FIXED_COLUMNS = [
  'Title',
  'Description',
  'Expected Result',
  'Priority',
  'Tags',
  'Platform',
  'Test Type',
  'Automated',
]

type CsvImportResult = { created: number; newFields: string[]; problems: { row: number; reason: string }[] }

function downloadCSVTemplate() {
  const blob = new Blob([CSV_FIXED_COLUMNS.join(',') + '\n'], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'testpulse-cases-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

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
  const { t } = useTranslation()
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
  const [apiToken, setApiToken] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [qaseBaseUrl, setQaseBaseUrl] = useState('')
  const [qaseAdvancedOpen, setQaseAdvancedOpen] = useState(false)
  const [zephyrScaleProjectKey, setZephyrScaleProjectKey] = useState('')
  const [kiwiSiteUrl, setKiwiSiteUrl] = useState('')
  const [kiwiUsername, setKiwiUsername] = useState('')
  const [kiwiPassword, setKiwiPassword] = useState('')
  const [kiwiProduct, setKiwiProduct] = useState('')
  const [xrayMode, setXrayMode] = useState<XrayMode>('cloud')
  const [xrayClientId, setXrayClientId] = useState('')
  const [xrayClientSecret, setXrayClientSecret] = useState('')
  const [xrayProjectId, setXrayProjectId] = useState('')
  const [xraySiteUrl, setXraySiteUrl] = useState('')
  const [xrayPat, setXrayPat] = useState('')
  const [xrayProjectKey, setXrayProjectKey] = useState('')
  const [tuskrTenantId, setTuskrTenantId] = useState('')
  const [tuskrToken, setTuskrToken] = useState('')
  const [tuskrProjectId, setTuskrProjectId] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvResult, setCsvResult] = useState<CsvImportResult>()
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
          setConnectError(
            data.error ?? t('ImportProjectPage.scanFailedDefault', { sourceLabel: SOURCE_LABEL[source as Source] }),
          )
          setPhase('connect')
        } else {
          setDryRunJob(data)
        }
      } else {
        if (data.status === 'succeeded') {
          setRealJob(data)
          setPhase('result')
        } else if (data.status === 'failed') {
          setImportError(data.error ?? t('ImportProjectPage.importFailedDefault'))
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
    return <p className="text-sm text-muted-foreground">{t('ImportProjectPage.noPermissionMessage')}</p>
  }
  if (
    source !== 'testrail' &&
    source !== 'qase' &&
    source !== 'zephyr-scale' &&
    source !== 'kiwi-tcms' &&
    source !== 'xray' &&
    source !== 'tuskr' &&
    source !== 'csv'
  ) {
    return <p className="text-sm text-muted-foreground">{t('ImportProjectPage.unknownSourceMessage', { source })}</p>
  }

  const targetChosen = targetMode === 'new' ? newProjectName.trim().length > 0 : existingProjectKey.length > 0
  const canSubmitConnect =
    source === 'testrail'
      ? siteUrl.trim().length > 0 &&
        email.trim().length > 0 &&
        apiKey.length > 0 &&
        testRailProjectId.trim().length > 0 &&
        targetChosen
      : source === 'qase'
        ? apiToken.length > 0 && projectCode.trim().length > 0 && targetChosen
        : source === 'zephyr-scale'
          ? apiToken.length > 0 && zephyrScaleProjectKey.trim().length > 0 && targetChosen
          : source === 'kiwi-tcms'
            ? kiwiSiteUrl.trim().length > 0 &&
              kiwiUsername.trim().length > 0 &&
              kiwiPassword.length > 0 &&
              kiwiProduct.trim().length > 0 &&
              targetChosen
            : source === 'xray'
              ? (xrayMode === 'cloud'
                  ? xrayClientId.trim().length > 0 &&
                    xrayClientSecret.length > 0 &&
                    xrayProjectId.trim().length > 0
                  : xraySiteUrl.trim().length > 0 && xrayPat.length > 0 && xrayProjectKey.trim().length > 0) &&
                targetChosen
              : source === 'tuskr'
                ? tuskrTenantId.trim().length > 0 &&
                  tuskrToken.length > 0 &&
                  tuskrProjectId.trim().length > 0 &&
                  targetChosen
                : csvFile !== null && targetChosen

  function credentialsBody(): Record<string, string> {
    if (source === 'testrail') {
      return {
        siteUrl: siteUrl.trim(),
        email: email.trim(),
        apiKey,
        testRailProjectId: testRailProjectId.trim(),
      }
    }
    if (source === 'zephyr-scale') {
      return { apiToken, projectKey: zephyrScaleProjectKey.trim() }
    }
    if (source === 'kiwi-tcms') {
      return {
        siteUrl: kiwiSiteUrl.trim(),
        username: kiwiUsername.trim(),
        password: kiwiPassword,
        product: kiwiProduct.trim(),
      }
    }
    if (source === 'xray') {
      return xrayMode === 'cloud'
        ? {
            mode: 'cloud',
            clientId: xrayClientId.trim(),
            clientSecret: xrayClientSecret,
            projectId: xrayProjectId.trim(),
          }
        : {
            mode: 'server',
            siteUrl: xraySiteUrl.trim(),
            personalAccessToken: xrayPat,
            projectKey: xrayProjectKey.trim(),
          }
    }
    if (source === 'tuskr') {
      return {
        tenantId: tuskrTenantId.trim(),
        personalAccessToken: tuskrToken,
        projectId: tuskrProjectId.trim(),
      }
    }
    return {
      apiToken,
      projectCode: projectCode.trim(),
      ...(qaseBaseUrl.trim() ? { baseUrl: qaseBaseUrl.trim() } : {}),
    }
  }

  // Shared by every source's Connect submit: create (or select) the target
  // project. Returns undefined and sets connectError itself on failure, so
  // callers can just early-return on an undefined result.
  async function resolveTargetProject(): Promise<{ key: string; name: string } | undefined> {
    if (targetMode === 'new') {
      const { data, error, response } = await api.POST('/api/v1/projects', {
        body: { name: newProjectName.trim() },
      })
      if (!response.ok || !data) {
        setConnectError(
          (error as { error?: string } | undefined)?.error ?? t('ImportProjectPage.createProjectFailedDefault'),
        )
        return undefined
      }
      return { key: data.key, name: data.name }
    }
    const existing = emptyProjects.find((p) => p.id === existingProjectKey)
    if (!existing) {
      setConnectError(t('ImportProjectPage.chooseExistingProjectError'))
      return undefined
    }
    return { key: existing.id, name: existing.name }
  }

  async function handleConnectSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmitConnect) return
    setConnectError(undefined)
    setConnecting(true)
    try {
      const project = await resolveTargetProject()
      if (!project) return
      setTargetProject(project)

      // TS can't carry the top-level `source` narrowing into a separately
      // declared async function closure (a hoisting limitation, not a real
      // possibility of `source` being undefined here — the component
      // already returned early above if it were) — re-asserted once, not
      // re-checked, since the guard above is the actual source of truth.
      const importSource = source as Source
      const { data, error, response } = await api.POST('/api/v1/projects/{projectKey}/import-jobs', {
        params: { path: { projectKey: project.key } },
        body: { source: importSource, mode: 'dry_run', credentials: credentialsBody() },
      })
      if (!response.ok || !data) {
        setConnectError(
          (error as { error?: string } | undefined)?.error ??
            t('ImportProjectPage.scanStartFailedDefault', { sourceLabel: SOURCE_LABEL[importSource] }),
        )
        return
      }
      setDryRunJob(data)
      setPhase('scanning')
    } finally {
      setConnecting(false)
    }
  }

  // CSV has no dry run (design.md D1 — the whole operation is a local
  // parse plus a handful of writes, not a remote crawl worth previewing
  // asynchronously) — Connect submits straight into the real, synchronous
  // import and goes directly to Result, skipping scanning/preview
  // entirely. Uses fetch directly, not api.POST: openapi-fetch's generated
  // body type expects the schema's object shape, not a FormData instance
  // (same reasoning as ProfilePage.tsx's avatar upload).
  async function handleCsvConnectSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmitConnect || !csvFile) return
    setConnectError(undefined)
    setConnecting(true)
    try {
      const project = await resolveTargetProject()
      if (!project) return
      setTargetProject(project)

      const { data: folders } = await api.GET('/api/v1/projects/{projectKey}/folders', {
        params: { path: { projectKey: project.key } },
      })
      const root = folders?.items.find((f) => !f.parentFolderId)
      if (!root) {
        setConnectError(t('ImportProjectPage.csvRootFolderMissingError'))
        return
      }

      const formData = new FormData()
      formData.append('file', csvFile)
      formData.append('folderId', root.id)
      const res = await fetch(`/api/v1/projects/${project.key}/cases/import-csv`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const body = await res.json()
      if (!res.ok) {
        setConnectError(body?.error ?? t('ImportProjectPage.csvImportFailedDefault'))
        return
      }
      setCsvResult(body as CsvImportResult)
      setPhase('result')
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
    setApiToken('')
    setProjectCode('')
    setQaseBaseUrl('')
    setQaseAdvancedOpen(false)
    setZephyrScaleProjectKey('')
    setKiwiSiteUrl('')
    setKiwiUsername('')
    setKiwiPassword('')
    setKiwiProduct('')
    setXrayMode('cloud')
    setXrayClientId('')
    setXrayClientSecret('')
    setXrayProjectId('')
    setXraySiteUrl('')
    setXrayPat('')
    setXrayProjectKey('')
    setTuskrTenantId('')
    setTuskrToken('')
    setTuskrProjectId('')
    setCsvFile(null)
    setCsvResult(undefined)
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
      body: { source: source as Source, mode: 'real', credentials: credentialsBody() },
    })
    if (!response.ok || !data) {
      setImportError((error as { error?: string } | undefined)?.error ?? t('ImportProjectPage.importStartFailedDefault'))
      return
    }
    setRealJob(data)
    setPhase('importing')
  }

  const breadcrumbSegments: Crumb[] = [
    { label: t('ImportProjectPage.projectsBreadcrumb'), href: '/' },
    { label: t('ImportProjectPage.importFromBreadcrumb', { sourceLabel: SOURCE_LABEL[source] }) },
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

  const targetAction = targetMode === 'new' ? t('ImportProjectPage.creatingWord') : t('ImportProjectPage.intoWord')
  const connectSummary =
    targetProject &&
    (source === 'testrail'
      ? t('ImportProjectPage.connectSummaryTestrail', {
          site: siteUrl.replace(/^https?:\/\//, ''),
          projectId: testRailProjectId,
          email,
          targetAction,
          targetName: targetProject.name,
        })
      : source === 'qase'
        ? t('ImportProjectPage.connectSummaryQase', { projectCode, targetAction, targetName: targetProject.name })
        : source === 'zephyr-scale'
          ? t('ImportProjectPage.connectSummaryZephyrScale', {
              projectKey: zephyrScaleProjectKey,
              targetAction,
              targetName: targetProject.name,
            })
          : source === 'kiwi-tcms'
            ? t('ImportProjectPage.connectSummaryKiwiTcms', {
                site: kiwiSiteUrl.replace(/^https?:\/\//, ''),
                product: kiwiProduct,
                targetAction,
                targetName: targetProject.name,
              })
            : source === 'xray'
              ? xrayMode === 'cloud'
                ? t('ImportProjectPage.connectSummaryXrayCloud', {
                    projectId: xrayProjectId,
                    targetAction,
                    targetName: targetProject.name,
                  })
                : t('ImportProjectPage.connectSummaryXrayServer', {
                    site: xraySiteUrl.replace(/^https?:\/\//, ''),
                    projectKey: xrayProjectKey,
                    targetAction,
                    targetName: targetProject.name,
                  })
              : source === 'tuskr'
                ? t('ImportProjectPage.connectSummaryTuskr', {
                    projectId: tuskrProjectId,
                    targetAction,
                    targetName: targetProject.name,
                  })
                : t('ImportProjectPage.connectSummaryCsv', {
                    fileName: csvFile?.name,
                    targetAction,
                    targetName: targetProject.name,
                  }))

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={breadcrumbSegments} />

      <div>
        <h1 className="tp-heading text-2xl">{t('ImportProjectPage.importFromHeading', { sourceLabel: SOURCE_LABEL[source] })}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {source === 'testrail'
            ? t('ImportProjectPage.descriptionTestrail')
            : source === 'qase'
              ? t('ImportProjectPage.descriptionQase')
              : source === 'zephyr-scale'
                ? t('ImportProjectPage.descriptionZephyrScale')
                : source === 'kiwi-tcms'
                  ? t('ImportProjectPage.descriptionKiwiTcms')
                  : source === 'xray'
                    ? t('ImportProjectPage.descriptionXray')
                    : source === 'tuskr'
                      ? t('ImportProjectPage.descriptionTuskr')
                      : t('ImportProjectPage.descriptionCsv')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('ImportProjectPage.connectToHeading', { sourceLabel: SOURCE_LABEL[source] })}</CardTitle>
        </CardHeader>
        <CardContent>
          {phase === 'connect' ? (
            <form onSubmit={source === 'csv' ? handleCsvConnectSubmit : handleConnectSubmit} className="space-y-4">
              {source === 'testrail' ? (
                <>
                  <p className="text-sm text-muted-foreground">{t('ImportProjectPage.testrailIntro')}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="testrail-site-url">{t('ImportProjectPage.testrailSiteUrlLabel')}</Label>
                      <Input
                        id="testrail-site-url"
                        value={siteUrl}
                        onChange={(e) => setSiteUrl(e.target.value)}
                        placeholder={t('ImportProjectPage.testrailSiteUrlPlaceholder')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="testrail-project-id">{t('ImportProjectPage.testrailProjectIdLabel')}</Label>
                      <Input
                        id="testrail-project-id"
                        value={testRailProjectId}
                        onChange={(e) => setTestRailProjectId(e.target.value)}
                        placeholder={t('ImportProjectPage.testrailProjectIdPlaceholder')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="testrail-email">{t('ImportProjectPage.testrailEmailLabel')}</Label>
                      <Input
                        id="testrail-email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('ImportProjectPage.testrailEmailPlaceholder')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="testrail-api-key">{t('ImportProjectPage.testrailApiKeyLabel')}</Label>
                      <Input
                        id="testrail-api-key"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t('ImportProjectPage.testrailCredentialHintPrefix')}{' '}
                    <strong className="font-semibold">{t('ImportProjectPage.testrailCredentialHintBold')}</strong>.
                  </p>

                  <p className="text-xs text-muted-foreground">{t('ImportProjectPage.testrailTrademarkNotice')}</p>
                </>
              ) : source === 'qase' ? (
                <>
                  <p className="text-sm text-muted-foreground">{t('ImportProjectPage.qaseIntro')}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="qase-api-token">{t('ImportProjectPage.qaseApiTokenLabel')}</Label>
                      <Input
                        id="qase-api-token"
                        type="password"
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="qase-project-code">{t('ImportProjectPage.qaseProjectCodeLabel')}</Label>
                      <Input
                        id="qase-project-code"
                        value={projectCode}
                        onChange={(e) => setProjectCode(e.target.value)}
                        placeholder={t('ImportProjectPage.qaseProjectCodePlaceholder')}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t('ImportProjectPage.qaseCredentialHintPrefix')}{' '}
                    <strong className="font-semibold">{t('ImportProjectPage.qaseCredentialHintBold')}</strong>.
                  </p>

                  {qaseAdvancedOpen ? (
                    <div className="max-w-sm space-y-1">
                      <Label htmlFor="qase-base-url">{t('ImportProjectPage.qaseBaseUrlLabel')}</Label>
                      <Input
                        id="qase-base-url"
                        value={qaseBaseUrl}
                        onChange={(e) => setQaseBaseUrl(e.target.value)}
                        placeholder={t('ImportProjectPage.qaseBaseUrlPlaceholder')}
                      />
                      <p className="text-xs text-muted-foreground">{t('ImportProjectPage.qaseBaseUrlHint')}</p>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-0"
                      onClick={() => setQaseAdvancedOpen(true)}
                    >
                      {t('ImportProjectPage.qaseAdvancedButton')}
                    </Button>
                  )}

                  <p className="text-xs text-muted-foreground">{t('ImportProjectPage.qaseTrademarkNotice')}</p>
                </>
              ) : source === 'zephyr-scale' ? (
                <>
                  <p className="text-sm text-muted-foreground">{t('ImportProjectPage.zephyrScaleIntro')}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="zephyr-scale-api-token">{t('ImportProjectPage.zephyrScaleApiTokenLabel')}</Label>
                      <Input
                        id="zephyr-scale-api-token"
                        type="password"
                        value={apiToken}
                        onChange={(e) => setApiToken(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="zephyr-scale-project-key">{t('ImportProjectPage.zephyrScaleProjectKeyLabel')}</Label>
                      <Input
                        id="zephyr-scale-project-key"
                        value={zephyrScaleProjectKey}
                        onChange={(e) => setZephyrScaleProjectKey(e.target.value)}
                        placeholder={t('ImportProjectPage.zephyrScaleProjectKeyPlaceholder')}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t('ImportProjectPage.zephyrScaleCredentialHintPrefix')}{' '}
                    <strong className="font-semibold">{t('ImportProjectPage.zephyrScaleCredentialHintBold')}</strong>
                    {t('ImportProjectPage.zephyrScaleCredentialHintSuffix')}
                  </p>

                  <p className="text-xs text-muted-foreground">{t('ImportProjectPage.zephyrScaleTrademarkNotice')}</p>
                </>
              ) : source === 'kiwi-tcms' ? (
                <>
                  <p className="text-sm text-muted-foreground">{t('ImportProjectPage.kiwiTcmsIntro')}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="kiwi-site-url">{t('ImportProjectPage.kiwiSiteUrlLabel')}</Label>
                      <Input
                        id="kiwi-site-url"
                        value={kiwiSiteUrl}
                        onChange={(e) => setKiwiSiteUrl(e.target.value)}
                        placeholder={t('ImportProjectPage.kiwiSiteUrlPlaceholder')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="kiwi-username">{t('ImportProjectPage.kiwiUsernameLabel')}</Label>
                      <Input id="kiwi-username" value={kiwiUsername} onChange={(e) => setKiwiUsername(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="kiwi-password">{t('ImportProjectPage.kiwiPasswordLabel')}</Label>
                      <Input
                        id="kiwi-password"
                        type="password"
                        value={kiwiPassword}
                        onChange={(e) => setKiwiPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="kiwi-product">{t('ImportProjectPage.kiwiProductLabel')}</Label>
                      <Input
                        id="kiwi-product"
                        value={kiwiProduct}
                        onChange={(e) => setKiwiProduct(e.target.value)}
                        placeholder={t('ImportProjectPage.kiwiProductPlaceholder')}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">{t('ImportProjectPage.kiwiCredentialHint')}</p>

                  <p className="text-xs text-muted-foreground">{t('ImportProjectPage.kiwiTrademarkNotice')}</p>
                </>
              ) : source === 'xray' ? (
                <>
                  <p className="text-sm text-muted-foreground">{t('ImportProjectPage.xrayIntro')}</p>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={xrayMode === 'cloud' ? 'default' : 'outline'}
                      aria-pressed={xrayMode === 'cloud'}
                      onClick={() => setXrayMode('cloud')}
                    >
                      {t('ImportProjectPage.xrayModeCloudButton')}
                    </Button>
                    <Button
                      type="button"
                      variant={xrayMode === 'server' ? 'default' : 'outline'}
                      aria-pressed={xrayMode === 'server'}
                      onClick={() => setXrayMode('server')}
                    >
                      {t('ImportProjectPage.xrayModeServerButton')}
                    </Button>
                  </div>

                  {xrayMode === 'cloud' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="xray-client-id">{t('ImportProjectPage.xrayClientIdLabel')}</Label>
                        <Input
                          id="xray-client-id"
                          value={xrayClientId}
                          onChange={(e) => setXrayClientId(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="xray-client-secret">{t('ImportProjectPage.xrayClientSecretLabel')}</Label>
                        <Input
                          id="xray-client-secret"
                          type="password"
                          value={xrayClientSecret}
                          onChange={(e) => setXrayClientSecret(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="xray-project-id">{t('ImportProjectPage.xrayProjectIdLabel')}</Label>
                        <Input
                          id="xray-project-id"
                          value={xrayProjectId}
                          onChange={(e) => setXrayProjectId(e.target.value)}
                          placeholder={t('ImportProjectPage.xrayProjectIdPlaceholder')}
                        />
                        <p className="text-xs text-muted-foreground">{t('ImportProjectPage.xrayProjectIdHint')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="xray-site-url">{t('ImportProjectPage.xraySiteUrlLabel')}</Label>
                        <Input
                          id="xray-site-url"
                          value={xraySiteUrl}
                          onChange={(e) => setXraySiteUrl(e.target.value)}
                          placeholder={t('ImportProjectPage.xraySiteUrlPlaceholder')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="xray-pat">{t('ImportProjectPage.xrayPatLabel')}</Label>
                        <Input
                          id="xray-pat"
                          type="password"
                          value={xrayPat}
                          onChange={(e) => setXrayPat(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="xray-project-key">{t('ImportProjectPage.xrayProjectKeyLabel')}</Label>
                        <Input
                          id="xray-project-key"
                          value={xrayProjectKey}
                          onChange={(e) => setXrayProjectKey(e.target.value)}
                          placeholder={t('ImportProjectPage.xrayProjectKeyPlaceholder')}
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {t('ImportProjectPage.xrayCredentialHintPrefix')}{' '}
                    <strong className="font-semibold">{t('ImportProjectPage.xrayCredentialHintBold')}</strong>
                    {t('ImportProjectPage.xrayCredentialHintSuffix')}
                  </p>

                  <p className="text-xs text-muted-foreground">{t('ImportProjectPage.xrayTrademarkNotice')}</p>
                </>
              ) : source === 'tuskr' ? (
                <>
                  <p className="text-sm text-muted-foreground">{t('ImportProjectPage.tuskrIntro')}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="tuskr-tenant-id">{t('ImportProjectPage.tuskrTenantIdLabel')}</Label>
                      <Input
                        id="tuskr-tenant-id"
                        value={tuskrTenantId}
                        onChange={(e) => setTuskrTenantId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tuskr-token">{t('ImportProjectPage.tuskrTokenLabel')}</Label>
                      <Input
                        id="tuskr-token"
                        type="password"
                        value={tuskrToken}
                        onChange={(e) => setTuskrToken(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tuskr-project-id">{t('ImportProjectPage.tuskrProjectIdLabel')}</Label>
                      <Input
                        id="tuskr-project-id"
                        value={tuskrProjectId}
                        onChange={(e) => setTuskrProjectId(e.target.value)}
                        placeholder={t('ImportProjectPage.tuskrProjectIdPlaceholder')}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t('ImportProjectPage.tuskrCredentialHintPrefix')}{' '}
                    <strong className="font-semibold">{t('ImportProjectPage.tuskrCredentialHintBold')}</strong>.
                  </p>

                  <p className="text-xs text-muted-foreground">{t('ImportProjectPage.tuskrTrademarkNotice')}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t('ImportProjectPage.csvIntro')}</p>

                  <div className="max-w-sm space-y-1">
                    <Label htmlFor="csv-file">{t('ImportProjectPage.csvFileLabel')}</Label>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                    />
                    {csvFile && <p className="text-xs text-muted-foreground">{csvFile.name}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={downloadCSVTemplate}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t('ImportProjectPage.downloadTemplateButton')}
                  </button>

                  <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    {t('ImportProjectPage.csvExpectedColumnsPrefix')}{' '}
                    <code className="font-mono">{CSV_FIXED_COLUMNS.join(', ')}</code>
                    {t('ImportProjectPage.csvExpectedColumnsSuffix')}
                  </p>
                </>
              )}

              <div className="space-y-2">
                <Label>{t('ImportProjectPage.importIntoLabel')}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={targetMode === 'new' ? 'default' : 'outline'}
                    aria-pressed={targetMode === 'new'}
                    onClick={() => setTargetMode('new')}
                  >
                    {t('ImportProjectPage.newProjectButton')}
                  </Button>
                  <Button
                    type="button"
                    variant={targetMode === 'existing' ? 'default' : 'outline'}
                    aria-pressed={targetMode === 'existing'}
                    onClick={() => setTargetMode('existing')}
                  >
                    {t('ImportProjectPage.existingEmptyProjectButton')}
                  </Button>
                </div>

                {targetMode === 'new' ? (
                  <div className="max-w-sm space-y-1">
                    <Label htmlFor="new-project-name">{t('ImportProjectPage.newProjectNameLabel')}</Label>
                    <Input
                      id="new-project-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder={t('ImportProjectPage.newProjectNamePlaceholder')}
                    />
                  </div>
                ) : (
                  <div className="max-w-sm space-y-1">
                    <Label htmlFor="existing-project">{t('ImportProjectPage.existingProjectLabel')}</Label>
                    <select
                      id="existing-project"
                      className={SELECT_CLASSNAME}
                      value={existingProjectKey}
                      onChange={(e) => setExistingProjectKey(e.target.value)}
                    >
                      <option value="">{t('ImportProjectPage.selectProjectOption')}</option>
                      {emptyProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">{t('ImportProjectPage.existingProjectHint')}</p>
                  </div>
                )}
              </div>

              {connectError && <p className="text-sm text-destructive">{connectError}</p>}

              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" asChild>
                  <Link to="/">{t('ImportProjectPage.cancelButton')}</Link>
                </Button>
                <Button type="submit" disabled={!canSubmitConnect || connecting}>
                  {source === 'csv'
                    ? connecting
                      ? t('ImportProjectPage.importingEllipsis')
                      : t('ImportProjectPage.importCasesButton')
                    : connecting
                      ? t('ImportProjectPage.startingScanEllipsis')
                      : t('ImportProjectPage.previewImportButton')}
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
                {t('ImportProjectPage.editConnectionButton')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {phase === 'scanning' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {t('ImportProjectPage.scanningMessage', { sourceLabel: SOURCE_LABEL[source] })}
            </p>
          </CardContent>
        </Card>
      )}

      {phase === 'preview' && dryRunJob && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">{t('ImportProjectPage.previewHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <StatTile value={folderCount} label={t('ImportProjectPage.foldersLabel')} />
              <StatTile value={caseCount} label={t('ImportProjectPage.casesLabel')} />
            </div>

            {unmapped.length > 0 && (
              <div className="space-y-2 rounded-lg border border-secondary/30 bg-secondary/10 p-3">
                <div className="flex items-start gap-2">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">
                    {t('ImportProjectPage.customFieldsWontImport', { count: unmapped.length })}
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
              {t('ImportProjectPage.previewHistoryNotePrefix')}{' '}
              <strong className="font-semibold text-foreground">{t('ImportProjectPage.previewHistoryNoteBold')}</strong>{' '}
              {t('ImportProjectPage.previewHistoryNoteSuffix', { sourceLabel: SOURCE_LABEL[source] })}
            </p>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={handleStartOver}>
                {t('ImportProjectPage.startOverButton')}
              </Button>
              <Button type="button" onClick={() => setConfirmOpen(true)}>
                {t('ImportProjectPage.importCaseCountButton', { count: caseCount, plural: caseCount === 1 ? '' : 's' })}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'importing' && realJob && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading">{t('ImportProjectPage.importingHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importError ? (
              <p className="text-sm text-destructive">{importError}</p>
            ) : (
              <>
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium tabular-nums">
                    {t('ImportProjectPage.progressMessage', { current: progressCurrent, total: progressTotal })}
                  </p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{t('ImportProjectPage.importingHint')}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {phase === 'result' && source === 'csv' && csvResult && targetProject && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading flex items-center gap-2">
              <CheckCircle2Icon className="size-5 text-primary" aria-hidden="true" />
              {t('ImportProjectPage.importCompleteHeading')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <StatTile
                value={csvResult.created}
                label={t('ImportProjectPage.casesLabel')}
                href={`/projects/${targetProject.key}/library`}
              />
            </div>

            {csvResult.newFields.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('ImportProjectPage.newFieldsCreatedPrefix', {
                  count: csvResult.newFields.length,
                  plural: csvResult.newFields.length === 1 ? '' : 's',
                })}{' '}
                <strong className="font-semibold text-foreground">{csvResult.newFields.join(', ')}</strong>.
              </p>
            )}

            {csvResult.problems.length > 0 && (
              <div className="space-y-2 rounded-lg border border-secondary/30 bg-secondary/10 p-3">
                <div className="flex items-start gap-2">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">
                    {t('ImportProjectPage.rowsCouldntImport', {
                      count: csvResult.problems.length,
                      plural: csvResult.problems.length === 1 ? '' : 's',
                    })}
                  </p>
                </div>
                <ul className="ml-1 max-h-64 space-y-1 overflow-y-auto text-sm">
                  {csvResult.problems.map((p) => (
                    <li key={p.row} className="flex gap-2">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {t('ImportProjectPage.rowLabel', { row: p.row })}
                      </span>
                      <span>{p.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end border-t pt-4">
              <Button asChild>
                <Link to={`/projects/${targetProject.key}`}>
                  {t('ImportProjectPage.openProjectLink', { name: targetProject.name })}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'result' && source !== 'csv' && realJob && targetProject && (
        <Card>
          <CardHeader>
            <CardTitle className="tp-heading flex items-center gap-2">
              <CheckCircle2Icon className="size-5 text-primary" aria-hidden="true" />
              {t('ImportProjectPage.importCompleteHeading')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <StatTile
                value={resultFolderCount}
                label={t('ImportProjectPage.foldersLabel')}
                href={`/projects/${targetProject.key}/library`}
              />
              <StatTile
                value={resultCaseCount}
                label={t('ImportProjectPage.casesLabel')}
                href={`/projects/${targetProject.key}/library`}
              />
            </div>

            {resultUnmapped.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('ImportProjectPage.resultUnmappedMessage', { count: resultUnmapped.length })}
              </p>
            )}

            <div className="flex justify-end border-t pt-4">
              <Button asChild>
                <Link to={`/projects/${targetProject.key}`}>
                  {t('ImportProjectPage.openProjectLink', { name: targetProject.name })}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {t('ImportProjectPage.confirmImportDialogTitle', {
              count: caseCount,
              plural: caseCount === 1 ? '' : 's',
              name: targetProject?.name,
            })}
          </DialogTitle>
          <DialogDescription>
            {t('ImportProjectPage.confirmImportDialogDescription', {
              folderCount,
              folderPlural: folderCount === 1 ? '' : 's',
              count: caseCount,
              plural: caseCount === 1 ? '' : 's',
              name: targetProject?.name,
            })}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('ImportProjectPage.cancelButton')}
            </Button>
            <Button onClick={() => void handleConfirmImport()}>
              {t('ImportProjectPage.importCaseCountButton', { count: caseCount, plural: caseCount === 1 ? '' : 's' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
