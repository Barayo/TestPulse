export type Theme = 'light' | 'dark'

// An explicit override always wins; with none, the live OS preference
// decides (add-dark-mode-toggle) — the same "manual beats computed
// default" shape resolveViewMode already uses for view mode.
export function resolveTheme(override: Theme | null, prefersDark: boolean): Theme {
  if (override) return override
  return prefersDark ? 'dark' : 'light'
}
