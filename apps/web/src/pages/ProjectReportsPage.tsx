import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trimProjectBreadcrumb } from '@/lib/trimProjectBreadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RunStatusBreakdown } from '@/components/RunStatusBreakdown'
import { FlakyPill } from '@/components/Pills'
import { useProjectReadAccess } from '@/lib/useProjectPermissions'
import { useAuth } from '@/lib/useAuth'
import type { components } from '@testpulse/shared/api'

type Project = components['schemas']['Project']
type ProjectStatusSummary = components['schemas']['ProjectStatusSummary']
type FlakyCase = components['schemas']['FlakyCase']

export default function ProjectReportsPage() {
  const { t } = useTranslation()
  const { projectKey } = useParams<{ projectKey: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const access = useProjectReadAccess(projectKey, user, authLoading)
  const [project, setProject] = useState<Project>()
  const [notFound, setNotFound] = useState(false)
  const [summary, setSummary] = useState<ProjectStatusSummary>()
  const [flaky, setFlaky] = useState<FlakyCase[]>([])

  const load = useCallback(async () => {
    if (!projectKey || access === 'loading') return
    setNotFound(false)
    const [{ data: p }, { data: sum }, { data: fl }] =
      access === 'member'
        ? await Promise.all([
            api.GET('/api/v1/projects/{projectKey}', { params: { path: { projectKey } } }),
            api.GET('/api/v1/projects/{projectKey}/runs/status-summary', { params: { path: { projectKey } } }),
            api.GET('/api/v1/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } } }),
          ])
        : await Promise.all([
            api.GET('/api/v1/public/projects/{projectKey}', { params: { path: { projectKey } } }),
            api.GET('/api/v1/public/projects/{projectKey}/runs/status-summary', { params: { path: { projectKey } } }),
            api.GET('/api/v1/public/projects/{projectKey}/flaky-cases', { params: { path: { projectKey } } }),
          ])
    if (!p) {
      setNotFound(true)
      return
    }
    setProject(p)
    setSummary(sum)
    setFlaky((fl ?? []).slice().sort((a, b) => b.rate - a.rate))
  }, [projectKey, access])

  useEffect(() => {
    void load()
  }, [load])

  if (!projectKey) return null
  if (notFound) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('ProjectReportsPage.notFoundMessage')}{' '}
        <Link to="/" className="underline">
          {t('ProjectReportsPage.goToProjectsLink')}
        </Link>
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        segments={trimProjectBreadcrumb(
          [
            { label: t('ProjectReportsPage.projectsBreadcrumb'), href: '/' },
            { label: project?.name ?? '', href: `/projects/${projectKey}` },
            { label: t('ProjectReportsPage.reportsBreadcrumb') },
          ],
          t('ProjectReportsPage.reportsBreadcrumb'),
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('ProjectReportsPage.statusBreakdownHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RunStatusBreakdown
            total={summary?.total ?? 0}
            counts={summary?.counts ?? {}}
            emptyMessage={t('ProjectReportsPage.statusBreakdownEmptyMessage')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('ProjectReportsPage.flakyCasesHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          {flaky.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ProjectReportsPage.noFlakyCasesMessage')}</p>
          ) : (
            <ul aria-label={t('ProjectReportsPage.flakyCasesAriaLabel')} className="divide-y rounded-md border text-sm">
              {flaky.map((f) => (
                <li key={f.caseKey} className="flex items-center gap-3 px-3 py-2">
                  <Link
                    to={`/projects/${projectKey}/cases/${f.caseKey}`}
                    className="min-w-0 flex-1 truncate font-medium text-primary hover:text-primary/70"
                  >
                    {f.caseTitle}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{f.caseKey}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {t('ProjectReportsPage.versionLabel', { version: f.currentVersion })}
                  </span>
                  <FlakyPill />
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{f.rate}%</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tp-heading">{t('ProjectReportsPage.compareRunsHeading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => navigate(`/projects/${projectKey}/runs/compare`)}>
            {t('ProjectReportsPage.compareRunsButton')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
