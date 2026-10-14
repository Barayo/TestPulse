import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { useBumpDataRevision } from '@/lib/DataRevision'
import { assignRunItems } from '@/lib/assignRunItems'
import { AssignDialog, type AssigneePick } from '@/components/AssignDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CasePicker, type CasePickerCase } from '@/components/CasePicker'
import { useProjectPermissions } from '@/lib/useProjectPermissions'
import type { components } from '@testpulse/shared/api'

type TestCase = components['schemas']['TestCase']
type Project = components['schemas']['Project']
type Suite = components['schemas']['Suite']
type Folder = components['schemas']['Folder']
type TestPlan = components['schemas']['TestPlan']
type Release = components['schemas']['Release']

type NewRunLocationState = {
  seedFromSuiteKey?: string
  seedFromTestPlanKey?: string
  seedName?: string
} | null

function toGridCase(c: TestCase): CasePickerCase {
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

export default function NewRunPage() {
  const { t } = useTranslation()
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const bumpLanding = useBumpDataRevision()
  const permissions = useProjectPermissions(projectKey)
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [cases, setCases] = useState<TestCase[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [suites, setSuites] = useState<Suite[]>([])
  const [plans, setPlans] = useState<TestPlan[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [runName, setRunName] = useState('')
  const [defaultAssignee, setDefaultAssignee] = useState<AssigneePick | null>(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedSuiteKey, setSelectedSuiteKey] = useState('')
  const [seededFromSuiteName, setSeededFromSuiteName] = useState('')
  const [configuration, setConfiguration] = useState('')
  const [selectedTestPlanKey, setSelectedTestPlanKey] = useState('')
  const [seededFromTestPlanName, setSeededFromTestPlanName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const justSeededNameRef = useRef(false)

  const load = useCallback(async () => {
    if (!projectKey) return
    setNotFound(false)
    try {
      const [{ data: p }, c, f, s, { data: pl }, { data: rel }] = await Promise.all([
        api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
        fetchAllPages((cursor) =>
          api.GET('/api/v1/projects/{projectKey}/cases', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        ),
        fetchAllPages((cursor) =>
          api.GET('/api/v1/projects/{projectKey}/folders', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        ),
        fetchAllPages((cursor) =>
          api.GET('/api/v1/projects/{projectKey}/suites', { params: { path: { projectKey }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        ),
        api.GET('/api/v1/projects/{projectKey}/plans', { params: { path: { projectKey } } }),
        api.GET('/api/v1/projects/{projectKey}/releases', { params: { path: { projectKey } } }),
      ])
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      setCases(c.items)
      setFolders(f.items)
      setSuites(s.items)
      setPlans(pl ?? [])
      setReleases(rel ?? [])
    } catch {
      setCases([])
      setFolders([])
      setSuites([])
      setPlans([])
      setReleases([])
    } finally {
      setLoaded(true)
    }
  }, [projectKey])

  useEffect(() => {
    void load()
  }, [load])

  // Deep-link handoff from a suite's "Run suite" → "Customize selection"
  // (rework-run-creation-ux) — one-shot route-state seeding, not a durable
  // binding: a hard refresh simply shows the form in its normal empty state.
  useEffect(() => {
    if (!loaded) return
    const state = location.state as NewRunLocationState
    if (!state?.seedFromSuiteKey && !state?.seedFromTestPlanKey) return
    if (state.seedFromSuiteKey) seedSelectionFromSuite(state.seedFromSuiteKey)
    if (state.seedFromTestPlanKey) seedTestPlan(state.seedFromTestPlanKey)
    if (state.seedName) {
      setRunName(state.seedName)
      justSeededNameRef.current = true
    }
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // Focus + select the seeded name once it's actually committed to the DOM
  // (rework-suite-run-flow design.md D5) — the value arrives via the effect
  // above, after mount, so selecting immediately there would race React's
  // commit and select the input's still-empty previous value. Guarded so a
  // later run-of-the-mill edit to `runName` (typing) never re-triggers this.
  useEffect(() => {
    if (!justSeededNameRef.current) return
    justSeededNameRef.current = false
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [runName])

  function seedSelectionFromSuite(suiteKey: string) {
    const suite = suites.find((s) => s.key === suiteKey)
    if (!suite) return
    const keys = new Set(suite.caseIds.map((id) => cases.find((c) => c.id === id)?.key ?? id))
    setSelected(keys)
    setSelectedSuiteKey(suiteKey)
    setSeededFromSuiteName(suite.name)
  }

  function handleSuiteChange(suiteKey: string) {
    if (!suiteKey) {
      setSelectedSuiteKey('')
      setSeededFromSuiteName('')
      setSelected(new Set())
      return
    }
    seedSelectionFromSuite(suiteKey)
  }

  function seedTestPlan(testPlanKey: string) {
    const plan = plans.find((p) => p.key === testPlanKey)
    if (!plan) return
    setSelectedTestPlanKey(testPlanKey)
    setSeededFromTestPlanName(plan.name)
  }

  function handleTestPlanChange(testPlanKey: string) {
    setSelectedTestPlanKey(testPlanKey)
    setSeededFromTestPlanName('')
  }

  function toggleCase(caseKey: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(caseKey)) next.delete(caseKey)
      else next.add(caseKey)
      return next
    })
  }

  // Bidirectional Shift+Click/Shift+Space range-toggle (redesign-case-picker-membership).
  function toggleCaseRange(caseKeys: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of caseKeys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  async function handleCreateRun(e: FormEvent) {
    e.preventDefault()
    if (!projectKey || !runName.trim() || !loaded || selected.size === 0) return
    const { data } = await api.POST('/api/v1/projects/{projectKey}/runs', {
      params: { path: { projectKey } },
      body: {
        name: runName,
        caseKeys: Array.from(selected),
        ...(selectedSuiteKey ? { suiteKey: selectedSuiteKey } : {}),
        ...(selectedTestPlanKey ? { testPlanKey: selectedTestPlanKey } : {}),
        ...(configuration.trim() ? { configuration: configuration.trim() } : {}),
      },
    })
    bumpLanding()
    if (data) {
      if (defaultAssignee) {
        const { items: createdItems } = await fetchAllPages((cursor) =>
          api.GET('/api/v1/runs/{runKey}/items', { params: { path: { runKey: data.key }, query: { cursor, limit: 200 } } }).then(({ data }) => data ?? { items: [], nextCursor: null }),
        )
        await assignRunItems(createdItems.map((item) => item.id), defaultAssignee)
      }
      navigate(`/runs/${data.key}`, { state: { justCreated: true } })
    }
  }

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('NewRunPage.projectNotFound')} <Link to="/" className="underline">{t('NewRunPage.goToProjects')}</Link>
      </p>
    )
  }
  // permissions !== undefined distinguishes "still loading" from "loaded
  // and confirmed missing" — matching ProjectSettingsPage's identical
  // whole-page gate — so a user who does have runCreate never sees a
  // false "denied" flash before their permissions resolve
  // (unify-authenticated-and-public-views tasks.md 2.8).
  if (permissions !== undefined && !permissions.runCreate) {
    return <p className="text-sm text-muted-foreground">{t('NewRunPage.noPermission')}</p>
  }

  const gridCases = cases.map(toGridCase)
  const canCreate = loaded && runName.trim().length > 0 && selected.size > 0

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={[
          { label: t('NewRunPage.projectsBreadcrumb'), href: '/' },
          { label: project?.name ?? '', href: `/projects/${projectKey}` },
          { label: t('NewRunPage.runsBreadcrumb'), href: `/projects/${projectKey}/runs` },
          { label: t('NewRunPage.newRunBreadcrumb') },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('NewRunPage.heading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRun} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="run-name">{t('NewRunPage.nameLabel')}</Label>
                <Input
                  id="run-name"
                  ref={nameInputRef}
                  value={runName}
                  onChange={(e) => setRunName(e.target.value)}
                  placeholder={t('NewRunPage.namePlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="run-suite">{t('NewRunPage.suiteLabel')}</Label>
                <select
                  id="run-suite"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={selectedSuiteKey}
                  onChange={(e) => handleSuiteChange(e.target.value)}
                >
                  <option value="">{t('NewRunPage.noSuiteOption')}</option>
                  {suites.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name} ({s.caseIds.length} {s.caseIds.length === 1 ? t('NewRunPage.caseSingular') : t('NewRunPage.casePlural')})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="run-configuration">{t('NewRunPage.configurationLabel')}</Label>
                <Input
                  id="run-configuration"
                  value={configuration}
                  onChange={(e) => setConfiguration(e.target.value)}
                  placeholder={t('NewRunPage.configurationPlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="run-default-assignee">{t('NewRunPage.defaultAssigneeLabel')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    id="run-default-assignee"
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                    onClick={() => setAssignDialogOpen(true)}
                  >
                    {defaultAssignee ? defaultAssignee.label : t('NewRunPage.assignEveryItemPlaceholder')}
                  </Button>
                  {defaultAssignee && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('NewRunPage.clearDefaultAssigneeAriaLabel')}
                      onClick={() => setDefaultAssignee(null)}
                    >
                      {t('NewRunPage.clearButton')}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {selectedSuiteKey && (
              <p className="text-sm text-muted-foreground">
                {t('NewRunPage.preFilledFromLabel')}{' '}
                <span className="font-medium text-foreground">{seededFromSuiteName}</span>{' '}
                {t('NewRunPage.preFilledFromSuiteSuffix')}
              </p>
            )}

            {plans.length > 0 && (
              <div className="max-w-70 space-y-1">
                <Label htmlFor="run-test-plan">{t('NewRunPage.testPlanLabel')}</Label>
                <select
                  id="run-test-plan"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={selectedTestPlanKey}
                  onChange={(e) => handleTestPlanChange(e.target.value)}
                >
                  <option value="">{t('NewRunPage.noTestPlanOption')}</option>
                  {releases.map((release) => {
                    const releasePlans = plans.filter((p) => p.releaseKey === release.key)
                    if (releasePlans.length === 0) return null
                    return (
                      <optgroup key={release.key} label={release.name}>
                        {releasePlans.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </div>
            )}

            {seededFromTestPlanName && (
              <p className="text-sm text-muted-foreground">
                {t('NewRunPage.preFilledFromLabel')}{' '}
                <span className="font-medium text-foreground">{seededFromTestPlanName}</span>{' '}
                {t('NewRunPage.preFilledFromPlanSuffix')}
              </p>
            )}

            <CasePicker
              cases={gridCases}
              folders={folders}
              selected={selected}
              onToggle={toggleCase}
              onToggleRange={toggleCaseRange}
            />

            <div className="flex items-center justify-between rounded-md border bg-accent px-4 py-2.5">
              <span className="text-sm font-medium">
                {selected.size === 0 ? t('NewRunPage.noCasesSelected') : t('NewRunPage.selectedCount', { count: selected.size })}
              </span>
              <Button type="submit" disabled={!canCreate}>
                {t('NewRunPage.createRunButton')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        projectKey={projectKey}
        title={t('NewRunPage.defaultAssigneeDialogTitle')}
        onAssign={setDefaultAssignee}
      />
    </div>
  )
}
