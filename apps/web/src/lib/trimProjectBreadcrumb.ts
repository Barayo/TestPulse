import type { Crumb } from '@/components/Breadcrumbs'

// The header's project chip (rework-project-nav-identity) persistently
// shows "which project" on every project-scoped page, so the leading
// "Projects › {Project}" pair every page used to hand-build is dropped here
// centrally instead of duplicated per page. A trailing segment that would
// just repeat the current page's own heading is dropped too — that
// information already lives in the page's own <h1>.
export function trimProjectBreadcrumb(segments: Crumb[], currentPageHeading?: string): Crumb[] {
  const [, , ...rest] = segments
  if (currentPageHeading && rest.length > 0 && rest[rest.length - 1].label === currentPageHeading) {
    return rest.slice(0, -1)
  }
  return rest
}
