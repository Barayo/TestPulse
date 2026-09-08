import type { ReactNode } from 'react'
import { FileTextIcon, ScrollTextIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { CaseStepsList } from '@/components/CaseStepsList'
import { GherkinView } from '@/components/GherkinEditor'
import type { components } from '@testpulse/shared/api'

type CaseContent = components['schemas']['CaseContent']

// Format-aware read view, shared by CaseDetailPage (current version,
// editable elsewhere) and RunItemDetailPage (a pinned, historical version)
// — mirrors CaseStepsList's role but dispatches on content.format instead
// of assuming steps (add-case-authoring-formats). CaseStepsList itself
// stays steps-only; this wraps it rather than absorbing its logic.
export function caseContentHeading(format: CaseContent['format']): string {
  if (format === 'text') return 'Description'
  if (format === 'gherkin') return 'Scenario'
  return 'Steps'
}

export function CaseContentView({
  content,
  emptyStateAction,
  projectKey,
}: {
  content: Pick<CaseContent, 'format' | 'steps' | 'description' | 'gherkinSource'>
  emptyStateAction?: ReactNode
  projectKey?: string
}) {
  if (content.format === 'text') {
    if (!content.description?.trim()) {
      return (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <FileTextIcon className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mb-1 text-sm font-medium">No description yet</p>
          <p className="mb-4 text-sm text-muted-foreground">Add a description to explain this test scenario.</p>
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
          <p className="mb-1 text-sm font-medium">No scenario yet</p>
          <p className="mb-4 text-sm text-muted-foreground">Write the Given/When/Then steps for this scenario.</p>
          {emptyStateAction}
        </div>
      )
    }
    return <GherkinView source={content.gherkinSource} />
  }

  return <CaseStepsList steps={content.steps} emptyStateAction={emptyStateAction} projectKey={projectKey} />
}
