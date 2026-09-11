import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Mirrors ReleasesSettingsCard's rationale exactly (add-requirements-traceability):
// ProjectPage.tsx has no persistent sidebar nav, so an opt-in entity that
// most projects won't use gets its entry point here rather than a
// permanent landing-page slot. Creation itself happens on RequirementsPage
// (its own dialog), not duplicated here.
export function RequirementsSettingsCard({ projectKey }: { projectKey: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Requirements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Optional: link test cases to requirements and see a per-Release coverage matrix. Most projects never need
          this — cases and runs work fine without it.
        </p>
        <Button type="button" variant="outline" asChild>
          <Link to={`/projects/${projectKey}/requirements`}>Manage requirements →</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
