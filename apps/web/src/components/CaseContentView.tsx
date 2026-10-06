import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FileTextIcon, ScrollTextIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { CaseStepsList } from '@/components/CaseStepsList'
import { GherkinView } from '@/components/GherkinEditor'
import i18n from '@/i18n'
import type { components } from '@testpulse/shared/api'

type CaseContent = components['schemas']['CaseContent']

// Format-aware read view, shared by CaseDetailPage (current version,
// editable elsewhere) and RunItemDetailPage (a pinned, historical version)
// — mirrors CaseStepsList's role but dispatches on content.format instead
// of assuming steps (add-case-authoring-formats). CaseStepsList itself
// stays steps-only; this wraps it rather than absorbing its logic.
export function caseContentHeading(format: CaseContent['format']): string {
  if (format === 'text') return i18n.t('CaseContentView.description')
  if (format === 'gherkin') return i18n.t('CaseContentView.scenario')
  return i18n.t('CaseContentView.steps')
}

export function CaseContentView({
  content,
  emptyStateAction,
  projectKey,
}: {
  content: Pick<CaseContent, 'format' | 'steps' | 'description' | 'gherkinSource' | 'parameters'>
  emptyStateAction?: ReactNode
  projectKey?: string
}) {
  const { t } = useTranslation()
  if (content.format === 'text') {
    if (!content.description?.trim()) {
      return (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <FileTextIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mb-1 text-sm font-medium">{t('CaseContentView.noDescriptionYet')}</p>
          <p className="mb-4 text-sm text-muted-foreground">{t('CaseContentView.noDescriptionHint')}</p>
          {emptyStateAction}
        </div>
      )
    }
    return (
      <Card>
        <CardContent className="whitespace-pre-wrap text-base leading-relaxed">{content.description}</CardContent>
      </Card>
    )
  }

  if (content.format === 'gherkin') {
    if (!content.gherkinSource?.trim()) {
      return (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <ScrollTextIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mb-1 text-sm font-medium">{t('CaseContentView.noScenarioYet')}</p>
          <p className="mb-4 text-sm text-muted-foreground">{t('CaseContentView.noScenarioHint')}</p>
          {emptyStateAction}
        </div>
      )
    }
    return <GherkinView source={content.gherkinSource} />
  }

  return (
    <CaseStepsList
      steps={content.steps}
      emptyStateAction={emptyStateAction}
      projectKey={projectKey}
      parameterColumns={content.parameters?.columns.filter((c) => c !== 'Name')}
    />
  )
}
