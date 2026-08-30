import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// The entry point for a project's very first Release lives here, not on
// the project landing page (introduce-release-test-plan, Pepe's mock) —
// ProjectPage.tsx has no persistent sidebar nav, so a rarely-used opt-in
// entity shouldn't get a permanent slot there just to be discoverable
// once. Settings is already where opt-in project configuration lives
// (public access, auto-archive). Creation itself happens on ReleasesPage
// (its own dialog), not duplicated here.
export function ReleasesSettingsCard({ projectKey }: { projectKey: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Releases</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Optional: group runs under long-lived releases (2026.1, 2026.2…) and per-platform test plans. Most projects
          never need this — runs work fine directly under the project, exactly as today.
        </p>
        <Button type="button" variant="outline" asChild>
          <Link to={`/projects/${projectKey}/releases`}>Manage releases →</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
