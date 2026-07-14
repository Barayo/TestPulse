export type ViewMode = 'expanded' | 'compact'

const DESKTOP_EXPANDED_THRESHOLD = 10

// Mobile always wins — there is no manual toggle on mobile at all (design
// D1). On desktop, an explicit manual choice beats the project-count
// default; with no override, small counts stay legible as expanded cards
// and large counts fall back to a dense compact list.
export function resolveViewMode(
  projectCount: number,
  isMobile: boolean,
  manualOverride: ViewMode | null,
): ViewMode {
  if (isMobile) return 'compact'
  if (manualOverride) return manualOverride
  return projectCount <= DESKTOP_EXPANDED_THRESHOLD ? 'expanded' : 'compact'
}
