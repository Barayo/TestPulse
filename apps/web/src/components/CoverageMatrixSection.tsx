import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Grid3x3Icon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { dotClass } from '@/components/StatusBadge'
import type { components } from '@testpulse/shared/api'

type CoverageMatrix = components['schemas']['CoverageMatrix']

// New section on TestPlanDetailPage.tsx below the existing plan-grid
// (add-run-configurations, #129, design.md D4/Pepe's validated mock):
// case x configuration pivot, sticky first column + overflow-x-auto
// mirroring CaseParametersView.tsx's wide-content-scroll idiom. Column
// headers only carry runKey/label per the finalized API contract — Pepe's
// mock additionally sketched a run-name sub-line and open/closed badge
// per column, neither of which the contract returns, so this renders the
// label alone, linked to the run.
export function CoverageMatrixSection({ matrix }: { matrix: CoverageMatrix }) {
  const { t } = useTranslation()

  const totalCombinations = matrix.configurations.length * matrix.cases.length
  const filledCombinations = matrix.cases.reduce((sum, c) => sum + Object.keys(c.cells).length, 0)
  const gapCount = totalCombinations - filledCombinations

  if (matrix.cases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="tp-heading text-lg">{t('CoverageMatrix.heading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <Grid3x3Icon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mb-1 text-sm font-medium">{t('CoverageMatrix.emptyHeading')}</p>
            <p className="text-sm text-muted-foreground">{t('CoverageMatrix.emptySub')}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="tp-heading text-lg">{t('CoverageMatrix.heading')}</CardTitle>
        {gapCount > 0 && (
          <Badge variant="outline" className="gap-1.5">
            <span className={`size-2 rounded-full ${dotClass.pending}`} aria-hidden="true" />
            {t(gapCount === 1 ? 'CoverageMatrix.gapChipSingular' : 'CoverageMatrix.gapChipPlural', { count: gapCount })}
          </Badge>
        )}
      </CardHeader>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-(--card-spacing) pb-3 text-sm text-muted-foreground">
        <span>{t(matrix.configurations.length === 1 ? 'CoverageMatrix.configurationCountSingular' : 'CoverageMatrix.configurationCountPlural', { count: matrix.configurations.length })}</span>
        <span aria-hidden="true">&middot;</span>
        <span>{t(matrix.cases.length === 1 ? 'CoverageMatrix.caseCountSingular' : 'CoverageMatrix.caseCountPlural', { count: matrix.cases.length })}</span>
        <span aria-hidden="true">&middot;</span>
        <span>{t('CoverageMatrix.combinationsRunCount', { filled: filledCombinations, total: totalCombinations })}</span>
      </div>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/70">
              <th className="sticky left-0 z-10 border-b bg-muted px-3 py-2 text-left font-semibold whitespace-nowrap">
                {t('CoverageMatrix.caseColumnHeader')}
              </th>
              {matrix.configurations.map((config) => (
                <th key={config.runKey} className="border-b px-3 py-2 text-center font-semibold whitespace-nowrap">
                  <Link to={`/runs/${config.runKey}`} className="text-primary hover:underline">
                    {config.label}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.cases.map((c) => (
              <tr key={c.caseKey} className="hover:bg-muted/50 last:[&_td]:border-b-0">
                <td className="sticky left-0 z-10 border-b bg-muted px-3 py-2 font-medium whitespace-nowrap">{c.title}</td>
                {matrix.configurations.map((config) => {
                  const cell = c.cells[config.runKey]
                  return (
                    <td key={config.runKey} className="border-b px-3 py-2 text-center whitespace-nowrap">
                      {cell ? (
                        <Link
                          to={`/runs/${config.runKey}/items/${c.caseKey}`}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent"
                        >
                          <span className={`size-2 rounded-full ${dotClass[cell.status]}`} aria-hidden="true" />
                          <span className="tp-label">{cell.status}</span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground" title={t('CoverageMatrix.gapCellTitle')}>
                          &mdash;
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
