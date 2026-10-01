import type { components } from '@testpulse/shared/api'
import { api } from '@/lib/api'

export type ClientErrorReport = components['schemas']['ClientErrorReport']

// Fire-and-forget (add-frontend-error-reporting design.md D2): never
// awaited by callers, and a failure to deliver the report itself is
// swallowed rather than surfaced — there's nothing more useful to do with
// it, and re-reporting it would recurse (guarded separately in api.ts's
// errorReportingMiddleware, D5).
export function reportClientError(report: ClientErrorReport): void {
  api.POST('/api/v1/client-errors', { body: report }).catch(() => {})
}
