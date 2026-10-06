import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Mirrors ReleasesSettingsCard's rationale exactly (add-requirements-traceability):
// ProjectPage.tsx has no persistent sidebar nav, so an opt-in entity that
// most projects won't use gets its entry point here rather than a
// permanent landing-page slot. Creation itself happens on RequirementsPage
// (its own dialog), not duplicated here.
export function RequirementsSettingsCard({ projectKey }: { projectKey: string }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('RequirementsSettingsCard.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('RequirementsSettingsCard.description')}</p>
        <Button type="button" variant="outline" asChild>
          <Link to={`/projects/${projectKey}/requirements`}>{t('RequirementsSettingsCard.manageRequirementsLink')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
