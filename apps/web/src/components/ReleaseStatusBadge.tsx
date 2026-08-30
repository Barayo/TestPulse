import { Badge } from '@/components/ui/badge'
import type { components } from '@testpulse/shared/api'

type ReleaseStatus = components['schemas']['ReleaseStatus']

// Active reuses the exact bg-primary/10 text-primary tint design-system.md
// already uses for the "current version" pill; Maintained is a solid muted
// chip; EOL reuses the plain outline Badge already used for "Closed" runs —
// EOL is this domain's "closed" (introduce-release-test-plan, Pepe's mock).
export function ReleaseStatusBadge({ status }: { status: ReleaseStatus }) {
  if (status === 'active') return <Badge className="border-transparent bg-primary/10 text-primary">Active</Badge>
  if (status === 'maintained') return <Badge className="border-transparent bg-muted text-foreground">Maintained</Badge>
  return <Badge variant="outline">EOL</Badge>
}
